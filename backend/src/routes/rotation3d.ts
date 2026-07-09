import { Router, Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { prisma } from "../services/database";
import {
  authenticateToken,
  requireSuperAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { AuthService } from "../services/auth";
import { uploadManagedBuffer } from "../utils/managedStorage";
import { buildSpinFromVideo } from "../services/rotation3d/pipeline";

const router = Router();

const mem = (mb: number) =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: mb * 1024 * 1024 } });
const videoUpload = mem(300);
const imageUpload = mem(25);

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
    res.status(201).json({ brand: org, admin });
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
    res.json({ products });
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
    const frameCount = Number(req.body?.frameCount) || 36;
    const file = req.file;
    if (!name) return res.status(400).json({ error: "Product name is required" });
    if (!file) return res.status(400).json({ error: "A video file is required" });

    const org = await prisma.organization.findFirst({
      where: { id: orgId, productLine: "ROTATION3D" },
      select: { id: true },
    });
    if (!org) return res.status(404).json({ error: "Rotation3D brand not found" });

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

    try {
      const videoUrl = await uploadManagedBuffer({
        buffer: file.buffer,
        contentType: file.mimetype || "video/mp4",
        keyPrefix: `rotation3d/org_${orgId}/product_${product.id}/video`,
        fallbackExtension: "mp4",
      });
      await prisma.rot3dVideo.create({
        data: {
          productId: product.id,
          url: videoUrl,
          status: "PROCESSING",
          uploadedByUserId: req.user?.id || null,
        },
      });

      const manifest = await buildSpinFromVideo({
        videoUrl,
        organizationId: orgId,
        productId: product.id,
        frameCount,
      });

      await prisma.rot3dSpin.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          frameCount: manifest.frameCount,
          manifest: manifest as any,
          status: "READY",
        },
        update: {
          frameCount: manifest.frameCount,
          manifest: manifest as any,
          status: "READY",
        },
      });
      const ready = await prisma.rot3dProduct.update({
        where: { id: product.id },
        data: { status: "READY", defaultFrame: manifest.defaultFrame },
        include: { spin: true },
      });
      res.status(201).json({ product: ready });
    } catch (err: any) {
      await prisma.rot3dProduct
        .update({ where: { id: product.id }, data: { status: "DRAFT" } })
        .catch(() => undefined);
      console.error("Rotation3D pipeline error:", err);
      res.status(500).json({ error: `Processing failed: ${err?.message || "unknown"}` });
    }
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
    res.json({ products });
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

// Manifest + presentation for the player. Only READY/PUBLISHED products.
router.get(
  "/api/rotation3d/public/products/:id",
  async (req: AuthenticatedRequest, res: Response) => {
    const product = await prisma.rot3dProduct.findFirst({
      where: { id: req.params.id, status: { in: ["READY", "PUBLISHED"] } },
      include: {
        spin: true,
        organization: { select: { id: true, name: true, brandConfigs: { select: { logoUrl: true }, take: 1 } } },
      },
    });
    if (!product || !product.spin) return res.status(404).json({ error: "Not found" });

    res.json({
      product: {
        id: product.id,
        name: product.name,
        defaultFrame: product.defaultFrame,
        background: product.background,
        ctaPrimary: product.ctaPrimary,
        ctaSecondary: product.ctaSecondary,
        brandName: product.organization?.name || "",
        logoUrl: product.organization?.brandConfigs?.[0]?.logoUrl || null,
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

export default router;
