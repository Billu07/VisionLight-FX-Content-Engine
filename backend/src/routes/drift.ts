import { Router, Response } from "express";
import multer from "multer";
import axios from "axios";
import archiver from "archiver";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { prisma } from "../services/database";
import {
  authenticateToken,
  requireSuperAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { AuthService } from "../services/auth";
import { uploadManagedBuffer } from "../utils/managedStorage";
import { buildSpinFromVideo } from "../services/rotation3d/pipeline";
import { enqueueProcessing, processingQueueDepth } from "../services/rotation3d/processingQueue";
import { buildShareCard } from "../services/rotation3d/shareCard";
import { streamDriftExportZip, renderCaptionedFramePng } from "../services/driftExport";
import {
  cloudflareConfigured,
  createCustomHostname,
  getCustomHostname,
  deleteCustomHostname,
  DRIFT_DOMAIN_TARGET,
} from "../services/cloudflareDomains";

// Drift (drift.li) — a separate product line running the same interactive
// spin/path player as Rotation3D, but with its own brand orgs
// (Organization.productLine = "DRIFT"), admin tab, landing, and player features:
// per-product loop toggle, on-frame text captions, and an optional linked second
// clip (2-clip seamless loop). It reuses the Rotation3D frame pipeline + storage
// (namespaced under "drift/") but never touches Rotation3D data.

const router = Router();
const NS = "drift"; // storage namespace + product line log tag
const DOMAIN = "drift.li";

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `drift-upload-${crypto.randomUUID()}.mp4`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
  "product";

// Generate a slug unique within the org (append a short suffix on collision).
const uniqueSlug = async (organizationId: string, name: string) => {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${crypto.randomBytes(2).toString("hex")}`;
    const clash = await prisma.driftProduct.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    });
    if (!clash) return slug;
  }
  return `${base}-${crypto.randomBytes(4).toString("hex")}`;
};

// Top-level path segments reserved by the app (a brand slug can't be one).
const RESERVED_SLUGS = new Set([
  "p", "embed", "admin", "studios", "projects", "pricing", "terms", "privacy",
  "reset-password", "support-handoff", "auth", "billing", "demo", "rotation3d",
  "drift", "api", "www", "b", "assets", "favicon",
]);

// Globally-unique vanity slug for an organization.
const uniqueOrgSlug = async (name: string): Promise<string> => {
  const base = slugify(name);
  for (let i = 0; i < 8; i++) {
    const slug = i === 0 ? base : `${base}-${crypto.randomBytes(2).toString("hex")}`;
    if (RESERVED_SLUGS.has(slug)) continue;
    const clash = await prisma.organization.findFirst({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${crypto.randomBytes(4).toString("hex")}`;
};

// Resilient read of an org's slug (null if the column isn't migrated yet).
const orgSlug = async (organizationId: string): Promise<string | null> => {
  try {
    const o = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    });
    return o?.slug || null;
  } catch {
    return null;
  }
};

const cta = (v: unknown) => {
  if (!v || typeof v !== "object") return undefined;
  const o = v as any;
  const label = typeof o.label === "string" ? o.label.slice(0, 40) : "";
  const url = typeof o.url === "string" ? o.url.slice(0, 2000) : "";
  // A CTA can open a lead-capture form instead of a link (formId set → the
  // player shows the in-page form overlay rather than navigating to url).
  const formId = typeof o.formId === "string" && o.formId ? o.formId.slice(0, 40) : null;
  return { label, url, formId };
};

// Normalize one caption from client input. Returns null for empty text.
const clamp01 = (n: unknown, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;
};
const sanitizeCaption = (c: any, index: number) => {
  const text = String(c?.text ?? "").slice(0, 300);
  if (!text.trim()) return null;
  const sf = Math.max(0, Math.floor(Number(c?.startFrame) || 0));
  const ef = Math.max(sf, Math.floor(Number(c?.endFrame) || sf));
  const size = Number(c?.fontSize);
  const weight = Number(c?.fontWeight);
  return {
    clip: c?.clip === "B" ? "B" : "A",
    text,
    startFrame: sf,
    endFrame: ef,
    x: clamp01(c?.x, 0.5),
    y: clamp01(c?.y, 0.5),
    color: typeof c?.color === "string" && c.color ? c.color.slice(0, 20) : "#ffffff",
    fontSize: Number.isFinite(size) ? Math.min(0.4, Math.max(0.01, size)) : 0.05,
    fontWeight: [400, 500, 600, 700, 800].includes(weight) ? weight : 600,
    background: typeof c?.background === "string" && c.background ? c.background.slice(0, 20) : null,
    align: ["left", "center", "right"].includes(c?.align) ? c.align : "center",
    order: Math.max(0, Math.floor(Number(c?.order))) || index,
  };
};

// Build the spin for a product's clip in the background (shared by primary and
// second-clip uploads). Reuses the Rotation3D pipeline under the drift/ storage
// namespace so Drift frames never mix with Rotation3D's.
const processClip = (opts: {
  clip: "A" | "B";
  productId: string;
  orgId: string;
  videoPath: string;
  mimetype: string;
  uploaderId: string | null;
  frameCount: number;
  removal: "white" | "black" | "ai" | "none";
}) => {
  const { clip, productId, orgId, videoPath, mimetype, uploaderId, frameCount, removal } = opts;
  {
    const d = processingQueueDepth();
    console.log(
      `[${NS}] product ${productId} clip ${clip} queued (active ${d.active}/${d.concurrency}, waiting ${d.waiting})`,
    );
  }
  void enqueueProcessing(async () => {
    try {
      const buf = await fs.readFile(videoPath);
      const videoUrl = await uploadManagedBuffer({
        buffer: buf,
        contentType: mimetype || "video/mp4",
        keyPrefix: `${NS}/org_${orgId}/product_${productId}/video_${clip.toLowerCase()}`,
        fallbackExtension: "mp4",
      });
      await prisma.driftVideo.create({
        data: { productId, url: videoUrl, clip, status: "PROCESSING", uploadedByUserId: uploaderId },
      });

      const manifest = await buildSpinFromVideo({
        videoPath,
        organizationId: orgId,
        productId,
        frameCount,
        removal,
        keyNamespace: NS,
      });

      if (clip === "A") {
        await prisma.driftSpin.upsert({
          where: { productId },
          create: { productId, frameCount: manifest.frameCount, manifest: manifest as any, status: "READY" },
          update: { frameCount: manifest.frameCount, manifest: manifest as any, status: "READY" },
        });
        await prisma.driftProduct.update({
          where: { id: productId },
          data: {
            status: "READY",
            defaultFrame: manifest.defaultFrame,
            background: manifest.detectedBg ?? null,
          },
        });
      } else {
        // Second clip attaches to an existing spin (the product already has clip A).
        await prisma.driftSpin.update({
          where: { productId },
          data: { secondFrameCount: manifest.frameCount, secondManifest: manifest as any },
        });
      }
      console.log(`[${NS}] product ${productId} clip ${clip} READY (${manifest.frameCount} frames)`);
    } catch (err: any) {
      console.error(`Drift pipeline error (clip ${clip}):`, err);
      if (clip === "A") {
        await prisma.driftProduct
          .update({ where: { id: productId }, data: { status: "FAILED" } })
          .catch(() => undefined);
      }
    } finally {
      await fs.rm(videoPath, { force: true }).catch(() => undefined);
    }
  }).catch(() => undefined);
};

// ─────────────────────────── TEAM (SuperAdmin) ───────────────────────────

// List Drift brand organizations.
router.get(
  "/api/drift/brands",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const brands = await prisma.organization.findMany({
      where: { productLine: "DRIFT" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { driftProducts: true } },
      },
    });
    res.json({ brands });
  },
);

// Create a Drift brand organization, optionally provisioning its admin login.
router.post(
  "/api/drift/brands",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const name = String(req.body?.name || "").trim();
    const adminEmail = String(req.body?.adminEmail || "").trim().toLowerCase();
    const adminName = String(req.body?.adminName || "").trim() || name;
    if (!name) return res.status(400).json({ error: "Brand name is required" });
    if (adminEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
      return res.status(400).json({ error: "Invalid admin email" });
    }

    const org = await prisma.organization.create({
      data: {
        name,
        productLine: "DRIFT",
        provisioningSource: "MANUAL",
        routingDomain: DOMAIN,
      },
      select: { id: true, name: true, createdAt: true },
    });

    let slug: string | null = null;
    try {
      slug = await uniqueOrgSlug(name);
      await prisma.organization.update({ where: { id: org.id }, data: { slug } });
    } catch {
      slug = null;
    }

    let admin: { email: string; tempPassword?: string; reused?: boolean } | undefined;
    if (adminEmail) {
      const tempPassword = crypto.randomBytes(9).toString("base64url");
      try {
        const created: any = await AuthService.createSystemUser(
          adminEmail,
          tempPassword,
          adminName,
          "DRIFT",
          3,
          org.id,
          "ADMIN",
        );
        admin = created?.authIdentityReused
          ? { email: adminEmail, reused: true }
          : { email: adminEmail, tempPassword };
      } catch (e: any) {
        return res.status(201).json({
          brand: org,
          adminError: e?.message || "Failed to create brand admin",
        });
      }
    }
    res.status(201).json({ brand: { ...org, slug }, admin });
  },
);

// Set / rename a brand's vanity slug (superadmin).
router.patch(
  "/api/drift/brands/:orgId/slug",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const raw = slugify(String(req.body?.slug || ""));
    if (!raw || RESERVED_SLUGS.has(raw)) {
      return res.status(400).json({ error: "That slug is reserved or invalid" });
    }
    try {
      const clash = await prisma.organization.findFirst({
        where: { slug: raw, id: { not: req.params.orgId } },
        select: { id: true },
      });
      if (clash) return res.status(409).json({ error: "That slug is already taken" });
      await prisma.organization.update({ where: { id: req.params.orgId }, data: { slug: raw } });
      res.json({ slug: raw });
    } catch {
      res.status(500).json({ error: "Slug not available yet (pending DB update)" });
    }
  },
);

// List a brand's products (with spin + counts) for the team console.
router.get(
  "/api/drift/brands/:orgId/products",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const products = await prisma.driftProduct.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        spin: { select: { frameCount: true, secondFrameCount: true, status: true } },
        _count: { select: { sourceImages: true, videos: true, captions: true } },
      },
    });
    res.json({ products, brandSlug: await orgSlug(orgId) });
  },
);

// Source images a brand has sent in (raw product photos) for the team to work from.
router.get(
  "/api/drift/brands/:orgId/source-images",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const images = await prisma.driftSourceImage.findMany({
      where: { organizationId: req.params.orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        angleLabel: true,
        productLabel: true,
        productId: true,
        createdAt: true,
      },
    });
    res.json({ images });
  },
);

// Download ALL of a brand's source images as one ZIP.
router.get(
  "/api/drift/brands/:orgId/source-images.zip",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.params.orgId;
    const [org, images] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      prisma.driftSourceImage.findMany({
        where: { organizationId: orgId },
        orderBy: [{ productId: "asc" }, { createdAt: "asc" }],
        select: {
          url: true,
          angleLabel: true,
          productLabel: true,
          product: { select: { name: true } },
        },
      }),
    ]);
    if (images.length === 0)
      return res.status(404).json({ error: "No source images for this brand yet" });

    const slug = (s: string) =>
      s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const brandSlug = slug(org?.name || "brand") || "brand";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${brandSlug}-source-images.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (e) => {
      console.error("Drift source-image ZIP error:", e);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const response = await axios({
          url: img.url,
          method: "GET",
          responseType: "stream",
          timeout: 15000,
        });
        const ext = img.url.split(".").pop()?.split("?")[0]?.slice(0, 5) || "jpg";
        const label = img.angleLabel ? "-" + slug(img.angleLabel) : "";
        const base = `${String(i + 1).padStart(2, "0")}${label}.${ext}`;
        const folder = img.product?.name || img.productLabel;
        const name = folder ? `${slug(folder)}/${base}` : base;
        archive.append(response.data, { name });
      } catch (e) {
        console.error(`Failed to add drift source image ${img.url} to zip:`, e);
      }
    }
    await archive.finalize();
  },
);

// Team uploads a rendered clip video for a brand → pipeline builds the spin (clip A).
router.post(
  "/api/drift/brands/:orgId/products",
  authenticateToken,
  requireSuperAdmin,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const name = String(req.body?.name || "").trim();
    const frameCount = Number(req.body?.frameCount) || 48;
    const bgMode = String(req.body?.bgMode || "keep");
    let removal: "white" | "black" | "ai" | "none" = "none";
    if (bgMode === "remove-white") removal = "white";
    else if (bgMode === "remove-black") removal = "black";
    else if (bgMode === "ai") removal = "ai";
    const loopEnabled = req.body?.loopEnabled === undefined ? true : req.body.loopEnabled !== "false" && !!req.body.loopEnabled;
    const file = req.file;
    if (!name) {
      if (file?.path) await fs.rm(file.path, { force: true }).catch(() => undefined);
      return res.status(400).json({ error: "Product name is required" });
    }
    if (!file) return res.status(400).json({ error: "A video file is required" });

    const org = await prisma.organization.findFirst({
      where: { id: orgId, productLine: "DRIFT" },
      select: { id: true },
    });
    if (!org) {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
      return res.status(404).json({ error: "Drift brand not found" });
    }

    const slug = await uniqueSlug(orgId, name);
    const product = await prisma.driftProduct.create({
      data: {
        organizationId: orgId,
        slug,
        name,
        status: "PROCESSING",
        loopEnabled,
        createdByUserId: req.user?.id || null,
      },
    });

    res.status(201).json({ product });

    processClip({
      clip: "A",
      productId: product.id,
      orgId,
      videoPath: file.path,
      mimetype: file.mimetype,
      uploaderId: req.user?.id || null,
      frameCount,
      removal,
    });
  },
);

// Attach / replace the linked SECOND clip (clip B) for a product (superadmin).
// On the player, reaching the end of clip A and continuing the reverse leg plays
// clip B (a 2-clip seamless loop).
router.post(
  "/api/drift/brands/:orgId/products/:id/second-clip",
  authenticateToken,
  requireSuperAdmin,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId, id } = req.params;
    const frameCount = Number(req.body?.frameCount) || 48;
    const bgMode = String(req.body?.bgMode || "keep");
    let removal: "white" | "black" | "ai" | "none" = "none";
    if (bgMode === "remove-white") removal = "white";
    else if (bgMode === "remove-black") removal = "black";
    else if (bgMode === "ai") removal = "ai";
    const file = req.file;
    if (!file) return res.status(400).json({ error: "A video file is required" });

    const product = await prisma.driftProduct.findFirst({
      where: { id, organizationId: orgId },
      include: { spin: { select: { id: true } } },
    });
    if (!product) {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
      return res.status(404).json({ error: "Drift product not found" });
    }
    if (!product.spin) {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
      return res.status(409).json({ error: "Build the primary clip first" });
    }

    res.status(202).json({ ok: true, productId: id });

    processClip({
      clip: "B",
      productId: id,
      orgId,
      videoPath: file.path,
      mimetype: file.mimetype,
      uploaderId: req.user?.id || null,
      frameCount,
      removal,
    });
  },
);

// Remove the linked second clip.
router.delete(
  "/api/drift/brands/:orgId/products/:id/second-clip",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId, id } = req.params;
    const product = await prisma.driftProduct.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: "Drift product not found" });
    await prisma.driftSpin.updateMany({
      where: { productId: id },
      data: { secondFrameCount: null, secondManifest: undefined },
    });
    await prisma.driftVideo.deleteMany({ where: { productId: id, clip: "B" } });
    res.json({ ok: true });
  },
);

// Superadmin edits a brand's product as the brand admin would (point 4:
// superadmin brand-view sub-tab). Org-scoped by :orgId.
router.patch(
  "/api/drift/brands/:orgId/products/:id",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId, id } = req.params;
    const owned = await prisma.driftProduct.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Product not found" });
    const product = await applyProductPatch(orgId, owned.id, req.body, res);
    if (product) res.json({ product });
  },
);

// Delete a Drift brand and everything under it. Guarded to DRIFT orgs only.
router.delete(
  "/api/drift/brands/:orgId",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const org = await prisma.organization.findFirst({
      where: { id: orgId, productLine: "DRIFT" },
      select: { id: true },
    });
    if (!org) return res.status(404).json({ error: "Drift brand not found" });
    await prisma.organization.delete({ where: { id: orgId } });
    res.json({ ok: true });
  },
);

// All ready/published products across brands, for landing-showcase curation.
router.get(
  "/api/drift/products",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const products = await prisma.driftProduct.findMany({
      where: { status: { in: ["READY", "PUBLISHED"] } },
      orderBy: [{ heroFeatured: "desc" }, { featured: "desc" }, { featuredRank: "asc" }, { createdAt: "desc" }],
      include: {
        spin: { select: { manifest: true } },
        organization: { select: { name: true } },
      },
    });
    const list = products.map((p) => {
      const m = (p.spin?.manifest as any) || {};
      const frames = Array.isArray(m.frames) ? m.frames : [];
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        featured: p.featured,
        heroFeatured: p.heroFeatured,
        featuredRank: p.featuredRank,
        brandName: p.organization?.name || "",
        thumb: frames[p.defaultFrame] || frames[0] || null,
      };
    });
    res.json({ products: list });
  },
);

// Toggle a product's landing placement (showcase grid and/or the single hero).
router.patch(
  "/api/drift/products/:id/feature",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const data: Record<string, unknown> = {};
    if (typeof req.body?.featured === "boolean") data.featured = req.body.featured;
    const rankRaw = Number(req.body?.featuredRank);
    if (Number.isFinite(rankRaw)) data.featuredRank = rankRaw;
    if (typeof req.body?.heroFeatured === "boolean") {
      data.heroFeatured = req.body.heroFeatured;
      if (req.body.heroFeatured === true) {
        await prisma.driftProduct.updateMany({
          where: { heroFeatured: true, id: { not: req.params.id } },
          data: { heroFeatured: false },
        });
      }
    }
    const product = await prisma.driftProduct.update({
      where: { id: req.params.id },
      data,
      select: { id: true, featured: true, heroFeatured: true, featuredRank: true },
    });
    res.json({ product });
  },
);

// Delete a product (cascades its spin/videos/embed/captions/events).
router.delete(
  "/api/drift/products/:id",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.driftProduct.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Product not found" });
    await prisma.driftProduct.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  },
);

// ─────────────────────────── BRAND ADMIN (org-scoped) ───────────────────────────

const requireOrg = (req: AuthenticatedRequest, res: Response): string | null => {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    res.status(403).json({ error: "No organization on this account" });
    return null;
  }
  return orgId;
};

// Shared product-patch logic (brand admin PATCH + superadmin brand-view PATCH).
// Writes error responses itself and returns null on failure.
async function applyProductPatch(
  orgId: string,
  productId: string,
  body: any,
  res: Response,
) {
  const data: Record<string, unknown> = {};
  if ("ctaPrimary" in body) data.ctaPrimary = cta(body.ctaPrimary) ?? null;
  if ("ctaSecondary" in body) data.ctaSecondary = cta(body.ctaSecondary) ?? null;
  if ("defaultFrame" in body) data.defaultFrame = Math.max(0, Number(body.defaultFrame) || 0);
  if ("background" in body) data.background = String(body.background || "").slice(0, 40);
  if (typeof body.loopEnabled === "boolean") data.loopEnabled = body.loopEnabled;
  if (typeof body.hideLogo === "boolean") data.hideLogo = body.hideLogo;
  if (typeof body.hideName === "boolean") data.hideName = body.hideName;
  if (typeof body.hideTitle === "boolean") data.hideTitle = body.hideTitle;
  if (typeof body.mobileZoom === "boolean") data.mobileZoom = body.mobileZoom;
  if ("metaPixelId" in body)
    data.metaPixelId = body.metaPixelId ? String(body.metaPixelId).replace(/[^0-9]/g, "").slice(0, 32) || null : null;
  if ("name" in body && String(body.name || "").trim())
    data.name = String(body.name).trim().slice(0, 120);
  if ("title" in body) data.title = body.title ? String(body.title).slice(0, 120) : null;
  if ("titleEnd" in body) data.titleEnd = body.titleEnd ? String(body.titleEnd).slice(0, 120) : null;
  if ("helperStart" in body)
    data.helperStart = body.helperStart ? String(body.helperStart).slice(0, 40) : null;
  if ("helperEnd" in body)
    data.helperEnd = body.helperEnd ? String(body.helperEnd).slice(0, 40) : null;
  if ("description" in body)
    data.description = body.description ? String(body.description).slice(0, 600) : null;
  if ("descriptionEnd" in body)
    data.descriptionEnd = body.descriptionEnd ? String(body.descriptionEnd).slice(0, 600) : null;
  if (typeof body.publish === "boolean") data.status = body.publish ? "PUBLISHED" : "READY";
  if (typeof body.slug === "string" && body.slug.trim()) {
    const s = slugify(body.slug);
    const clash = await prisma.driftProduct.findFirst({
      where: { organizationId: orgId, slug: s, NOT: { id: productId } },
      select: { id: true },
    });
    if (clash) {
      res.status(409).json({ error: "That product link is already taken" });
      return null;
    }
    data.slug = s;
  }
  return prisma.driftProduct.update({
    where: { id: productId },
    data,
    include: { spin: true, embed: true },
  });
}

// The brand's own products (for their dashboard + player customization).
router.get(
  "/api/drift/my/products",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const products = await prisma.driftProduct.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: { spin: true, embed: true },
    });
    res.json({ products, brandSlug: await orgSlug(orgId) });
  },
);

// Brand edits player controls: CTAs, default frame, loop, publish state, title/desc.
router.patch(
  "/api/drift/my/products/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const owned = await prisma.driftProduct.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Product not found" });
    const product = await applyProductPatch(orgId, owned.id, req.body, res);
    if (product) res.json({ product });
  },
);

// ── Captions ──────────────────────────────────────────────────────────────
// Read a product's captions. Both the brand admin (org-scoped) and superadmin
// can read; :id is validated against the caller's org unless superadmin.
router.get(
  "/api/drift/my/products/:id/captions",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const isSuper = req.user?.role === "SUPERADMIN";
    const orgId = req.user?.organizationId;
    const product = await prisma.driftProduct.findFirst({
      where: isSuper ? { id: req.params.id } : { id: req.params.id, organizationId: orgId || "" },
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const captions = await prisma.driftCaption.findMany({
      where: { productId: product.id },
      orderBy: [{ clip: "asc" }, { startFrame: "asc" }, { order: "asc" }],
    });
    res.json({ captions });
  },
);

// Replace ALL captions for a product (client sends the full array).
router.put(
  "/api/drift/my/products/:id/captions",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const isSuper = req.user?.role === "SUPERADMIN";
    const orgId = req.user?.organizationId;
    const product = await prisma.driftProduct.findFirst({
      where: isSuper ? { id: req.params.id } : { id: req.params.id, organizationId: orgId || "" },
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const incoming = Array.isArray(req.body?.captions) ? req.body.captions : [];
    if (incoming.length > 200) return res.status(400).json({ error: "Too many captions" });
    const rows = incoming
      .map((c: any, i: number) => sanitizeCaption(c, i))
      .filter(Boolean) as ReturnType<typeof sanitizeCaption>[];

    await prisma.$transaction([
      prisma.driftCaption.deleteMany({ where: { productId: product.id } }),
      ...(rows.length
        ? [
            prisma.driftCaption.createMany({
              data: rows.map((r) => ({ ...(r as object), productId: product.id })) as any,
            }),
          ]
        : []),
    ]);

    const captions = await prisma.driftCaption.findMany({
      where: { productId: product.id },
      orderBy: [{ clip: "asc" }, { startFrame: "asc" }, { order: "asc" }],
    });
    res.json({ captions });
  },
);

// Brand uploads raw product images ("send to us"). Team fulfills them later.
router.post(
  "/api/drift/my/source-images",
  authenticateToken,
  imageUpload.array("images", 60),
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: "No images uploaded" });
    const productId = req.body?.productId ? String(req.body.productId) : null;
    const productLabel = req.body?.productLabel ? String(req.body.productLabel).slice(0, 120) : null;

    const created = [];
    for (const f of files) {
      if (!f.mimetype?.startsWith("image/")) continue;
      const url = await uploadManagedBuffer({
        buffer: f.buffer,
        contentType: f.mimetype,
        keyPrefix: `${NS}/org_${orgId}/source`,
        fallbackExtension: "jpg",
      });
      const row = await prisma.driftSourceImage.create({
        data: {
          organizationId: orgId,
          productId,
          productLabel,
          url,
          uploadedByUserId: req.user?.id || null,
        },
      });
      created.push(row);
    }
    res.status(201).json({ images: created });
  },
);

// Generate / rotate an embed token (+ optional domain allowlist) for a product.
router.post(
  "/api/drift/my/products/:id/embed",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const owned = await prisma.driftProduct.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Product not found" });

    const allowedDomains = Array.isArray(req.body?.allowedDomains)
      ? req.body.allowedDomains.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean)
      : [];
    const token = crypto.randomBytes(12).toString("hex");
    const embed = await prisma.driftEmbed.upsert({
      where: { productId: owned.id },
      create: { productId: owned.id, token, allowedDomains },
      update: { token, allowedDomains },
    });
    res.json({ embed });
  },
);

// ─────────────────────────── PUBLIC (no auth) ───────────────────────────

// Any lead-forms a product's CTAs point at, keyed by id, so the player can open
// the form overlay without a second round-trip.
async function resolveCtaForms(p: any): Promise<Record<string, any>> {
  const ids = [p.ctaPrimary?.formId, p.ctaSecondary?.formId].filter(Boolean) as string[];
  if (!ids.length) return {};
  const forms = await prisma.driftForm.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, definition: true },
  });
  const map: Record<string, any> = {};
  for (const f of forms) map[f.id] = f;
  return map;
}

// Shape a full player payload for a Drift product record (with brand + spin).
const publicProductPayload = async (p: any, bc: any, orgName: string, captions: any[], orgPixelId?: string | null) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  title: p.title,
  titleEnd: p.titleEnd,
  description: p.description,
  descriptionEnd: p.descriptionEnd,
  helperStart: p.helperStart,
  helperEnd: p.helperEnd,
  defaultFrame: p.defaultFrame,
  loopEnabled: p.loopEnabled,
  hideLogo: p.hideLogo,
  hideName: p.hideName,
  hideTitle: p.hideTitle,
  mobileZoom: p.mobileZoom,
  thumbnailUrl: p.thumbnailUrl,
  metaPixelId: p.metaPixelId || orgPixelId || null,
  background: p.background,
  ctaPrimary: p.ctaPrimary,
  ctaSecondary: p.ctaSecondary,
  forms: await resolveCtaForms(p),
  brandName: bc?.companyName || orgName || "",
  logoUrl: bc?.logoUrl || null,
  primaryColor: bc?.primaryColor || null,
  secondaryColor: bc?.secondaryColor || null,
  manifest: p.spin?.manifest,
  secondManifest: p.spin?.secondManifest ?? null,
  captions,
});

// Curated products for the drift.li landing showcase (superadmin picks).
router.get("/api/drift/public/featured", async (_req: AuthenticatedRequest, res: Response) => {
  const products = await prisma.driftProduct.findMany({
    where: {
      OR: [{ featured: true }, { heroFeatured: true }],
      status: { in: ["READY", "PUBLISHED"] },
    },
    orderBy: [{ featuredRank: "asc" }, { createdAt: "desc" }],
    take: 12,
    include: { spin: { select: { manifest: true } }, organization: { select: { name: true } } },
  });
  const list = products
    .filter((p) => p.spin)
    .map((p) => ({
      id: p.id,
      name: p.name,
      defaultFrame: p.defaultFrame,
      loopEnabled: p.loopEnabled,
      background: p.background,
      thumbnailUrl: p.thumbnailUrl,
      brandName: p.organization?.name || "",
      featured: p.featured,
      heroFeatured: p.heroFeatured,
      manifest: p.spin!.manifest,
    }));
  res.json({ products: list });
});

// Brand showcase by vanity slug → drift.li/{brandSlug}
router.get("/api/drift/public/b/:brandSlug", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const org = await prisma.organization.findFirst({
      where: { slug: req.params.brandSlug, productLine: "DRIFT" },
      select: {
        id: true, name: true, slug: true,
        brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true, secondaryColor: true }, take: 1 },
      },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    const products = await prisma.driftProduct.findMany({
      where: { organizationId: org.id, status: { in: ["READY", "PUBLISHED"] } },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: { spin: { select: { manifest: true } } },
    });
    const bc = org.brandConfigs?.[0];
    res.json({
      brand: {
        name: bc?.companyName || org.name,
        slug: org.slug,
        logoUrl: bc?.logoUrl || null,
        primaryColor: bc?.primaryColor || null,
        secondaryColor: bc?.secondaryColor || null,
      },
      products: products
        .filter((p) => p.spin)
        .map((p) => ({
          id: p.id, slug: p.slug, name: p.name, defaultFrame: p.defaultFrame,
          loopEnabled: p.loopEnabled, background: p.background, thumbnailUrl: p.thumbnailUrl,
          manifest: p.spin!.manifest,
        })),
    });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

// Player by vanity slugs → drift.li/{brandSlug}/{productSlug}
router.get(
  "/api/drift/public/b/:brandSlug/:productSlug",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const org = await prisma.organization.findFirst({
        where: { slug: req.params.brandSlug, productLine: "DRIFT" },
        select: {
          id: true, name: true, slug: true, metaPixelId: true,
          brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true, secondaryColor: true }, take: 1 },
        },
      });
      if (!org) return res.status(404).json({ error: "Not found" });
      const product = await prisma.driftProduct.findFirst({
        where: { organizationId: org.id, slug: req.params.productSlug, status: { in: ["READY", "PUBLISHED"] } },
        include: { spin: true },
      });
      if (!product || !product.spin) return res.status(404).json({ error: "Not found" });
      const captions = await prisma.driftCaption.findMany({
        where: { productId: product.id },
        orderBy: [{ clip: "asc" }, { startFrame: "asc" }, { order: "asc" }],
      });
      res.json({ product: { ...(await publicProductPayload(product, org.brandConfigs?.[0], org.name, captions, org.metaPixelId)), brandSlug: org.slug } });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  },
);

// Manifest + presentation for the player. Only READY/PUBLISHED products.
router.get(
  "/api/drift/public/products/:id",
  async (req: AuthenticatedRequest, res: Response) => {
    const product = await prisma.driftProduct.findFirst({
      where: { id: req.params.id, status: { in: ["READY", "PUBLISHED"] } },
      include: {
        spin: true,
        organization: {
          select: {
            id: true,
            name: true,
            metaPixelId: true,
            brandConfigs: {
              select: { logoUrl: true, companyName: true, primaryColor: true, secondaryColor: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!product || !product.spin) return res.status(404).json({ error: "Not found" });
    const captions = await prisma.driftCaption.findMany({
      where: { productId: product.id },
      orderBy: [{ clip: "asc" }, { startFrame: "asc" }, { order: "asc" }],
    });
    const bc = product.organization?.brandConfigs?.[0];
    res.json({
      product: await publicProductPayload(product, bc, product.organization?.name || "", captions, product.organization?.metaPixelId),
    });
  },
);

// Anonymous engagement events from the player.
router.post("/api/drift/public/events", async (req: AuthenticatedRequest, res: Response) => {
  const productId = String(req.body?.productId || "");
  const type = String(req.body?.type || "").toUpperCase();
  const allowed = ["VIEW", "ROTATE", "ZOOM", "CTA_CLICK"];
  if (!productId || !allowed.includes(type)) {
    return res.status(400).json({ error: "Invalid event" });
  }
  const product = await prisma.driftProduct.findUnique({
    where: { id: productId },
    select: { organizationId: true },
  });
  if (!product) return res.status(404).json({ error: "Not found" });

  await prisma.driftEvent.create({
    data: {
      organizationId: product.organizationId,
      productId,
      type,
      meta: req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : undefined,
    },
  });
  res.json({ ok: true });
});

// Snapshot a captioned frame as the product poster. The client sends the frame
// index; we bake the frame's active captions server-side (same overlay as the
// video export → pixel-identical), upload it, and set thumbnailUrl. Owner or
// superadmin. Rendering server-side avoids canvas CORS tainting on the client.
router.post(
  "/api/drift/my/products/:id/thumbnail",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const isSuper = req.user?.role === "SUPERADMIN";
    const orgId = req.user?.organizationId;
    const product = await prisma.driftProduct.findFirst({
      where: isSuper ? { id: req.params.id } : { id: req.params.id, organizationId: orgId || "" },
      include: { spin: { select: { manifest: true } } },
    });
    if (!product || !product.spin) return res.status(404).json({ error: "Product not found" });
    const m: any = product.spin.manifest || {};
    const frames: string[] = Array.isArray(m.frames) ? m.frames : [];
    if (!frames.length) return res.status(400).json({ error: "This drift has no frames yet" });
    const frame = Math.min(Math.max(0, Math.floor(Number(req.body?.frame) || 0)), frames.length - 1);
    const frameUrl = frames[frame];
    if (!frameUrl) return res.status(400).json({ error: "That frame is unavailable" });

    try {
      const captions = await prisma.driftCaption.findMany({ where: { productId: product.id } });
      const png = await renderCaptionedFramePng({ frameUrl, captions: captions as any, frame });
      const url = await uploadManagedBuffer({
        buffer: png,
        contentType: "image/png",
        keyPrefix: `${NS}/org_${product.organizationId}/thumb`,
        fallbackExtension: "png",
      });
      const updated = await prisma.driftProduct.update({
        where: { id: product.id },
        data: { thumbnailUrl: url },
        select: { id: true, thumbnailUrl: true },
      });
      res.json({ product: updated });
    } catch (e: any) {
      console.error(`[${NS}] thumbnail render error:`, e);
      res.status(500).json({ error: "Could not save the thumbnail" });
    }
  },
);

// Reset the poster back to the default spin frame.
router.delete(
  "/api/drift/my/products/:id/thumbnail",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const isSuper = req.user?.role === "SUPERADMIN";
    const orgId = req.user?.organizationId;
    const product = await prisma.driftProduct.findFirst({
      where: isSuper ? { id: req.params.id } : { id: req.params.id, organizationId: orgId || "" },
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    await prisma.driftProduct.update({ where: { id: product.id }, data: { thumbnailUrl: null } });
    res.json({ ok: true });
  },
);

// Downloadable social "share card": start frame + QR to the product link.
router.get(
  "/api/drift/my/products/:id/share-card",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    // Owner (org-scoped) or superadmin brand-view — mirror export.zip's scoping.
    const isSuper = req.user?.role === "SUPERADMIN";
    const product = await prisma.driftProduct.findFirst({
      where: isSuper
        ? { id: req.params.id }
        : { id: req.params.id, organizationId: req.user?.organizationId || "" },
      include: { spin: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const orgId = product.organizationId;

    let org: any = null;
    try {
      org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          name: true,
          slug: true,
          brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true }, take: 1 },
        },
      });
    } catch {
      org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          name: true,
          brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true }, take: 1 },
        },
      });
    }
    const bc = org?.brandConfigs?.[0];
    const brandSlug: string | null = org?.slug || null;

    const manifest: any = product.spin?.manifest || {};
    const frames: string[] = Array.isArray(manifest.frames) ? manifest.frames : [];
    const df = Math.min(Math.max(0, product.defaultFrame || 0), Math.max(0, frames.length - 1));
    const frameUrl = frames[df] || frames[0] || null;

    const productUrl =
      brandSlug && product.slug
        ? `https://${DOMAIN}/${brandSlug}/${product.slug}`
        : `https://${DOMAIN}/p/${product.id}`;

    try {
      const png = await buildShareCard({
        productUrl,
        frameUrl,
        logoUrl: bc?.logoUrl || null,
        productName: product.name,
        brandName: bc?.companyName || org?.name || "Drift",
        primaryColor: bc?.primaryColor || null,
        poweredBy: `${DOMAIN}`,
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="${product.slug || "drift"}-share.png"`);
      res.send(png);
    } catch (e: any) {
      console.error(`[${NS}] share-card error:`, e);
      res.status(500).json({ error: "Could not generate the share card" });
    }
  },
);

// Export a ZIP of the drift as video: original.mp4 + captioned.mp4 +
// captioned-2x.mp4 (captions baked in at their frame ranges, 2-clip aware).
// Rendered server-side so it's smooth regardless of live-playback stutter.
// Owner (org-scoped) or superadmin. Heavy + in-process — on-demand only.
router.get(
  "/api/drift/my/products/:id/export.zip",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const isSuper = req.user?.role === "SUPERADMIN";
    const orgId = req.user?.organizationId;
    const product = await prisma.driftProduct.findFirst({
      where: isSuper ? { id: req.params.id } : { id: req.params.id, organizationId: orgId || "" },
      include: { spin: true },
    });
    if (!product || !product.spin) return res.status(404).json({ error: "Drift not found" });

    // Export from the ORIGINAL uploaded video(s) — not the sampled spin frames —
    // so the exported clip keeps the source's true duration + smoothness.
    const m: any = product.spin.manifest || {};
    const frameSampleUrl: string | undefined = Array.isArray(m.frames) ? m.frames[0] : undefined;
    if (!frameSampleUrl) return res.status(400).json({ error: "No frames to export" });

    const videos = await prisma.driftVideo.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "desc" },
    });
    const vA = videos.find((v) => v.clip === "A") || videos.find((v) => v.clip !== "B");
    const vB = videos.find((v) => v.clip === "B");
    if (!vA?.url) return res.status(400).json({ error: "Original video is unavailable for this drift" });

    const clips = [{ url: vA.url, frameCount: product.spin.frameCount }];
    if (vB?.url && product.spin.secondFrameCount) {
      clips.push({ url: vB.url, frameCount: product.spin.secondFrameCount });
    }

    const captions = await prisma.driftCaption.findMany({ where: { productId: product.id } });
    const baseName =
      (product.slug || "drift").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) ||
      "drift";

    try {
      await streamDriftExportZip({ clips, captions: captions as any, frameSampleUrl, baseName, res });
    } catch (e: any) {
      console.error("[drift] export failed:", e);
      if (!res.headersSent) res.status(500).json({ error: "Export failed" });
    }
  },
);

// ─────────────────────────── FORMS + LEADS ───────────────────────────
// Brands build lead-capture forms and attach them to a player CTA. Submissions
// land as DriftLead rows (Leads tab + CSV) and optionally POST to a webhook.

const FIELD_TYPES = new Set([
  "text", "email", "phone", "textarea", "select", "radio", "checkbox", "consent", "hidden",
]);

const sanitizeFormField = (f: any) => {
  if (!f || typeof f !== "object") return null;
  const type = FIELD_TYPES.has(f.type) ? f.type : "text";
  const key = (typeof f.key === "string" && f.key ? f.key : "field")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 40);
  const out: any = {
    key,
    type,
    label: typeof f.label === "string" ? f.label.slice(0, 120) : "",
    placeholder: typeof f.placeholder === "string" ? f.placeholder.slice(0, 120) : "",
    required: !!f.required,
    options: Array.isArray(f.options)
      ? f.options.slice(0, 30).map((o: any) => String(o).slice(0, 120)).filter(Boolean)
      : [],
  };
  if (type === "hidden" && typeof f.value === "string") out.value = f.value.slice(0, 300);
  return out;
};

const sanitizeFormDefinition = (raw: any) => {
  const d = raw && typeof raw === "object" ? raw : {};
  const steps = (Array.isArray(d.steps) ? d.steps : [])
    .slice(0, 10)
    .map((s: any) => ({
      title: typeof s?.title === "string" ? s.title.slice(0, 120) : "",
      fields: (Array.isArray(s?.fields) ? s.fields : [])
        .slice(0, 30)
        .map(sanitizeFormField)
        .filter(Boolean),
    }))
    .filter((s: any) => s.fields.length);
  if (!steps.length) steps.push({ title: "", fields: [] });
  const consent = d.consent && typeof d.consent === "object"
    ? { enabled: !!d.consent.enabled, text: typeof d.consent.text === "string" ? d.consent.text.slice(0, 500) : "" }
    : { enabled: false, text: "" };
  return {
    multiStep: !!d.multiStep,
    steps,
    consent,
    submitLabel: typeof d.submitLabel === "string" && d.submitLabel.trim() ? d.submitLabel.slice(0, 40) : "Submit",
    successMessage:
      typeof d.successMessage === "string" && d.successMessage.trim()
        ? d.successMessage.slice(0, 300)
        : "Thanks — we'll be in touch.",
  };
};

const allFields = (def: any): any[] =>
  (Array.isArray(def?.steps) ? def.steps : []).flatMap((s: any) => (Array.isArray(s?.fields) ? s.fields : []));

// Shared org-scoped form operations (brand /my derives org from the user;
// superadmin /brands/:orgId passes it explicitly).
async function listDriftForms(orgId: string) {
  const forms = await prisma.driftForm.findMany({
    where: { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  return forms;
}

async function createDriftForm(orgId: string, body: any) {
  return prisma.driftForm.create({
    data: {
      organizationId: orgId,
      name: String(body?.name || "Untitled form").slice(0, 120),
      definition: sanitizeFormDefinition(body?.definition) as any,
      webhookUrl: typeof body?.webhookUrl === "string" && body.webhookUrl.trim() ? body.webhookUrl.trim().slice(0, 500) : null,
    },
  });
}

async function updateDriftForm(orgId: string, id: string, body: any) {
  const owned = await prisma.driftForm.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
  if (!owned) return null;
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.slice(0, 120);
  if ("definition" in (body || {})) data.definition = sanitizeFormDefinition(body.definition) as any;
  if ("webhookUrl" in (body || {}))
    data.webhookUrl = body.webhookUrl ? String(body.webhookUrl).trim().slice(0, 500) : null;
  return prisma.driftForm.update({ where: { id: owned.id }, data });
}

async function listDriftLeads(orgId: string, filter: { formId?: string; productId?: string }) {
  return prisma.driftLead.findMany({
    where: {
      organizationId: orgId,
      ...(filter.formId ? { formId: filter.formId } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const leadsToCsv = (leads: any[]) => {
  const dataKeys = Array.from(
    new Set(leads.flatMap((l) => (l.data && typeof l.data === "object" ? Object.keys(l.data) : []))),
  );
  const header = ["createdAt", "drift", "cta", ...dataKeys];
  const rows = leads.map((l) => [
    new Date(l.createdAt).toISOString(),
    l.source?.drift || l.productId || "",
    l.source?.cta || "",
    ...dataKeys.map((k) => (l.data ? l.data[k] : "")),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
};

// ── Brand-admin form + lead endpoints (org from the logged-in user) ──
router.get("/api/drift/my/forms", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  res.json({ forms: await listDriftForms(orgId) });
});

router.post("/api/drift/my/forms", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  res.status(201).json({ form: await createDriftForm(orgId, req.body) });
});

router.patch("/api/drift/my/forms/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const form = await updateDriftForm(orgId, req.params.id, req.body);
  if (!form) return res.status(404).json({ error: "Form not found" });
  res.json({ form });
});

router.delete("/api/drift/my/forms/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  await prisma.driftForm.deleteMany({ where: { id: req.params.id, organizationId: orgId } });
  res.json({ ok: true });
});

router.get("/api/drift/my/leads", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const leads = await listDriftLeads(orgId, {
    formId: req.query.formId ? String(req.query.formId) : undefined,
    productId: req.query.productId ? String(req.query.productId) : undefined,
  });
  res.json({ leads });
});

router.get("/api/drift/my/leads.csv", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const leads = await listDriftLeads(orgId, {
    formId: req.query.formId ? String(req.query.formId) : undefined,
    productId: req.query.productId ? String(req.query.productId) : undefined,
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="drift-leads.csv"`);
  res.send(leadsToCsv(leads));
});

// ── Superadmin brand-view (org explicit in the path) ──
router.get("/api/drift/brands/:orgId/forms", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ forms: await listDriftForms(req.params.orgId) });
});
router.post("/api/drift/brands/:orgId/forms", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.status(201).json({ form: await createDriftForm(req.params.orgId, req.body) });
});
router.patch("/api/drift/brands/:orgId/forms/:id", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const form = await updateDriftForm(req.params.orgId, req.params.id, req.body);
  if (!form) return res.status(404).json({ error: "Form not found" });
  res.json({ form });
});
router.delete("/api/drift/brands/:orgId/forms/:id", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  await prisma.driftForm.deleteMany({ where: { id: req.params.id, organizationId: req.params.orgId } });
  res.json({ ok: true });
});
router.get("/api/drift/brands/:orgId/leads", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    leads: await listDriftLeads(req.params.orgId, {
      formId: req.query.formId ? String(req.query.formId) : undefined,
      productId: req.query.productId ? String(req.query.productId) : undefined,
    }),
  });
});
router.get("/api/drift/brands/:orgId/leads.csv", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const leads = await listDriftLeads(req.params.orgId, {
    formId: req.query.formId ? String(req.query.formId) : undefined,
    productId: req.query.productId ? String(req.query.productId) : undefined,
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="drift-leads.csv"`);
  res.send(leadsToCsv(leads));
});

// ── Public: fetch a form's definition + submit a lead ──
router.get("/api/drift/public/forms/:id", async (req: AuthenticatedRequest, res: Response) => {
  const form = await prisma.driftForm.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, definition: true },
  });
  if (!form) return res.status(404).json({ error: "Not found" });
  res.json({ form });
});

router.post("/api/drift/public/forms/:id/submit", async (req: AuthenticatedRequest, res: Response) => {
  const form = await prisma.driftForm.findUnique({ where: { id: req.params.id } });
  if (!form) return res.status(404).json({ error: "Form not found" });
  const def: any = form.definition || {};
  const incoming = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};
  const fields = allFields(def);

  // Keep only known keys; validate required; carry hidden defaults.
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "consent") {
      if (f.required && !incoming[f.key]) return res.status(400).json({ error: "Please provide consent to continue" });
      data[f.key] = !!incoming[f.key];
      continue;
    }
    if (f.type === "hidden") {
      data[f.key] = typeof incoming[f.key] === "string" ? String(incoming[f.key]).slice(0, 300) : f.value ?? "";
      continue;
    }
    const v = incoming[f.key];
    const val = v == null ? "" : String(v).slice(0, 2000);
    if (f.required && !val.trim()) return res.status(400).json({ error: `"${f.label || f.key}" is required` });
    data[f.key] = val;
  }
  if (def.consent?.enabled && !incoming.__consent && !fields.some((f: any) => f.type === "consent")) {
    return res.status(400).json({ error: "Please provide consent to continue" });
  }

  const productId = typeof req.body?.productId === "string" ? req.body.productId : null;
  const source = {
    drift: req.body?.source?.drift ? String(req.body.source.drift).slice(0, 160) : null,
    cta: req.body?.source?.cta ? String(req.body.source.cta).slice(0, 40) : null,
    referrer: typeof req.headers.referer === "string" ? req.headers.referer.slice(0, 300) : null,
    ua: typeof req.headers["user-agent"] === "string" ? String(req.headers["user-agent"]).slice(0, 300) : null,
  };

  const lead = await prisma.driftLead.create({
    data: {
      organizationId: form.organizationId,
      formId: form.id,
      productId: productId || null,
      data: data as any,
      source: source as any,
    },
  });

  // Fire the webhook without blocking the response (best-effort).
  if (form.webhookUrl) {
    const payload = JSON.stringify({ formId: form.id, formName: form.name, leadId: lead.id, data, source, createdAt: lead.createdAt });
    void (async () => {
      try {
        await fetch(form.webhookUrl as string, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
      } catch (e) {
        console.error(`[${NS}] lead webhook failed:`, e);
      }
    })();
  }

  res.status(201).json({ ok: true, successMessage: def.successMessage || "Thanks — we'll be in touch." });
});

// ─────────────────────────── BRAND SETTINGS ───────────────────────────
// Brand-level drift settings that live on the Organization (currently the
// default Meta Pixel id). Per-drift overrides live on DriftProduct.

const sanitizePixel = (v: unknown) =>
  typeof v === "string" && v.trim() ? String(v).replace(/[^0-9]/g, "").slice(0, 32) || null : null;

// Only accept http(s) URLs — these are rendered into an href, so a javascript:
// (or other scheme) value would be an XSS vector. Empty/invalid → null (cleared).
const sanitizeUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s.slice(0, 2048) : null;
};

async function getBrandSettings(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { metaPixelId: true, termsUrl: true, privacyUrl: true, landingHeroProductId: true },
  });
  return {
    metaPixelId: org?.metaPixelId || null,
    termsUrl: org?.termsUrl || null,
    privacyUrl: org?.privacyUrl || null,
    landingHeroProductId: org?.landingHeroProductId || null,
  };
}
async function patchBrandSettings(orgId: string, body: any) {
  const data: Record<string, unknown> = {};
  if ("metaPixelId" in (body || {})) data.metaPixelId = sanitizePixel(body.metaPixelId);
  if ("termsUrl" in (body || {})) data.termsUrl = sanitizeUrl(body.termsUrl);
  if ("privacyUrl" in (body || {})) data.privacyUrl = sanitizeUrl(body.privacyUrl);
  if ("landingHeroProductId" in (body || {})) {
    // Only accept one of THIS brand's drifts (or null to clear).
    const raw = body.landingHeroProductId;
    if (!raw) {
      data.landingHeroProductId = null;
    } else {
      const owned = await prisma.driftProduct.findFirst({
        where: { id: String(raw), organizationId: orgId },
        select: { id: true },
      });
      data.landingHeroProductId = owned ? owned.id : null;
    }
  }
  await prisma.organization.update({ where: { id: orgId }, data });
  return getBrandSettings(orgId);
}

router.get("/api/drift/my/brand-settings", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  res.json({ settings: await getBrandSettings(orgId) });
});
router.patch("/api/drift/my/brand-settings", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  res.json({ settings: await patchBrandSettings(orgId, req.body) });
});
router.get("/api/drift/brands/:orgId/brand-settings", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ settings: await getBrandSettings(req.params.orgId) });
});
router.patch("/api/drift/brands/:orgId/brand-settings", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ settings: await patchBrandSettings(req.params.orgId, req.body) });
});

// ─────────────────────────── CUSTOM DOMAINS ───────────────────────────
// Cloudflare-for-SaaS custom hostnames: a brand points their domain at our
// fallback origin and we register it with Cloudflare (SSL + proxy). Falls back
// to just recording the CNAME instructions when CF env isn't configured.

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const normHost = (v: unknown) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:.*$/, "");

const publicDomain = (d: any) => ({
  id: d.id,
  hostname: d.hostname,
  status: d.status,
  sslStatus: d.sslStatus,
  verification: d.verification,
  cnameTarget: DRIFT_DOMAIN_TARGET,
  createdAt: d.createdAt,
});

async function listDomains(orgId: string) {
  const domains = await prisma.driftDomain.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } });
  return domains.map(publicDomain);
}

async function addDomain(orgId: string, hostnameRaw: unknown) {
  const hostname = normHost(hostnameRaw);
  if (!HOSTNAME_RE.test(hostname)) return { error: "Enter a valid domain, e.g. drift.yourbrand.com" as string };
  if (/(^|\.)drift\.li$/.test(hostname)) return { error: "That's already a drift.li domain" };
  const clash = await prisma.driftDomain.findUnique({ where: { hostname }, select: { id: true } });
  if (clash) return { error: "That domain is already connected" };

  let cfHostnameId: string | null = null;
  let status = "pending";
  let sslStatus: string | null = null;
  let verification: any = { target: DRIFT_DOMAIN_TARGET };
  if (cloudflareConfigured()) {
    try {
      const cf = await createCustomHostname(hostname);
      cfHostnameId = cf.cfHostnameId;
      status = cf.status;
      sslStatus = cf.sslStatus;
      verification = cf.verification;
    } catch (e: any) {
      return { error: e?.response?.data?.errors?.[0]?.message || "Cloudflare rejected that domain" };
    }
  }
  const domain = await prisma.driftDomain.create({
    data: { organizationId: orgId, hostname, cfHostnameId, status, sslStatus, verification },
  });
  return { domain: publicDomain(domain) };
}

async function refreshDomain(orgId: string, id: string) {
  const d = await prisma.driftDomain.findFirst({ where: { id, organizationId: orgId } });
  if (!d) return { error: "Not found", code: 404 };
  if (!d.cfHostnameId || !cloudflareConfigured()) return { domain: publicDomain(d) };
  try {
    const cf = await getCustomHostname(d.cfHostnameId);
    const active = cf.status === "active" && (cf.sslStatus === "active" || !cf.sslStatus);
    const updated = await prisma.driftDomain.update({
      where: { id: d.id },
      data: { status: active ? "active" : cf.status, sslStatus: cf.sslStatus, verification: cf.verification as any },
    });
    return { domain: publicDomain(updated) };
  } catch {
    return { domain: publicDomain(d) };
  }
}

async function removeDomain(orgId: string, id: string) {
  const d = await prisma.driftDomain.findFirst({ where: { id, organizationId: orgId } });
  if (!d) return;
  if (d.cfHostnameId && cloudflareConfigured()) {
    try {
      await deleteCustomHostname(d.cfHostnameId);
    } catch {
      /* keep going — remove our record regardless */
    }
  }
  await prisma.driftDomain.delete({ where: { id: d.id } }).catch(() => undefined);
}

router.get("/api/drift/my/domains", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  res.json({ domains: await listDomains(orgId), cloudflare: cloudflareConfigured(), cnameTarget: DRIFT_DOMAIN_TARGET });
});
router.post("/api/drift/my/domains", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const r = await addDomain(orgId, req.body?.hostname);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.status(201).json(r);
});
router.post("/api/drift/my/domains/:id/refresh", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const r = await refreshDomain(orgId, req.params.id);
  if ("error" in r) return res.status(r.code || 400).json({ error: r.error });
  res.json(r);
});
router.delete("/api/drift/my/domains/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  await removeDomain(orgId, req.params.id);
  res.json({ ok: true });
});
// Superadmin brand-view
router.get("/api/drift/brands/:orgId/domains", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ domains: await listDomains(req.params.orgId), cloudflare: cloudflareConfigured(), cnameTarget: DRIFT_DOMAIN_TARGET });
});
router.post("/api/drift/brands/:orgId/domains", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const r = await addDomain(req.params.orgId, req.body?.hostname);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.status(201).json(r);
});
router.post("/api/drift/brands/:orgId/domains/:id/refresh", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const r = await refreshDomain(req.params.orgId, req.params.id);
  if ("error" in r) return res.status(r.code || 400).json({ error: r.error });
  res.json(r);
});
router.delete("/api/drift/brands/:orgId/domains/:id", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  await removeDomain(req.params.orgId, req.params.id);
  res.json({ ok: true });
});

// Public: which brand does a custom host serve? Used by the SPA when it loads on
// a domain that isn't drift.li/rotation3d, to render that brand's drift space.
router.get("/api/drift/public/resolve-host", async (req: AuthenticatedRequest, res: Response) => {
  const host = normHost(req.query.host);
  if (!host) return res.status(400).json({ error: "host is required" });
  const d = await prisma.driftDomain.findUnique({ where: { hostname: host } });
  if (!d) return res.status(404).json({ error: "Not mapped" });
  const org = await prisma.organization.findUnique({ where: { id: d.organizationId }, select: { slug: true } });
  if (!org?.slug) return res.status(404).json({ error: "Not mapped" });
  res.json({ brandSlug: org.slug, status: d.status });
});

// ─────────────────────────── ANALYTICS ───────────────────────────
// Per-brand engagement from DriftEvent (VIEW/ROTATE/ZOOM/CTA_CLICK) + leads,
// aggregated into totals, a daily series, and a per-drift breakdown.

async function buildDriftAnalytics(orgId: string, days: number) {
  const span = Math.min(365, Math.max(1, days || 30));
  const since = new Date(Date.now() - span * 86400000);
  const [events, leads, products] = await Promise.all([
    prisma.driftEvent.findMany({
      where: { organizationId: orgId, ts: { gte: since } },
      select: { type: true, ts: true, productId: true },
      take: 100000,
    }),
    prisma.driftLead.findMany({
      where: { organizationId: orgId, createdAt: { gte: since } },
      select: { createdAt: true, productId: true },
      take: 100000,
    }),
    prisma.driftProduct.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
  ]);

  const totals = { VIEW: 0, ROTATE: 0, ZOOM: 0, CTA_CLICK: 0, LEADS: leads.length };
  for (const e of events) if (e.type in totals) (totals as any)[e.type]++;

  // Daily buckets (oldest → newest), keyed YYYY-MM-DD.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const series: Record<string, { date: string; views: number; ctas: number; leads: number }> = {};
  for (let i = span - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 86400000));
    series[k] = { date: k, views: 0, ctas: 0, leads: 0 };
  }
  for (const e of events) {
    const b = series[dayKey(e.ts)];
    if (!b) continue;
    if (e.type === "VIEW") b.views++;
    else if (e.type === "CTA_CLICK") b.ctas++;
  }
  for (const l of leads) {
    const b = series[dayKey(l.createdAt)];
    if (b) b.leads++;
  }

  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  const per: Record<string, { productId: string; name: string; views: number; ctas: number; leads: number }> = {};
  const bump = (pid: string | null, key: "views" | "ctas" | "leads") => {
    if (!pid) return;
    if (!per[pid]) per[pid] = { productId: pid, name: nameOf.get(pid) || "—", views: 0, ctas: 0, leads: 0 };
    per[pid][key]++;
  };
  for (const e of events) {
    if (e.type === "VIEW") bump(e.productId, "views");
    else if (e.type === "CTA_CLICK") bump(e.productId, "ctas");
  }
  for (const l of leads) bump(l.productId, "leads");

  return {
    days: span,
    totals,
    series: Object.values(series),
    byProduct: Object.values(per).sort((a, b) => b.views - a.views),
  };
}

router.get("/api/drift/my/analytics", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  res.json({ analytics: await buildDriftAnalytics(orgId, Number(req.query.days) || 30) });
});
router.get("/api/drift/brands/:orgId/analytics", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ analytics: await buildDriftAnalytics(req.params.orgId, Number(req.query.days) || 30) });
});

// ─────────────────────────── LANDING CURATION ───────────────────────────
// Cross-line: a landing item points at a DriftProduct or a Rot3dProduct.

const landingThumb = (m: any, df: number): string | null => {
  const frames = Array.isArray(m?.frames) ? m.frames : [];
  return frames[df] || frames[0] || null;
};

// Resolve a curated item to the product data the landing renders. Null if the
// referenced product is gone / not published (so stale items are skipped).
async function resolveLandingItem(item: {
  id: string;
  source: string;
  productId: string;
  rank: number;
  isHero: boolean;
}) {
  if (item.source === "ROTATION3D") {
    const p = await prisma.rot3dProduct.findFirst({
      where: { id: item.productId, status: { in: ["READY", "PUBLISHED"] } },
      include: { spin: { select: { manifest: true } }, organization: { select: { name: true } } },
    });
    if (!p || !p.spin) return null;
    const m = p.spin.manifest as any;
    return {
      itemId: item.id, source: "ROTATION3D", id: p.id, name: p.name,
      title: p.title, titleEnd: null, description: p.description,
      brandName: p.organization?.name || "", defaultFrame: p.defaultFrame,
      background: p.background, loopEnabled: true, manifest: m, secondManifest: null,
      rank: item.rank, isHero: item.isHero, thumb: landingThumb(m, p.defaultFrame),
    };
  }
  const p = await prisma.driftProduct.findFirst({
    where: { id: item.productId, status: { in: ["READY", "PUBLISHED"] } },
    include: {
      spin: { select: { manifest: true, secondManifest: true } },
      organization: { select: { name: true } },
    },
  });
  if (!p || !p.spin) return null;
  const m = p.spin.manifest as any;
  return {
    itemId: item.id, source: "DRIFT", id: p.id, name: p.name,
    title: p.title, titleEnd: p.titleEnd, description: p.description,
    descriptionEnd: p.descriptionEnd, helperStart: p.helperStart, helperEnd: p.helperEnd,
    brandName: p.organization?.name || "", defaultFrame: p.defaultFrame,
    background: p.background, loopEnabled: p.loopEnabled, manifest: m,
    secondManifest: p.spin.secondManifest ?? null,
    rank: item.rank, isHero: item.isHero, thumb: p.thumbnailUrl || landingThumb(m, p.defaultFrame),
  };
}

// Curated items (superadmin).
router.get(
  "/api/drift/landing",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.driftLandingItem.findMany({
      orderBy: [{ isHero: "desc" }, { rank: "asc" }, { createdAt: "asc" }],
    });
    const resolved = (await Promise.all(items.map(resolveLandingItem))).filter(Boolean);
    res.json({ items: resolved });
  },
);

// Pickable pool: all READY/PUBLISHED drifts + Rotation3D spins (superadmin).
router.get(
  "/api/drift/landing/candidates",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const [drifts, spins] = await Promise.all([
      prisma.driftProduct.findMany({
        where: { status: { in: ["READY", "PUBLISHED"] } },
        orderBy: { createdAt: "desc" },
        include: { spin: { select: { manifest: true } }, organization: { select: { name: true } } },
      }),
      prisma.rot3dProduct.findMany({
        where: { status: { in: ["READY", "PUBLISHED"] } },
        orderBy: { createdAt: "desc" },
        include: { spin: { select: { manifest: true } }, organization: { select: { name: true } } },
      }),
    ]);
    const map = (list: any[], source: string) =>
      list
        .filter((p) => p.spin)
        .map((p) => {
          const m = p.spin.manifest as any;
          const frames = Array.isArray(m?.frames) ? m.frames : [];
          return {
            source, id: p.id, name: p.name,
            brandName: p.organization?.name || "",
            thumb: p.thumbnailUrl || frames[p.defaultFrame] || frames[0] || null,
          };
        });
    res.json({ drift: map(drifts, "DRIFT"), rotation3d: map(spins, "ROTATION3D") });
  },
);

// Add an item to the landing (idempotent on source+productId).
router.post(
  "/api/drift/landing",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const source = req.body?.source === "ROTATION3D" ? "ROTATION3D" : "DRIFT";
    const productId = String(req.body?.productId || "");
    if (!productId) return res.status(400).json({ error: "productId is required" });
    const item = await prisma.driftLandingItem.upsert({
      where: { source_productId: { source, productId } },
      create: { source, productId },
      update: {},
    });
    res.status(201).json({ item });
  },
);

// One-click: make a drift/spin THE landing hero — upsert its landing item and
// set it as the single hero in one call (used from the drift product list so a
// superadmin doesn't have to add-then-hero across the curation tab).
router.post(
  "/api/drift/landing/set-hero",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const source = req.body?.source === "ROTATION3D" ? "ROTATION3D" : "DRIFT";
    const productId = String(req.body?.productId || "");
    if (!productId) return res.status(400).json({ error: "productId is required" });
    const item = await prisma.driftLandingItem.upsert({
      where: { source_productId: { source, productId } },
      create: { source, productId, isHero: true },
      update: { isHero: true },
    });
    await prisma.driftLandingItem.updateMany({
      where: { isHero: true, id: { not: item.id } },
      data: { isHero: false },
    });
    res.json({ item });
  },
);

// Reorder / set the single hero.
router.patch(
  "/api/drift/landing/:id",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const data: Record<string, unknown> = {};
    if (Number.isFinite(Number(req.body?.rank))) data.rank = Math.floor(Number(req.body.rank));
    if (typeof req.body?.isHero === "boolean") {
      data.isHero = req.body.isHero;
      if (req.body.isHero) {
        await prisma.driftLandingItem.updateMany({
          where: { isHero: true, id: { not: req.params.id } },
          data: { isHero: false },
        });
      }
    }
    const item = await prisma.driftLandingItem.update({ where: { id: req.params.id }, data });
    res.json({ item });
  },
);

router.delete(
  "/api/drift/landing/:id",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    await prisma.driftLandingItem.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  },
);

// Public landing feed — resilient so it returns [] before the table is migrated.
router.get("/api/drift/public/landing", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await prisma.driftLandingItem.findMany({
      orderBy: [{ isHero: "desc" }, { rank: "asc" }, { createdAt: "asc" }],
    });
    const resolved = (await Promise.all(items.map(resolveLandingItem))).filter(Boolean);
    res.json({ items: resolved });
  } catch {
    res.json({ items: [] });
  }
});

// The hero DRIFT set as THE drift.li landing — drift.li/ renders this drift's
// full interactive player in place of the gallery. Returns the complete player
// payload (or { product: null } to fall back to the gallery landing).
router.get("/api/drift/public/landing-hero", async (req: AuthenticatedRequest, res: Response) => {
  try {
    // On a brand's custom domain the frontend passes ?brand=<slug>; scope the hero
    // to THAT brand's designated landing drift. drift.li (no brand) uses the single
    // global hero. A brand with no landing drift set → no takeover (gallery/null).
    const brandSlug =
      typeof req.query.brand === "string" ? req.query.brand.trim().toLowerCase() : "";
    let heroProductId: string | null = null;
    if (brandSlug) {
      const org = await prisma.organization.findFirst({
        where: { slug: brandSlug },
        select: { landingHeroProductId: true },
      });
      heroProductId = org?.landingHeroProductId || null;
      if (!heroProductId) return res.json({ product: null });
    } else {
      const hero = await prisma.driftLandingItem.findFirst({
        where: { isHero: true, source: "DRIFT" },
        select: { productId: true },
      });
      heroProductId = hero?.productId || null;
    }
    if (!heroProductId) return res.json({ product: null });
    const product = await prisma.driftProduct.findFirst({
      where: { id: heroProductId, status: { in: ["READY", "PUBLISHED"] } },
      include: {
        spin: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            metaPixelId: true,
            termsUrl: true,
            privacyUrl: true,
            brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true, secondaryColor: true }, take: 1 },
          },
        },
      },
    });
    if (!product || !product.spin) return res.json({ product: null });
    const captions = await prisma.driftCaption.findMany({
      where: { productId: product.id },
      orderBy: [{ clip: "asc" }, { startFrame: "asc" }, { order: "asc" }],
    });
    const bc = product.organization?.brandConfigs?.[0];
    const payload = await publicProductPayload(product, bc, product.organization?.name || "", captions, product.organization?.metaPixelId);
    res.json({
      product: {
        ...payload,
        brandSlug: product.organization?.slug || null,
        termsUrl: product.organization?.termsUrl || null,
        privacyUrl: product.organization?.privacyUrl || null,
        // Brand-scoped landings (custom domains) show the brand's own header branding.
        brandScoped: !!brandSlug,
        brandName: bc?.companyName || product.organization?.name || null,
        brandLogo: bc?.logoUrl || null,
      },
    });
  } catch {
    res.json({ product: null });
  }
});

// Called once at server startup — mark orphaned PROCESSING products FAILED.
export async function recoverOrphanedDriftJobs() {
  try {
    const { count } = await prisma.driftProduct.updateMany({
      where: { status: "PROCESSING" },
      data: { status: "FAILED" },
    });
    if (count > 0) {
      console.log(`[${NS}] startup recovery: marked ${count} orphaned PROCESSING product(s) FAILED`);
    }
  } catch (err) {
    console.error(`[${NS}] startup recovery failed:`, err);
  }
}

export default router;
