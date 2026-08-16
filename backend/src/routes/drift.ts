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
import { streamDriftExportZip } from "../services/driftExport";

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
  return { label, url };
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

// Shape a full player payload for a Drift product record (with brand + spin).
const publicProductPayload = (p: any, bc: any, orgName: string, captions: any[]) => ({
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
  background: p.background,
  ctaPrimary: p.ctaPrimary,
  ctaSecondary: p.ctaSecondary,
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
          loopEnabled: p.loopEnabled, background: p.background, manifest: p.spin!.manifest,
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
          id: true, name: true, slug: true,
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
      res.json({ product: { ...publicProductPayload(product, org.brandConfigs?.[0], org.name, captions), brandSlug: org.slug } });
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
      product: publicProductPayload(product, bc, product.organization?.name || "", captions),
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
    rank: item.rank, isHero: item.isHero, thumb: landingThumb(m, p.defaultFrame),
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
            thumb: frames[p.defaultFrame] || frames[0] || null,
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
