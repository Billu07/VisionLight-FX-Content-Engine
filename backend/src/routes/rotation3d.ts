import { Router, Response } from "express";
import multer from "multer";
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

const router = Router();

// Images are small → memory. Videos stream to a temp file (low memory, allows
// large files, and lets the pipeline read the file directly with no R2 round-trip).
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `r3d-upload-${crypto.randomUUID()}.mp4`),
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
    const clash = await prisma.rot3dProduct.findFirst({
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
  "api", "www", "b", "assets", "favicon",
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

// ─────────────────────────── TEAM (SuperAdmin) ───────────────────────────

// List Rotation3D brand organizations.
router.get(
  "/api/rotation3d/brands",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const brands = await prisma.organization.findMany({
      where: { productLine: "ROTATION3D" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { rot3dProducts: true } },
      },
    });
    res.json({ brands });
  },
);

// Create a Rotation3D brand organization, optionally provisioning its admin
// login. Returns a one-time temp password to forward (unless the email already
// has an account, in which case they keep their existing password).
router.post(
  "/api/rotation3d/brands",
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
        productLine: "ROTATION3D",
        provisioningSource: "MANUAL",
        // Brand admins are canonically routed to rotation3d.com, so wherever
        // they log in they are handed off to the Rotation3D domain (which now
        // serves the full app + their brand dashboard).
        routingDomain: "rotation3d.com",
      },
      select: { id: true, name: true, createdAt: true },
    });

    // Vanity slug (resilient — the column may not be migrated yet).
    let slug: string | null = null;
    try {
      slug = await uniqueOrgSlug(name);
      await prisma.organization.update({ where: { id: org.id }, data: { slug } });
    } catch {
      slug = null;
    }

    let admin:
      | { email: string; tempPassword?: string; reused?: boolean }
      | undefined;
    if (adminEmail) {
      const tempPassword = crypto.randomBytes(9).toString("base64url");
      try {
        const created: any = await AuthService.createSystemUser(
          adminEmail,
          tempPassword,
          adminName,
          "ROTATION3D",
          3,
          org.id,
          "ADMIN",
        );
        admin = created?.authIdentityReused
          ? { email: adminEmail, reused: true }
          : { email: adminEmail, tempPassword };
      } catch (e: any) {
        // Org is created; report the admin failure so the team can retry/add later.
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
  "/api/rotation3d/brands/:orgId/slug",
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

// Assign vanity slugs to any Rotation3D brands that don't have one yet.
router.post(
  "/api/rotation3d/backfill-slugs",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const brands = await prisma.organization.findMany({
        where: { productLine: "ROTATION3D", slug: null },
        select: { id: true, name: true },
      });
      let updated = 0;
      for (const b of brands) {
        const slug = await uniqueOrgSlug(b.name);
        await prisma.organization.update({ where: { id: b.id }, data: { slug } });
        updated++;
      }
      res.json({ updated });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Backfill failed (pending DB update?)" });
    }
  },
);

// List a brand's products (with spin + counts) for the team console.
router.get(
  "/api/rotation3d/brands/:orgId/products",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const products = await prisma.rot3dProduct.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        spin: { select: { frameCount: true, status: true } },
        _count: { select: { sourceImages: true, videos: true } },
      },
    });
    res.json({ products, brandSlug: await orgSlug(orgId) });
  },
);

// Source images a brand has sent in (raw product photos) for the team to work from.
router.get(
  "/api/rotation3d/brands/:orgId/source-images",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const images = await prisma.rot3dSourceImage.findMany({
      where: { organizationId: req.params.orgId },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, angleLabel: true, productId: true, createdAt: true },
    });
    res.json({ images });
  },
);

// Team uploads a rendered rotation video for a brand → pipeline builds the spin.
router.post(
  "/api/rotation3d/brands/:orgId/products",
  authenticateToken,
  requireSuperAdmin,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const name = String(req.body?.name || "").trim();
    const frameCount = Number(req.body?.frameCount) || 48;
    // bgMode picks how the video backdrop is handled:
    //  remove-white/black = free ffmpeg chroma-key → transparent on gradient
    //  ai                 = paid Fal matte (best edges)
    //  keep-white/black   = opaque, player bg set to match
    //  keep-gradient      = opaque on the default gradient
    const bgMode = String(req.body?.bgMode || "keep");
    let removal: "white" | "black" | "ai" | "none" = "none"; // "keep" default
    if (bgMode === "remove-white") removal = "white";
    else if (bgMode === "remove-black") removal = "black";
    else if (bgMode === "ai") removal = "ai";
    const file = req.file;
    if (!name) {
      if (file?.path) await fs.rm(file.path, { force: true }).catch(() => undefined);
      return res.status(400).json({ error: "Product name is required" });
    }
    if (!file) return res.status(400).json({ error: "A video file is required" });

    const org = await prisma.organization.findFirst({
      where: { id: orgId, productLine: "ROTATION3D" },
      select: { id: true },
    });
    if (!org) {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
      return res.status(404).json({ error: "Rotation3D brand not found" });
    }

    const slug = await uniqueSlug(orgId, name);
    const product = await prisma.rot3dProduct.create({
      data: {
        organizationId: orgId,
        slug,
        name,
        status: "PROCESSING",
        createdByUserId: req.user?.id || null,
      },
    });

    // Respond immediately; frames are built in the background so the client
    // never waits on (or times out during) extraction. The admin UI polls for
    // PROCESSING → READY/FAILED.
    res.status(201).json({ product });

    const videoPath = file.path;
    const mimetype = file.mimetype;
    const uploaderId = req.user?.id || null;

    // Heavy frame extraction runs through a bounded-concurrency queue so a
    // burst of parallel/batch uploads can't oversubscribe the CPU. The upload
    // already returned above; queued jobs stay PROCESSING until their turn.
    {
      const d = processingQueueDepth();
      console.log(
        `[r3d] product ${product.id} queued for processing (active ${d.active}/${d.concurrency}, waiting ${d.waiting})`,
      );
    }
    void enqueueProcessing(async () => {
      try {
        const buf = await fs.readFile(videoPath);
        const videoUrl = await uploadManagedBuffer({
          buffer: buf,
          contentType: mimetype || "video/mp4",
          keyPrefix: `rotation3d/org_${orgId}/product_${product.id}/video`,
          fallbackExtension: "mp4",
        });
        await prisma.rot3dVideo.create({
          data: { productId: product.id, url: videoUrl, status: "PROCESSING", uploadedByUserId: uploaderId },
        });

        const manifest = await buildSpinFromVideo({
          videoPath,
          organizationId: orgId,
          productId: product.id,
          frameCount,
          removal,
        });

        await prisma.rot3dSpin.upsert({
          where: { productId: product.id },
          create: { productId: product.id, frameCount: manifest.frameCount, manifest: manifest as any, status: "READY" },
          update: { frameCount: manifest.frameCount, manifest: manifest as any, status: "READY" },
        });
        await prisma.rot3dProduct.update({
          where: { id: product.id },
          // Content-aware default player background: the detected corner color
          // (opaque frames) or null → default gradient (transparent frames).
          data: {
            status: "READY",
            defaultFrame: manifest.defaultFrame,
            background: manifest.detectedBg ?? null,
          },
        });
        console.log(`[r3d] product ${product.id} READY (${manifest.frameCount} frames)`);
      } catch (err: any) {
        console.error("Rotation3D pipeline error:", err);
        await prisma.rot3dProduct
          .update({ where: { id: product.id }, data: { status: "FAILED" } })
          .catch(() => undefined);
      } finally {
        await fs.rm(videoPath, { force: true }).catch(() => undefined);
      }
    }).catch(() => undefined);
  },
);

// Delete a Rotation3D brand and everything under it (cascades to products,
// spins, videos, embeds, events, users). Guarded to ROTATION3D orgs only.
router.delete(
  "/api/rotation3d/brands/:orgId",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const org = await prisma.organization.findFirst({
      where: { id: orgId, productLine: "ROTATION3D" },
      select: { id: true },
    });
    if (!org) return res.status(404).json({ error: "Rotation3D brand not found" });
    await prisma.organization.delete({ where: { id: orgId } });
    res.json({ ok: true });
  },
);

// All ready/published products across brands, for homepage-showcase curation.
router.get(
  "/api/rotation3d/products",
  authenticateToken,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const products = await prisma.rot3dProduct.findMany({
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

// Toggle a product's homepage placement (showcase grid and/or the single hero).
router.patch(
  "/api/rotation3d/products/:id/feature",
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
        // Only one hero — clear any existing one first.
        await prisma.rot3dProduct.updateMany({
          where: { heroFeatured: true, id: { not: req.params.id } },
          data: { heroFeatured: false },
        });
      }
    }
    const product = await prisma.rot3dProduct.update({
      where: { id: req.params.id },
      data,
      select: { id: true, featured: true, heroFeatured: true, featuredRank: true },
    });
    res.json({ product });
  },
);

// Delete a product (cascades its spin/videos/embed/events; source images kept).
router.delete(
  "/api/rotation3d/products/:id",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.rot3dProduct.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Product not found" });
    await prisma.rot3dProduct.delete({ where: { id: req.params.id } });
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

// The brand's own products (for their dashboard + player customization).
router.get(
  "/api/rotation3d/my/products",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const products = await prisma.rot3dProduct.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: { spin: true, embed: true },
    });
    res.json({ products, brandSlug: await orgSlug(orgId) });
  },
);

// Brand edits player controls: CTAs (prev/next URLs), default frame, publish state.
router.patch(
  "/api/rotation3d/my/products/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const owned = await prisma.rot3dProduct.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Product not found" });

    const data: Record<string, unknown> = {};
    if ("ctaPrimary" in req.body) data.ctaPrimary = cta(req.body.ctaPrimary) ?? null;
    if ("ctaSecondary" in req.body) data.ctaSecondary = cta(req.body.ctaSecondary) ?? null;
    if ("defaultFrame" in req.body) data.defaultFrame = Math.max(0, Number(req.body.defaultFrame) || 0);
    if ("background" in req.body) data.background = String(req.body.background || "").slice(0, 40);
    if (typeof req.body.publish === "boolean") data.status = req.body.publish ? "PUBLISHED" : "READY";
    if (typeof req.body.slug === "string" && req.body.slug.trim()) {
      const s = slugify(req.body.slug);
      const clash = await prisma.rot3dProduct.findFirst({
        where: { organizationId: orgId, slug: s, NOT: { id: owned.id } },
        select: { id: true },
      });
      if (clash) return res.status(409).json({ error: "That product link is already taken" });
      data.slug = s;
    }

    const product = await prisma.rot3dProduct.update({
      where: { id: owned.id },
      data,
      include: { spin: true, embed: true },
    });
    res.json({ product });
  },
);

// Brand uploads raw product images ("send to us"). Team fulfills them later.
router.post(
  "/api/rotation3d/my/source-images",
  authenticateToken,
  imageUpload.array("images", 60),
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: "No images uploaded" });
    const productId = req.body?.productId ? String(req.body.productId) : null;

    const created = [];
    for (const f of files) {
      if (!f.mimetype?.startsWith("image/")) continue;
      const url = await uploadManagedBuffer({
        buffer: f.buffer,
        contentType: f.mimetype,
        keyPrefix: `rotation3d/org_${orgId}/source`,
        fallbackExtension: "jpg",
      });
      const row = await prisma.rot3dSourceImage.create({
        data: {
          organizationId: orgId,
          productId,
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
  "/api/rotation3d/my/products/:id/embed",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = requireOrg(req, res);
    if (!orgId) return;
    const owned = await prisma.rot3dProduct.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Product not found" });

    const allowedDomains = Array.isArray(req.body?.allowedDomains)
      ? req.body.allowedDomains.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean)
      : [];
    const token = crypto.randomBytes(12).toString("hex");
    const embed = await prisma.rot3dEmbed.upsert({
      where: { productId: owned.id },
      create: { productId: owned.id, token, allowedDomains },
      update: { token, allowedDomains },
    });
    res.json({ embed });
  },
);

// ─────────────────────────── PUBLIC (no auth) ───────────────────────────

// Curated products for the public homepage showcase (superadmin picks).
router.get(
  "/api/rotation3d/public/featured",
  async (_req: AuthenticatedRequest, res: Response) => {
    const products = await prisma.rot3dProduct.findMany({
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
        background: p.background,
        brandName: p.organization?.name || "",
        featured: p.featured,
        heroFeatured: p.heroFeatured,
        manifest: p.spin!.manifest,
      }));
    res.json({ products: list });
  },
);

// Brand showcase by vanity slug → rotation3d.com/{brandSlug}
router.get(
  "/api/rotation3d/public/b/:brandSlug",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const org = await prisma.organization.findFirst({
        where: { slug: req.params.brandSlug, productLine: "ROTATION3D" },
        select: {
          id: true, name: true, slug: true,
          brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true, secondaryColor: true }, take: 1 },
        },
      });
      if (!org) return res.status(404).json({ error: "Not found" });
      const products = await prisma.rot3dProduct.findMany({
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
            background: p.background, manifest: p.spin!.manifest,
          })),
      });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  },
);

// Player by vanity slugs → rotation3d.com/{brandSlug}/{productSlug}
router.get(
  "/api/rotation3d/public/b/:brandSlug/:productSlug",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const org = await prisma.organization.findFirst({
        where: { slug: req.params.brandSlug, productLine: "ROTATION3D" },
        select: {
          id: true, name: true, slug: true,
          brandConfigs: { select: { logoUrl: true, companyName: true, primaryColor: true, secondaryColor: true }, take: 1 },
        },
      });
      if (!org) return res.status(404).json({ error: "Not found" });
      const product = await prisma.rot3dProduct.findFirst({
        where: { organizationId: org.id, slug: req.params.productSlug, status: { in: ["READY", "PUBLISHED"] } },
        include: { spin: true },
      });
      if (!product || !product.spin) return res.status(404).json({ error: "Not found" });
      const bc = org.brandConfigs?.[0];
      res.json({
        product: {
          id: product.id, name: product.name, slug: product.slug,
          defaultFrame: product.defaultFrame, background: product.background,
          ctaPrimary: product.ctaPrimary, ctaSecondary: product.ctaSecondary,
          brandName: bc?.companyName || org.name,
          brandSlug: org.slug,
          logoUrl: bc?.logoUrl || null,
          primaryColor: bc?.primaryColor || null,
          secondaryColor: bc?.secondaryColor || null,
          manifest: product.spin.manifest,
        },
      });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  },
);

// Manifest + presentation for the player. Only READY/PUBLISHED products.
router.get(
  "/api/rotation3d/public/products/:id",
  async (req: AuthenticatedRequest, res: Response) => {
    const product = await prisma.rot3dProduct.findFirst({
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

    const bc = product.organization?.brandConfigs?.[0];
    res.json({
      product: {
        id: product.id,
        name: product.name,
        defaultFrame: product.defaultFrame,
        background: product.background,
        ctaPrimary: product.ctaPrimary,
        ctaSecondary: product.ctaSecondary,
        brandName: bc?.companyName || product.organization?.name || "",
        logoUrl: bc?.logoUrl || null,
        primaryColor: bc?.primaryColor || null,
        secondaryColor: bc?.secondaryColor || null,
        manifest: product.spin.manifest,
      },
    });
  },
);

// Anonymous engagement events from the player (view / rotate / zoom / cta_click).
router.post(
  "/api/rotation3d/public/events",
  async (req: AuthenticatedRequest, res: Response) => {
    const productId = String(req.body?.productId || "");
    const type = String(req.body?.type || "").toUpperCase();
    const allowed = ["VIEW", "ROTATE", "ZOOM", "CTA_CLICK"];
    if (!productId || !allowed.includes(type)) {
      return res.status(400).json({ error: "Invalid event" });
    }
    const product = await prisma.rot3dProduct.findUnique({
      where: { id: productId },
      select: { organizationId: true },
    });
    if (!product) return res.status(404).json({ error: "Not found" });

    await prisma.rot3dEvent.create({
      data: {
        organizationId: product.organizationId,
        productId,
        type,
        meta: req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : undefined,
      },
    });
    res.json({ ok: true });
  },
);

// Called once at server startup. The processing queue is in-memory, so any
// product left PROCESSING by a previous (crashed/restarted) process is an
// orphan — nothing will ever finish it. Mark those FAILED so they aren't stuck
// forever and the team knows to re-upload. Safe because this runs before any
// new upload can enqueue, and there is only one backend process (pm2 fork).
export async function recoverOrphanedRot3dJobs() {
  try {
    const { count } = await prisma.rot3dProduct.updateMany({
      where: { status: "PROCESSING" },
      data: { status: "FAILED" },
    });
    if (count > 0) {
      console.log(`[r3d] startup recovery: marked ${count} orphaned PROCESSING product(s) FAILED`);
    }
  } catch (err) {
    console.error("[r3d] startup recovery failed:", err);
  }
}

export default router;
