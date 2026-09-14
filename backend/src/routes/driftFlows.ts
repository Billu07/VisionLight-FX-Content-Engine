import { Router, Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { Prisma } from "@prisma/client";
import { prisma } from "../services/database";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { probeClipInfo } from "../services/rotation3d/pipeline";
import { uploadManagedBuffer } from "../utils/managedStorage";
import { parseCtaPlacement, parseDirection, processClip, uniqueSlug } from "./drift";
import { sendFlowCreatedNoticeEmail, sendFlowPublishedEmails, sendUpgradeNudgeEmail } from "../services/mail";
import { billingSummary, confirmCheckoutSession, createFlowCheckout, storePendingClip } from "../services/driftBilling";
import {
  createClientPage,
  createProInvite,
  listClientPages,
  listProInvites,
  pageManager,
  parseAccountType,
  revokeProInvite,
} from "../services/driftTourAccounts";
import {
  CLIP_DURATION_TOLERANCE_S,
  FlowError,
  STEP_MIN_FRAMES,
  STEP_TARGET_FRAMES,
  createDriftStep,
  createFlowWithQuota,
  deleteFlow,
  deleteStep,
  flowInclude,
  flowQuota,
  isReservedFlowSlug,
  parseBackground,
  parseCreatorCta,
  pagePublicPath,
  flowPublicPath,
  parseFlowKind,
  relinkFlow,
  reorderSteps,
  serializeFlow,
  serializePublicFlow,
  setFlowPublished,
  slugifyFlow,
  stepLimitError,
  stepNoun,
  uniqueFlowSlug,
  type CreatorCta,
  type FlowKind,
} from "../services/driftFlows";

// Creator API for drift flows (drift.li/tour | view | memory | path).
// Org-scoped like the other /api/drift/my/* routes: any member of the caller's
// org (a creator is the ADMIN of their own personal org). Superadmins skip the
// plan quotas so the client can seed the demo flow. Clip processing reuses the
// drift pipeline verbatim; the flow's links are re-derived after every change.

const router = Router();
const NS = "drift-flow";
// Pay per drift: tours are unlimited; this only stops runaway uploads.
const MAX_DRIFTS_PER_FLOW = Math.max(1, Math.round(Number(process.env.TOUR_MAX_DRIFTS_PER_TOUR) || 60));

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `drift-flow-upload-${crypto.randomUUID()}.mp4`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// Cover images (small; kept in memory and pushed straight to storage).
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const isSuperAdmin = (req: AuthenticatedRequest) => req.user?.role === "SUPERADMIN";
// The org a creator request acts on: the active profile's org — or, for a superadmin
// managing somebody's page (drift.li admin → Tour, or "Manage" on a page), the tour
// page named in X-Drift-Org.
const requireOrg = async (req: AuthenticatedRequest, res: Response): Promise<string | null> => {
  const override = String(req.headers["x-drift-org"] || "").trim();
  if (override && isSuperAdmin(req)) {
    const org = await prisma.organization.findFirst({
      where: { id: override, productLine: "TOUR" },
      select: { id: true },
    });
    if (!org) {
      res.status(404).json({ error: "That page doesn't exist" });
      return null;
    }
    return org.id;
  }
  const orgId = req.user?.organizationId;
  if (!orgId) {
    res.status(403).json({ error: "No organization on this account" });
    return null;
  }
  return orgId;
};
const rmFile = async (p?: string) => {
  if (p) await fs.rm(p, { force: true }).catch(() => undefined);
};

const str = (v: unknown, max: number): string | undefined =>
  v === undefined ? undefined : String(v ?? "").trim().slice(0, max);
const strOrNull = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim().slice(0, max);
  return s ? s : null;
};
const isHttpUrl = (u: string) => {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
};

const loadFlow = (orgId: string, id: string) =>
  prisma.driftFlow.findFirst({ where: { id, organizationId: orgId }, include: flowInclude });

// Translate a FlowError into a response; anything else goes to Express' handler.
const handle = (res: Response, err: unknown) => {
  if (err instanceof FlowError) {
    res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    return;
  }
  throw err;
};

// ───────────────────────────── pages ─────────────────────────────
// A page = a TOUR org (the creator's profile). Its settings live in
// Organization.tourSettings: { contactLabel, contactUrl, demoFlowId, logoUrl }.

const PAGE_SELECT = {
  id: true,
  name: true,
  slug: true,
  productLine: true,
  tourAccountType: true,
  managedByOrgId: true,
  tourSettings: true,
} as const;

const DEFAULT_CONTACT = {
  label: process.env.DRIFT_TOUR_CONTACT_LABEL || "Contact PicDrift",
  url: process.env.DRIFT_TOUR_CONTACT_URL || "mailto:picdrift@picdrift.com",
};

const pageSettingsOf = (org: { tourSettings?: unknown }): Record<string, any> =>
  org.tourSettings && typeof org.tourSettings === "object" ? (org.tourSettings as Record<string, any>) : {};

const serializePage = (org: any) => {
  const s = pageSettingsOf(org);
  const label = typeof s.contactLabel === "string" ? s.contactLabel.trim() : "";
  const url = typeof s.contactUrl === "string" ? s.contactUrl.trim() : "";
  return {
    id: org.id as string,
    name: org.name as string,
    slug: (org.slug ?? null) as string | null,
    path: org.slug ? pagePublicPath(org.slug) : null,
    accountType: (org.tourAccountType ?? null) as string | null,
    logoUrl: typeof s.logoUrl === "string" && s.logoUrl ? (s.logoUrl as string) : null,
    contact: { label: label || DEFAULT_CONTACT.label, url: url || DEFAULT_CONTACT.url },
    contactLabel: label || null,
    contactUrl: url || null,
    demoFlowId: typeof s.demoFlowId === "string" && s.demoFlowId ? (s.demoFlowId as string) : null,
  };
};

/** A page's own contact link: the web, email or phone (never javascript: etc.). */
const isContactUrl = (u: string) => {
  if (/[\s\\]/.test(u)) return false;
  try {
    return ["https:", "http:", "mailto:", "tel:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

/** "View Demo": the page's own demo tour when it set one, else the site's demo. */
async function resolveDemo(org: { id: string; tourSettings?: unknown }, kind: FlowKind) {
  const s = pageSettingsOf(org);
  const pick = { kind: true, slug: true, name: true, organization: { select: { slug: true } } } as const;
  if (typeof s.demoFlowId === "string" && s.demoFlowId) {
    const own = await prisma.driftFlow.findFirst({
      where: { id: s.demoFlowId, organizationId: org.id, status: "PUBLISHED" },
      select: pick,
    });
    if (own) return { name: own.name, path: flowPublicPath(own.kind, own.organization?.slug, own.slug), own: true };
  }
  const site = await prisma.driftFlow.findFirst({
    where: { kind, status: "PUBLISHED", isDemo: true },
    orderBy: { updatedAt: "desc" },
    select: pick,
  });
  return site ? { name: site.name, path: flowPublicPath(site.kind, site.organization?.slug, site.slug), own: false } : null;
}

const findPublicPage = (slug: string) =>
  prisma.organization.findFirst({
    where: { slug: String(slug || "").trim().toLowerCase(), productLine: "TOUR" },
    select: PAGE_SELECT,
  });

// Probe + validate an uploaded clip against the org's plan. Deletes the temp
// file and writes the error response on failure (returns null).
async function validateClip(
  orgId: string,
  file: Express.Multer.File,
  res: Response,
  /** superadmin: no clip-length limit (frames stay capped) */
  unlimited = false,
): Promise<{ frameCount: number; duration: number } | null> {
  const quota = await flowQuota(orgId);
  const info = await probeClipInfo(file.path);
  if (!info.duration) {
    await rmFile(file.path);
    res.status(400).json({ error: "We couldn't read that clip. Please upload an MP4 or MOV video." });
    return null;
  }
  if (!unlimited && info.duration > quota.maxClipSeconds + CLIP_DURATION_TOLERANCE_S) {
    await rmFile(file.path);
    res.status(400).json({
      error: `Clips must be ${quota.maxClipSeconds} seconds or shorter — this one is ${info.duration.toFixed(1)}s.`,
      upgrade: true,
      code: "CLIP_TOO_LONG",
      details: { upgrade: true, limit: quota.maxClipSeconds, duration: info.duration },
    });
    return null;
  }
  // Every source frame up to the cap: no duplicated frames, no wasted storage.
  const sourceFrames = Math.round(info.duration * (info.fps || 30));
  const frameCount = Math.min(STEP_TARGET_FRAMES, Math.max(STEP_MIN_FRAMES, sourceFrames));
  return { frameCount, duration: info.duration };
}

// ───────────────────────────── flows ─────────────────────────────

// The creator's flows (+ plan usage). ?kind=TOUR filters one kind.
router.get("/api/drift/my/flows", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const kindRaw = req.query.kind;
  const kind = kindRaw !== undefined ? parseFlowKind(kindRaw) : null;
  if (kindRaw !== undefined && !kind) return res.status(400).json({ error: "Unknown flow kind" });
  const slugFilter = typeof req.query.slug === "string" ? req.query.slug.trim().toLowerCase() : "";
  const [flows, quota, org] = await Promise.all([
    prisma.driftFlow.findMany({
      where: { organizationId: orgId, ...(kind ? { kind } : {}), ...(slugFilter ? { slug: slugFilter } : {}) },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: flowInclude,
    }),
    flowQuota(orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: PAGE_SELECT }),
  ]);
  res.json({
    flows: flows.map(serializeFlow),
    quota,
    billing: await billingSummary(orgId, isSuperAdmin(req)),
    creator: { name: org?.name ?? null, handle: org?.slug ?? null },
    page: org && org.productLine === "TOUR" ? serializePage(org) : null,
    manager: org && org.productLine === "TOUR" ? await pageManager(org.managedByOrgId) : null,
  });
});

// Create a flow. Plan gate: maxFlows (all kinds count) → 403 { upgrade: true }.
router.post("/api/drift/my/flows", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const kind = parseFlowKind(req.body?.kind ?? "TOUR");
  if (!kind) return res.status(400).json({ error: "Unknown flow kind" });
  const noun = kind.toLowerCase();
  const name = str(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: `Give your ${noun} a name` });

  const endCta = parseCreatorCta(req.body?.endCta);
  if (!endCta.ok) return res.status(400).json({ error: endCta.error });
  const nextLabel = strOrNull(req.body?.nextLabel, 40) ?? null;

  const quota = await flowQuota(orgId);
  let created: { id: string; slug: string };
  try {
    // The limit is enforced inside the transaction (per-org lock): no double-create race.
    created = await createFlowWithQuota({
      orgId,
      kind,
      name,
      title: strOrNull(req.body?.title, 120) ?? null,
      description: strOrNull(req.body?.description, 600) ?? null,
      endCta: endCta.cta,
      nextLabel,
      createdByUserId: req.user?.id || null,
      maxFlows: null, // tours are unlimited — drifts are paid per drift (TOUR_V2_PLAN P3)
    });
  } catch (err) {
    if (err instanceof FlowError && err.status === 403 && req.user?.email) {
      void sendUpgradeNudgeEmail({
        email: req.user.email,
        name: req.user.name,
        kind,
        limit: `${quota.maxFlows} ${noun}${quota.maxFlows === 1 ? "" : "s"}`,
      }).catch(() => undefined);
    }
    return handle(res, err);
  }
  const slug = created.slug;
  console.log(`[${NS}] org ${orgId} created ${kind} flow ${created.id} (${slug})`);
  if (req.user?.email) {
    void sendFlowCreatedNoticeEmail({
      creatorEmail: req.user.email,
      creatorName: req.user.name,
      flowName: name,
      kind,
    }).catch(() => undefined);
  }
  const flow = await loadFlow(orgId, created.id);
  res.status(201).json({ flow: serializeFlow(flow), quota: { ...quota, usedFlows: quota.usedFlows + 1 } });
});

router.get("/api/drift/my/flows/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const flow = await loadFlow(orgId, req.params.id);
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  res.json({ flow: serializeFlow(flow), quota: await flowQuota(orgId), billing: await billingSummary(orgId, isSuperAdmin(req)) });
});

// Edit a flow's own fields. endCta / nextLabel changes re-derive the step links.
router.patch("/api/drift/my/flows/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const flow = await prisma.driftFlow.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true, kind: true, name: true, settings: true, isDemo: true, publishedAt: true },
  });
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  const body = req.body || {};
  const kind = parseFlowKind(flow.kind) ?? "TOUR";
  const data: Record<string, unknown> = {};
  let relink = false;

  if ("name" in body) {
    const name = str(body.name, 80);
    if (!name) return res.status(400).json({ error: "Name can't be empty" });
    data.name = name;
    // Until a flow has ever been published its link follows its name, so
    // "45 Birch" reads /tour/{page}/45-birch. Once shared, the link stays put.
    if (!flow.publishedAt && typeof body.slug !== "string" && name !== flow.name) {
      data.slug = await uniqueFlowSlug(kind, name, { excludeId: flow.id });
      relink = true;
    }
  }
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;
  if ("title" in body) data.title = strOrNull(body.title, 120) ?? null;
  if ("description" in body) data.description = strOrNull(body.description, 600) ?? null;
  if ("coverUrl" in body) {
    const cover = strOrNull(body.coverUrl, 2000) ?? null;
    if (cover && !isHttpUrl(cover)) return res.status(400).json({ error: "Cover must be an image URL" });
    data.coverUrl = cover;
  }
  if ("endCta" in body) {
    const parsed = parseCreatorCta(body.endCta);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    data.endCta = parsed.cta ? (parsed.cta as any) : Prisma.DbNull;
    relink = true;
  }
  if ("nextLabel" in body) {
    const nextLabel = strOrNull(body.nextLabel, 40) ?? null;
    const settings = flow.settings && typeof flow.settings === "object" ? (flow.settings as any) : {};
    data.settings = { ...settings, nextLabel };
    relink = true;
  }
  if (typeof body.slug === "string") {
    const s = slugifyFlow(body.slug);
    if (!s) return res.status(400).json({ error: "That link isn't valid" });
    if (isReservedFlowSlug(s) && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "That link is reserved" });
    }
    const clash = await prisma.driftFlow.findFirst({
      where: { kind, slug: s, NOT: { id: flow.id } },
      select: { id: true },
    });
    if (clash) return res.status(409).json({ error: "That link is already taken" });
    data.slug = s;
    relink = true;
  }
  if ("order" in body) data.order = Math.max(0, Math.floor(Number(body.order)) || 0);
  if (typeof body.isDemo === "boolean" && isSuperAdmin(req)) data.isDemo = body.isDemo;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.driftFlow.update({ where: { id: flow.id }, data: data as any });
    if (relink) await relinkFlow(tx, flow.id);
  });
  res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
});

// Delete a flow and the drifts it created.
router.delete("/api/drift/my/flows/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const flow = await prisma.driftFlow.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true, isDemo: true },
  });
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  if (flow.isDemo && !isSuperAdmin(req)) return res.status(403).json({ error: "The demo can't be deleted" });
  await deleteFlow(flow.id);
  res.json({ ok: true });
});

router.post("/api/drift/my/flows/:id/publish", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const flow = await prisma.driftFlow.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true },
  });
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  try {
    await setFlowPublished(flow.id, true);
  } catch (err) {
    return handle(res, err);
  }
  const published = serializeFlow(await loadFlow(orgId, flow.id));
  if (req.user?.email) {
    void sendFlowPublishedEmails({
      creatorEmail: req.user.email,
      creatorName: req.user.name,
      flowName: published.name,
      kind: published.kind,
      publicPath: published.publicPath,
      steps: published.counts.steps,
    }).catch(() => undefined);
  }
  res.json({ flow: published });
});

router.post("/api/drift/my/flows/:id/unpublish", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const flow = await prisma.driftFlow.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true },
  });
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  try {
    await setFlowPublished(flow.id, false);
  } catch (err) {
    return handle(res, err);
  }
  res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
});

// Checkout: one Stripe Checkout for every drift in this flow that's waiting for payment.
router.post("/api/drift/my/flows/:id/checkout", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  try {
    const result = await createFlowCheckout({
      orgId,
      flowId: req.params.id,
      userId: req.user?.id || null,
      email: req.user?.email || null,
      origin: req.headers.origin,
    });
    res.json(result);
  } catch (err) {
    return handle(res, err);
  }
});

// The checkout return page confirms the session (idempotent with the webhook).
router.post("/api/drift/my/checkout/confirm", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  try {
    const result = await confirmCheckoutSession(String(req.body?.sessionId || "").trim(), orgId);
    res.json(result);
  } catch (err) {
    return handle(res, err);
  }
});

// Upload a cover image for a flow (the creator home + share previews show it
// instead of the first stop's frame). PATCH { coverUrl } picks a stop's frame or
// clears it back to the default.
router.post(
  "/api/drift/my/flows/:id/cover",
  authenticateToken,
  imageUpload.single("image"),
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const flow = await prisma.driftFlow.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "An image is required" });
    const ext = IMAGE_EXT[file.mimetype];
    if (!ext) return res.status(400).json({ error: "Please upload a JPG, PNG or WebP image" });
    const url = await uploadManagedBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      keyPrefix: `drift/org_${orgId}/flow_${flow.id}/cover`,
      fallbackExtension: ext,
    });
    await prisma.driftFlow.update({ where: { id: flow.id }, data: { coverUrl: url } });
    console.log(`[${NS}] flow ${flow.id} cover uploaded`);
    res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
  },
);

// The caller's page: name, link, logo, contact button, demo.
router.get("/api/drift/my/page", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: PAGE_SELECT });
  if (!org || org.productLine !== "TOUR") return res.status(404).json({ error: "This account has no tour page" });
  res.json({
    page: serializePage(org),
    manager: await pageManager(org.managedByOrgId),
    demo: await resolveDemo(org, "TOUR"),
    quota: await flowQuota(orgId),
  });
});

// Edit the page: { name?, contactLabel?, contactUrl?, demoFlowId?, logoUrl?: null }.
router.patch("/api/drift/my/page", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: PAGE_SELECT });
  if (!org || org.productLine !== "TOUR") return res.status(404).json({ error: "This account has no tour page" });
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  const settings = { ...pageSettingsOf(org) };

  if ("name" in body) {
    const name = str(body.name, 80);
    if (!name) return res.status(400).json({ error: "Page name can't be empty" });
    data.name = name;
  }
  if ("contactLabel" in body) settings.contactLabel = strOrNull(body.contactLabel, 40) ?? null;
  if ("contactUrl" in body) {
    const url = strOrNull(body.contactUrl, 500) ?? null;
    if (url && !isContactUrl(url)) {
      return res.status(400).json({ error: "The contact link must be a web address, an email (mailto:) or a phone (tel:)" });
    }
    settings.contactUrl = url;
  }
  if ("demoFlowId" in body) {
    const id = strOrNull(body.demoFlowId, 60) ?? null;
    if (id) {
      const own = await prisma.driftFlow.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
      if (!own) return res.status(400).json({ error: "Pick one of this page's tours" });
    }
    settings.demoFlowId = id;
  }
  if ("accountType" in body) {
    const t = parseAccountType(body.accountType);
    if (!t) return res.status(400).json({ error: "Account type must be General or Pro" });
    data.tourAccountType = t;
  }
  if ("logoUrl" in body && !body.logoUrl) settings.logoUrl = null;
  data.tourSettings = settings;

  const updated = await prisma.organization.update({ where: { id: orgId }, data: data as any, select: PAGE_SELECT });
  res.json({ page: serializePage(updated), demo: await resolveDemo(updated, "TOUR") });
});

// Upload the page logo (shown on the page, the pathway and every drift's title block).
router.post(
  "/api/drift/my/page/logo",
  authenticateToken,
  imageUpload.single("image"),
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: PAGE_SELECT });
    if (!org || org.productLine !== "TOUR") return res.status(404).json({ error: "This account has no tour page" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "An image is required" });
    const ext = IMAGE_EXT[file.mimetype];
    if (!ext) return res.status(400).json({ error: "Please upload a JPG, PNG or WebP image" });
    const url = await uploadManagedBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      keyPrefix: `drift/org_${orgId}/page/logo`,
      fallbackExtension: ext,
    });
    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: { tourSettings: { ...pageSettingsOf(org), logoUrl: url } },
      select: PAGE_SELECT,
    });
    console.log(`[${NS}] page ${orgId} logo uploaded`);
    res.json({ page: serializePage(updated) });
  },
);

// ── Pro pages: the client pages they create and manage ──
router.get("/api/drift/my/client-pages", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  res.json({ pages: await listClientPages(orgId) });
});

router.post("/api/drift/my/client-pages", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  const u = req.user || {};
  try {
    const result = await createClientPage({
      proOrgId: orgId,
      name: String(req.body?.name || ""),
      identity: { authUserId: u.authUserId || null, email: String(u.email || ""), name: u.name || null },
    });
    res.status(201).json(result);
  } catch (err) {
    return handle(res, err);
  }
});

// ── General pages: Invite a Pro ──
router.get("/api/drift/my/page/invites", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  res.json({ invites: await listProInvites(orgId) });
});

router.post("/api/drift/my/page/invites", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  try {
    const invite = await createProInvite({
      orgId,
      email: String(req.body?.email || ""),
      inviter: { id: req.user?.id || null, email: req.user?.email || null, name: req.user?.name || null },
    });
    res.status(201).json({ invite });
  } catch (err) {
    return handle(res, err);
  }
});

router.delete("/api/drift/my/page/invites/:inviteId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return;
  try {
    await revokeProInvite(orgId, req.params.inviteId);
    res.json({ ok: true });
  } catch (err) {
    return handle(res, err);
  }
});

// A page, publicly: its name/logo/contact, the demo, and its Featured tours
// (published, not hidden). ?kind=TOUR (default).
router.get("/api/drift/public/pages/:page", async (req: AuthenticatedRequest, res: Response) => {
  const kind = parseFlowKind(req.query.kind ?? "TOUR") ?? "TOUR";
  const org = await findPublicPage(req.params.page);
  if (!org) return res.status(404).json({ error: "Not found" });
  const flows = await prisma.driftFlow.findMany({
    where: { organizationId: org.id, kind, status: "PUBLISHED", hidden: false },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: flowInclude,
  });
  res.json({
    page: serializePage(org),
    demo: await resolveDemo(org, kind),
    flows: flows.map(serializePublicFlow).filter((f) => f.steps.length > 0),
  });
});

// One published flow's pathway menu: /{kind}/{page}/{slug}.
router.get("/api/drift/public/pages/:page/flows/:slug", async (req: AuthenticatedRequest, res: Response) => {
  const org = await findPublicPage(req.params.page);
  if (!org) return res.status(404).json({ error: "Not found" });
  const flow = await prisma.driftFlow.findFirst({
    where: { organizationId: org.id, slug: String(req.params.slug || "").trim().toLowerCase(), status: "PUBLISHED" },
    include: flowInclude,
  });
  if (!flow) return res.status(404).json({ error: "Not found", page: serializePage(org) });
  res.json({ page: serializePage(org), flow: serializePublicFlow(flow) });
});

// ───────────────────────────── steps ─────────────────────────────

// Add a DRIFT step: multipart { video, name?, background?, driftDirection? }. The clip is
// validated; the drift is free while the page has free drifts left (COMP for a
// superadmin), otherwise it waits for checkout — the clip is stored and nothing is
// converted until Stripe confirms payment. Responds 201 with the flow (+ billing); the
// builder polls GET /my/flows/:id until the drift is READY.
router.post(
  "/api/drift/my/flows/:id/steps",
  authenticateToken,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    const orgId = await requireOrg(req, res);
    if (!orgId) return rmFile(file?.path);
    const flow = await prisma.driftFlow.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true, kind: true, steps: { select: { id: true } } },
    });
    if (!flow) {
      await rmFile(file?.path);
      return res.status(404).json({ error: "Flow not found" });
    }
    const kind = parseFlowKind(flow.kind) ?? "TOUR";
    if (String(req.body?.stepType || "DRIFT").toUpperCase() !== "DRIFT") {
      await rmFile(file?.path);
      return res.status(400).json({ error: "Only drift steps are available yet" });
    }
    if (!file) return res.status(400).json({ error: "A clip is required" });

    const superAdmin = isSuperAdmin(req);
    if (!superAdmin && flow.steps.length >= MAX_DRIFTS_PER_FLOW) {
      await rmFile(file.path);
      return handle(res, stepLimitError(kind, MAX_DRIFTS_PER_FLOW, flow.steps.length));
    }
    const background = parseBackground(req.body?.background);
    if (background === false) {
      await rmFile(file.path);
      return res.status(400).json({ error: "Background must be a colour (e.g. #101418) or transparent" });
    }
    const clip = await validateClip(orgId, file, res, superAdmin);
    if (!clip) return;

    const name = str(req.body?.name, 120) || `${stepNoun(kind)} ${flow.steps.length + 1}`;
    let created: Awaited<ReturnType<typeof createDriftStep>>;
    const createStep = async () =>
      createDriftStep({
        flowId: flow.id,
        orgId,
        userId: req.user?.id || null,
        slug: await uniqueSlug(orgId, name),
        name,
        title: null,
        titleEnd: null,
        description: null,
        background,
        customCta: null,
        loopEnabled: false,
        driftDirection: parseDirection(req.body?.driftDirection) || "LTR",
        ctaPlacement: "CENTER",
        maxSteps: superAdmin ? null : MAX_DRIFTS_PER_FLOW,
        kind,
        billing: superAdmin ? "COMP" : "AUTO",
      });
    try {
      try {
        created = await createStep();
      } catch (err: any) {
        // Two uploads at once (two tabs) can pick the same free link — pick again, once.
        if (err?.code !== "P2002") throw err;
        created = await createStep();
      }
    } catch (err) {
      // Nothing is queued yet — don't leave the (up to 500 MB) upload in the temp dir.
      await rmFile(file.path);
      return handle(res, err);
    }
    const { product, step, billingStatus } = created;

    if (billingStatus === "AWAITING_PAYMENT") {
      try {
        await storePendingClip({ productId: product.id, orgId, file, frameCount: clip.frameCount });
      } catch (err) {
        console.error(`[${NS}] couldn't store the clip for ${product.id}:`, err);
        await deleteStep(flow.id, step.id).catch(() => undefined);
        await rmFile(file.path);
        return res.status(500).json({ error: "We couldn't save that clip. Please try again." });
      }
      await rmFile(file.path);
      const full = serializeFlow(await loadFlow(orgId, flow.id));
      return res.status(201).json({
        step: full.steps.find((s: any) => s.id === step.id) ?? null,
        flow: full,
        billing: await billingSummary(orgId, superAdmin),
      });
    }

    let full: ReturnType<typeof serializeFlow>;
    try {
      full = serializeFlow(await loadFlow(orgId, flow.id));
    } catch (err) {
      await rmFile(file.path);
      throw err;
    }
    res.status(201).json({
      step: full.steps.find((s: any) => s.id === step.id) ?? null,
      flow: full,
      billing: await billingSummary(orgId, superAdmin),
    });

    processClip({
      clip: "A",
      productId: product.id,
      orgId,
      videoPath: file.path,
      mimetype: file.mimetype,
      uploaderId: req.user?.id || null,
      frameCount: clip.frameCount,
      removal: "none",
    });
  },
);

// Replace a step's clip (also the "try again" for a FAILED step). A drift waiting for
// checkout just swaps its stored clip; a free/paid one rebuilds in place at no charge.
router.post(
  "/api/drift/my/flows/:id/steps/:stepId/clip",
  authenticateToken,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    const orgId = await requireOrg(req, res);
    if (!orgId) return rmFile(file?.path);
    const step = await prisma.driftFlowStep.findFirst({
      where: { id: req.params.stepId, flowId: req.params.id, flow: { organizationId: orgId } },
      select: { id: true, flowId: true, productId: true, product: { select: { status: true, billingStatus: true } } },
    });
    if (!step || !step.productId) {
      await rmFile(file?.path);
      return res.status(404).json({ error: "Step not found" });
    }
    if (!file) return res.status(400).json({ error: "A clip is required" });
    if (step.product?.status === "PROCESSING") {
      await rmFile(file.path);
      return res.status(409).json({ error: "This drift is still building — give it a moment" });
    }
    const clip = await validateClip(orgId, file, res, isSuperAdmin(req));
    if (!clip) return;

    if (step.product?.billingStatus === "AWAITING_PAYMENT") {
      let stored = false;
      try {
        stored = await storePendingClip({ productId: step.productId, orgId, file, frameCount: clip.frameCount });
      } finally {
        await rmFile(file.path);
      }
      if (!stored) {
        return res.status(409).json({ error: "This drift was just paid for and is converting — replace its clip once it's ready." });
      }
      const full = serializeFlow(await loadFlow(orgId, step.flowId));
      return res.json({ step: full.steps.find((s: any) => s.id === step.id) ?? null, flow: full });
    }

    let full: ReturnType<typeof serializeFlow>;
    try {
      await prisma.driftProduct.update({ where: { id: step.productId }, data: { status: "PROCESSING" } });
      // While it rebuilds the drift isn't viewable, so neighbours skip it until READY.
      await relinkFlow(prisma, step.flowId).catch((e) => console.error(`[${NS}] relink before rebuild failed:`, e));
      full = serializeFlow(await loadFlow(orgId, step.flowId));
    } catch (err) {
      await rmFile(file.path);
      throw err;
    }
    res.status(202).json({ step: full.steps.find((s: any) => s.id === step.id) ?? null, flow: full });

    processClip({
      clip: "A",
      productId: step.productId,
      orgId,
      videoPath: file.path,
      mimetype: file.mimetype,
      uploaderId: req.user?.id || null,
      frameCount: clip.frameCount,
      removal: "none",
    });
  },
);

// Reorder: body { stepIds: [...] } in the new order → orders + links re-derived
// in one transaction. Registered BEFORE /steps/:stepId so "reorder" isn't an id.
router.patch(
  "/api/drift/my/flows/:id/steps/reorder",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const flow = await prisma.driftFlow.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    const stepIds = Array.isArray(req.body?.stepIds)
      ? req.body.stepIds.map((s: unknown) => String(s)).filter(Boolean)
      : null;
    if (!stepIds) return res.status(400).json({ error: "stepIds must be an array" });
    try {
      await reorderSteps(flow.id, stepIds);
    } catch (err) {
      return handle(res, err);
    }
    res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
  },
);

// Edit a step's drift — the restricted creator field set (title/headlines/copy,
// background, its own button). ctaPrimary (Next) is never user-editable.
router.patch(
  "/api/drift/my/flows/:id/steps/:stepId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const step = await prisma.driftFlowStep.findFirst({
      where: { id: req.params.stepId, flowId: req.params.id, flow: { organizationId: orgId } },
      select: { id: true, flowId: true, productId: true },
    });
    if (!step) return res.status(404).json({ error: "Step not found" });
    const body = req.body || {};
    const data: Record<string, unknown> = {};

    if ("name" in body) {
      const name = str(body.name, 120);
      if (!name) return res.status(400).json({ error: "Title can't be empty" });
      data.name = name;
    }
    if ("title" in body) data.title = strOrNull(body.title, 120) ?? null;
    if ("titleEnd" in body) data.titleEnd = strOrNull(body.titleEnd, 120) ?? null;
    if ("description" in body) data.description = strOrNull(body.description, 600) ?? null;
    if ("descriptionEnd" in body) data.descriptionEnd = strOrNull(body.descriptionEnd, 600) ?? null;
    if ("background" in body) {
      const background = parseBackground(body.background);
      if (background === false) {
        return res.status(400).json({ error: "Background must be a colour (e.g. #101418) or transparent" });
      }
      data.background = background;
    }
    if (typeof body.loopEnabled === "boolean") data.loopEnabled = body.loopEnabled;
    if ("driftDirection" in body) {
      const d = parseDirection(body.driftDirection);
      if (!d) return res.status(400).json({ error: "Direction must be LTR, RTL, TTB or BTT" });
      data.driftDirection = d;
    }
    if ("ctaPlacement" in body) {
      const p = parseCtaPlacement(body.ctaPlacement);
      if (!p) return res.status(400).json({ error: "Button placement must be CENTER, CENTER_REV, LEFT, RIGHT, SPLIT or SPLIT_REV" });
      data.ctaPlacement = p;
    }
    let customCta: CreatorCta | null | undefined;
    if ("customCta" in body) {
      const parsed = parseCreatorCta(body.customCta);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      customCta = parsed.cta;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length && step.productId) {
        await tx.driftProduct.update({ where: { id: step.productId }, data: data as any });
      }
      if (customCta !== undefined) {
        await tx.driftFlowStep.update({
          where: { id: step.id },
          data: { customCta: customCta ? (customCta as any) : Prisma.DbNull },
        });
      }
      // A rename changes the next-drift button (label + URL) on its neighbour.
      if (customCta !== undefined || "name" in data) await relinkFlow(tx, step.flowId);
    });
    const full = serializeFlow(await loadFlow(orgId, step.flowId));
    res.json({ step: full.steps.find((s: any) => s.id === step.id) ?? null, flow: full });
  },
);

// Remove a step (and its drift); the rest renumber + relink.
router.delete(
  "/api/drift/my/flows/:id/steps/:stepId",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const flow = await prisma.driftFlow.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      select: { id: true },
    });
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    try {
      await deleteStep(flow.id, req.params.stepId);
    } catch (err) {
      return handle(res, err);
    }
    res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
  },
);

// ───────────────────────────── public ─────────────────────────────

// A published flow by /{kind}/{slug}. "demo" resolves the client's demo flow of
// that kind whatever its slug. The entry drift plays via the normal player; the
// auto CTAs carry the viewer along the path.
router.get("/api/drift/public/flows/:kind/:slug", async (req: AuthenticatedRequest, res: Response) => {
  const kind = parseFlowKind(req.params.kind);
  if (!kind) return res.status(404).json({ error: "Not found" });
  const slug = String(req.params.slug || "").trim().toLowerCase();
  const flow = await prisma.driftFlow.findFirst({
    where:
      slug === "demo"
        ? { kind, status: "PUBLISHED", OR: [{ isDemo: true }, { slug: "demo" }] }
        : { kind, slug, status: "PUBLISHED" },
    orderBy: [{ isDemo: "desc" }, { updatedAt: "desc" }],
    include: flowInclude,
  });
  if (!flow) return res.status(404).json({ error: "Not found" });
  res.json({ flow: serializePublicFlow(flow) });
});

export default router;
