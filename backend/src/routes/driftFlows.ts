import express, { Router, Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { Prisma } from "@prisma/client";
import { prisma } from "../services/database";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { probeClipInfo } from "../services/rotation3d/pipeline";
import { IMMUTABLE_CACHE_CONTROL, uploadManagedBuffer } from "../utils/managedStorage";
import { parseCtaPlacement, parseDirection, processClip, uniqueSlug } from "./drift";
import { sendFlowCreatedNoticeEmail, sendFlowPublishedEmails, sendUpgradeNudgeEmail } from "../services/mail";
import { billingSummary, confirmCheckoutSession, createFlowCheckout, storePendingClip } from "../services/driftBilling";
import { MAX_PINS, ensurePinTrack, pinFrames, sanitizePins, serializePin } from "../services/driftPins";
import {
  createShareLink,
  deleteEnquiry,
  deleteShareLink,
  listEnquiries,
  listShareLinks,
  openShareLink,
  submitEnquiry,
} from "../services/driftEnquiries";
import { enquirySettingsOf, parseEnquirySettings } from "../services/tourEnquirySettings";
import {
  featureSourceId,
  resolveFeature,
  resolveFeatures,
  resolveOwnFeature,
  resolveOwnFeatures,
} from "../services/driftChannel";
import { ensureReportLink, ownerReport, recordAttention, removeReportLink, tourInsights } from "../services/driftInsights";
import { parseReelLayout, startTourReel, streamTourReel, tourReel } from "../services/driftReel";
import {
  createClientPage,
  createProInvite,
  listClientPages,
  listProInvites,
  listPageMembers,
  memberRole,
  PAGE_ROLE_RANK,
  pageManager,
  parseAccountType,
  removePageMember,
  revokeProInvite,
  updatePageMemberRole,
  type PageRole,
} from "../services/driftTourAccounts";
import {
  CLIP_DURATION_TOLERANCE_S,
  FlowError,
  STEP_INGEST_FPS,
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
  publicCredit,
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
// Org-scoped like the other /api/drift/my/* routes, plus page roles: Viewers read,
// Editors build tours, Admins also run the page (settings, people, client pages) and
// delete tours — a creator is the Admin of their own org. Superadmins skip the
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
type PageAccess = "VIEW" | "EDIT" | "ADMIN";
const ACCESS_ROLE: Record<PageAccess, PageRole> = { VIEW: "VIEWER", EDIT: "EDITOR", ADMIN: "ADMIN" };
// The caller's role on the page it acts on: a superadmin (their own page, or one they manage
// through X-Drift-Org) is an admin; everyone else is what their profile says.
const pageRoleOf = (req: AuthenticatedRequest): PageRole => (isSuperAdmin(req) ? "ADMIN" : memberRole(req.user));
// requireOrg + the role check: VIEW to read, EDIT to build tours, ADMIN for the page itself
// (settings, people, client pages) and for deleting tours.
const requirePage = async (req: AuthenticatedRequest, res: Response, access: PageAccess): Promise<string | null> => {
  const orgId = await requireOrg(req, res);
  if (!orgId) return null;
  if (PAGE_ROLE_RANK[pageRoleOf(req)] < PAGE_ROLE_RANK[ACCESS_ROLE[access]]) {
    res.status(403).json({
      error: access === "ADMIN" ? "Only this page's admins can do that." : "You have view-only access to this page.",
      code: "PAGE_ROLE",
    });
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
/**
 * What the CHANNEL owns about a tour it features, as opposed to what the creator owns. These are
 * the fields `mergeFeature` keeps from the entry rather than taking from the source: whether it
 * is featured or in the library, where it sits on the page, its address there, and whether it is
 * the demo. Curating those is the whole point of the channel.
 */
const CHANNEL_OWNED = new Set(["hidden", "order", "isDemo", "slug"]);

/**
 * A tour featured on the Drift channel is a POINTER at the creator's tour, not a copy of it
 * (services/driftChannel.ts), so its drifts, its name and its cover belong to the page that made
 * it and cannot be edited here. Every write addresses a flow as /api/drift/my/flows/:id, so one
 * guard on that prefix covers all of them — including the step, pin and reel routes underneath.
 *
 * What passes: reads; DELETE (removing the entry just un-features the tour); publishing and
 * unpublishing, which is the entry's own status; and a PATCH that touches nothing but
 * CHANNEL_OWNED fields — Feature / Move to Library being exactly that.
 */
router.use("/api/drift/my/flows/:id", async (req: AuthenticatedRequest, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") return next();
  // Deliberately NOT behind authenticateToken: every route below already runs it, and running
  // it twice would validate the session twice on every write. A caller with no token falls
  // straight through to the route's own 401, so nothing is looked up for a stranger either.
  if (!req.headers.authorization) return next();
  // req.url is the remainder after the mount path: "/" for the flow itself, "/publish", …
  const onTheFlow = req.path === "/" || req.path === "";
  const curating =
    (req.method === "PATCH" && onTheFlow && Object.keys(req.body || {}).every((k) => CHANNEL_OWNED.has(k))) ||
    (req.method === "POST" && (req.path === "/publish" || req.path === "/unpublish"));
  if (curating) return next();
  const flow = await prisma.driftFlow.findUnique({ where: { id: req.params.id }, select: { settings: true } });
  if (!flow || !featureSourceId(flow.settings)) return next();
  return res.status(409).json({
    error: "This tour is featured from another page — open it there to make changes.",
    feature: true,
  });
});

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

/** The contact button when a page has no link of its own AND takes no messages. */
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
    // "Contact {page}": its own link, else its message form (url null — the page's team gets it);
    // a page with neither falls back to PicDrift.
    contact: url
      ? { label: label || `Contact ${org.name}`, url }
      : enquirySettingsOf(s).enabled && org.slug
        ? { label: label || `Contact ${org.name}`, url: null }
        : { label: label || DEFAULT_CONTACT.label, url: DEFAULT_CONTACT.url },
    contactLabel: label || null,
    contactUrl: url || null,
    demoFlowId: typeof s.demoFlowId === "string" && s.demoFlowId ? (s.demoFlowId as string) : null,
    enquiries: enquirySettingsOf(s),
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
  const pick = { kind: true, slug: true, name: true, settings: true, organization: { select: { slug: true } } } as const;
  // A featured tour is named by the tour it points at, not by the label stored beside it.
  const liveName = async (f: { name: string; settings: unknown }) => {
    const sourceId = featureSourceId(f.settings);
    if (!sourceId) return f.name;
    const src = await prisma.driftFlow.findUnique({ where: { id: sourceId }, select: { name: true } });
    return src?.name ?? f.name;
  };
  if (typeof s.demoFlowId === "string" && s.demoFlowId) {
    const own = await prisma.driftFlow.findFirst({
      where: { id: s.demoFlowId, organizationId: org.id, status: "PUBLISHED" },
      select: pick,
    });
    if (own) return { name: await liveName(own), path: flowPublicPath(own.kind, own.organization?.slug, own.slug), own: true };
  }
  const site = await prisma.driftFlow.findFirst({
    where: { kind, status: "PUBLISHED", isDemo: true },
    orderBy: { updatedAt: "desc" },
    select: pick,
  });
  return site
    ? { name: await liveName(site), path: flowPublicPath(site.kind, site.organization?.slug, site.slug), own: false }
    : null;
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
  // The clip at STEP_INGEST_FPS (never more than its own rate, so no duplicated frames), up to the cap.
  const sampleFps = Math.min(STEP_INGEST_FPS, info.fps || STEP_INGEST_FPS);
  const sourceFrames = Math.round(info.duration * sampleFps);
  const frameCount = Math.min(STEP_TARGET_FRAMES, Math.max(STEP_MIN_FRAMES, sourceFrames));
  return { frameCount, duration: info.duration };
}

// ───────────────────────────── flows ─────────────────────────────

// The creator's flows (+ plan usage). ?kind=TOUR filters one kind.
router.get("/api/drift/my/flows", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
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
    flows: (await resolveOwnFeatures(flows)).map(serializeFlow),
    quota,
    billing: await billingSummary(orgId, isSuperAdmin(req)),
    role: pageRoleOf(req),
    creator: { name: org?.name ?? null, handle: org?.slug ?? null },
    page: org && org.productLine === "TOUR" ? serializePage(org) : null,
    manager: org && org.productLine === "TOUR" ? await pageManager(org.managedByOrgId) : null,
  });
});

// Create a flow. Plan gate: maxFlows (all kinds count) → 403 { upgrade: true }.
router.post("/api/drift/my/flows", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
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
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  const flow = await loadFlow(orgId, req.params.id);
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  const { flow: shown, missing } = await resolveOwnFeature(flow);
  res.json({
    flow: serializeFlow(shown),
    // A featured tour is shown, never edited: it belongs to the page that made it.
    feature: featureSourceId(flow.settings) ? { credit: publicCredit(flow.settings), missing } : null,
    quota: await flowQuota(orgId),
    billing: await billingSummary(orgId, isSuperAdmin(req)),
    role: pageRoleOf(req),
  });
});

// Edit a flow's own fields. endCta / nextLabel changes re-derive the step links.
router.patch("/api/drift/my/flows/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
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
  const orgId = await requirePage(req, res, "ADMIN");
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
  const orgId = await requirePage(req, res, "EDIT");
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
  const orgId = await requirePage(req, res, "EDIT");
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
  const orgId = await requirePage(req, res, "EDIT");
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
  const orgId = await requirePage(req, res, "VIEW");
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
    const orgId = await requirePage(req, res, "EDIT");
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
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });
    await prisma.driftFlow.update({ where: { id: flow.id }, data: { coverUrl: url } });
    console.log(`[${NS}] flow ${flow.id} cover uploaded`);
    res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
  },
);

// The caller's page: name, link, logo, contact button, demo.
router.get("/api/drift/my/page", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: PAGE_SELECT });
  if (!org || org.productLine !== "TOUR") return res.status(404).json({ error: "This account has no tour page" });
  res.json({
    page: serializePage(org),
    manager: await pageManager(org.managedByOrgId),
    demo: await resolveDemo(org, "TOUR"),
    quota: await flowQuota(orgId),
    role: pageRoleOf(req),
  });
});

// Edit the page: { name?, contactLabel?, contactUrl?, demoFlowId?, logoUrl?: null }.
router.patch("/api/drift/my/page", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
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
    // Chosen at signup; changing it afterwards is a drift.li team action (Admin → drift.li → Tour).
    if (t !== (org.tourAccountType || "GENERAL")) {
      if (!isSuperAdmin(req)) {
        return res.status(403).json({ error: "Your account type is set at signup — contact us to change it." });
      }
      data.tourAccountType = t;
    }
  }
  if ("logoUrl" in body && !body.logoUrl) settings.logoUrl = null;
  if ("enquiries" in body) settings.enquiries = parseEnquirySettings(body.enquiries);
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
    const orgId = await requirePage(req, res, "ADMIN");
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
      cacheControl: IMMUTABLE_CACHE_CONTROL,
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
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  res.json({ pages: await listClientPages(orgId) });
});

router.post("/api/drift/my/client-pages", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
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

// ── Page invites: any email, with the role accepting it grants ──
router.get("/api/drift/my/page/invites", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
  if (!orgId) return;
  res.json({ invites: await listProInvites(orgId) });
});

router.post("/api/drift/my/page/invites", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
  if (!orgId) return;
  try {
    const invite = await createProInvite({
      orgId,
      email: String(req.body?.email || ""),
      role: req.body?.role,
      inviter: { id: req.user?.id || null, email: req.user?.email || null, name: req.user?.name || null },
    });
    res.status(201).json({ invite });
  } catch (err) {
    return handle(res, err);
  }
});

router.delete("/api/drift/my/page/invites/:inviteId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
  if (!orgId) return;
  try {
    await revokeProInvite(orgId, req.params.inviteId);
    res.json({ ok: true });
  } catch (err) {
    return handle(res, err);
  }
});

// ── People: who can open this page, and as what ──
router.get("/api/drift/my/page/people", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  const role = pageRoleOf(req);
  const [members, invites] = await Promise.all([
    listPageMembers(orgId, req.user?.id || null),
    role === "ADMIN" ? listProInvites(orgId) : Promise.resolve([]),
  ]);
  res.json({ role, members, invites });
});

// Change someone's role: { role: ADMIN | EDITOR | VIEWER }.
router.patch("/api/drift/my/page/members/:memberId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
  if (!orgId) return;
  try {
    const result = await updatePageMemberRole({
      orgId,
      memberId: String(req.params.memberId || ""),
      role: req.body?.role,
      actorIsSuper: isSuperAdmin(req),
    });
    res.json(result);
  } catch (err) {
    return handle(res, err);
  }
});

// Remove someone's access — or your own ("Leave page"); the service checks which.
router.delete("/api/drift/my/page/members/:memberId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  try {
    const result = await removePageMember({
      orgId,
      memberId: String(req.params.memberId || ""),
      actorId: req.user?.id || null,
      actorIsAdmin: pageRoleOf(req) === "ADMIN",
      actorIsSuper: isSuperAdmin(req),
    });
    res.json(result);
  } catch (err) {
    return handle(res, err);
  }
});

// ── Enquiries: the page's "Book a viewing" / "Ask a question" button ──
// The visitor's IP for rate limiting: Cloudflare's / nginx's header first, then the first
// X-Forwarded-For hop, then the socket.
const clientIp = (req: AuthenticatedRequest) => {
  const h = (name: string) => String(req.headers[name] || "").split(",")[0].trim();
  return h("cf-connecting-ip") || h("x-real-ip") || h("x-forwarded-for") || req.ip || "unknown";
};

// A visitor sends an enquiry (public). Rate-limited per visitor; a honeypot field drops bots.
router.post("/api/drift/public/pages/:page/enquiries", async (req: AuthenticatedRequest, res: Response) => {
  const org = await findPublicPage(req.params.page);
  if (!org) return res.status(404).json({ error: "Not found" });
  try {
    await submitEnquiry(org, {
      body: req.body,
      ip: clientIp(req),
      referrer: typeof req.headers.referer === "string" ? req.headers.referer.slice(0, 300) : null,
      ua: typeof req.headers["user-agent"] === "string" ? String(req.headers["user-agent"]).slice(0, 300) : null,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    return handle(res, err);
  }
});

// The page team's enquiries, newest first (Editors and Admins).
router.get("/api/drift/my/page/enquiries", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  res.json({ enquiries: await listEnquiries(orgId) });
});

router.delete("/api/drift/my/page/enquiries/:enquiryId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "ADMIN");
  if (!orgId) return;
  try {
    await deleteEnquiry(orgId, String(req.params.enquiryId || ""));
    res.json({ ok: true });
  } catch (err) {
    return handle(res, err);
  }
});

// ── Personal links: one link per person for a tour ──
router.get("/api/drift/my/flows/:id/links", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  try {
    res.json({ links: await listShareLinks(orgId, req.params.id) });
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/api/drift/my/flows/:id/links", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  try {
    const link = await createShareLink({ orgId, flowId: req.params.id, label: req.body?.label, userId: req.user?.id || null });
    res.status(201).json({ link });
  } catch (err) {
    return handle(res, err);
  }
});

router.delete("/api/drift/my/flows/:id/links/:linkId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  try {
    await deleteShareLink(orgId, req.params.id, String(req.params.linkId || ""));
    res.json({ ok: true });
  } catch (err) {
    return handle(res, err);
  }
});

// The tour's unbranded (MLS-safe) link, drift.li/u/{code} — made on first use, then kept.
router.post("/api/drift/my/flows/:id/unbranded", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  const flow = await prisma.driftFlow.findFirst({ where: { id: req.params.id, organizationId: orgId }, select: { id: true, settings: true } });
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  const settings: Record<string, unknown> =
    flow.settings && typeof flow.settings === "object" ? { ...(flow.settings as Record<string, unknown>) } : {};
  const current = typeof settings.unbrandedCode === "string" ? settings.unbrandedCode : "";
  let code = /^[a-z0-9]{6,20}$/.test(current) ? current : "";
  if (!code) {
    const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = Array.from(crypto.randomBytes(10), (x) => alphabet[x % alphabet.length]).join("");
      const taken = await prisma.driftFlow.findFirst({
        where: { settings: { path: ["unbrandedCode"], equals: candidate } },
        select: { id: true },
      });
      if (!taken) code = candidate;
    }
    if (!code) return res.status(500).json({ error: "We couldn't make that link — please try again." });
    settings.unbrandedCode = code;
    await prisma.driftFlow.update({ where: { id: flow.id }, data: { settings: settings as Prisma.InputJsonValue } });
    console.log(`[${NS}] flow ${flow.id}: unbranded link made`);
  }
  res.json({ code, path: `/u/${code}` });
});

// ── Insights: what visitors do inside a tour (services/driftInsights.ts) ──
// The player's attention records (public). A beacon sends text/plain (no preflight); always 204,
// so a dropped record never bothers the visitor.
router.post(
  "/api/drift/public/attention",
  express.text({ type: "text/plain", limit: "16kb" }),
  async (req: AuthenticatedRequest, res: Response) => {
    await recordAttention(req.body, clientIp(req)).catch((err) =>
      console.warn(`[${NS}] attention record dropped:`, err instanceof Error ? err.message : err),
    );
    res.status(204).end();
  },
);

// The tour's Insights — everyone on the page (?days=7|30|90).
router.get("/api/drift/my/flows/:id/insights", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  try {
    res.json({ insights: await tourInsights(orgId, req.params.id, req.query.days) });
  } catch (err) {
    return handle(res, err);
  }
});

// The owner report link (/report/{code}): made on first use, kept until it's turned off.
router.post("/api/drift/my/flows/:id/report", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  try {
    res.json(await ensureReportLink(orgId, req.params.id));
  } catch (err) {
    return handle(res, err);
  }
});

router.delete("/api/drift/my/flows/:id/report", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  try {
    await removeReportLink(orgId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    return handle(res, err);
  }
});

// The owner report (public, read-only; counts only).
router.get("/api/drift/public/reports/:code", async (req: AuthenticatedRequest, res: Response) => {
  const report = await ownerReport(req.params.code, req.query.days);
  if (!report) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store");
  res.json({ report });
});

// ── Reel: the tour as a vertical video (services/driftReel.ts); ?layout=full (default, portrait) | landscape | framed ──
router.get("/api/drift/my/flows/:id/reel", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  try {
    res.json({ reel: await tourReel(orgId, req.params.id, parseReelLayout(req.query.layout)) });
  } catch (err) {
    return handle(res, err);
  }
});

// Make the reel (queued behind clip builds; an up-to-date reel comes straight back).
router.post("/api/drift/my/flows/:id/reel", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  try {
    res.status(202).json({ reel: await startTourReel(orgId, req.params.id, parseReelLayout(req.query.layout ?? req.body?.layout)) });
  } catch (err) {
    return handle(res, err);
  }
});

// The reel as a download (Content-Disposition: attachment).
router.get("/api/drift/my/flows/:id/reel/file", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  try {
    await streamTourReel(orgId, req.params.id, parseReelLayout(req.query.layout), res);
  } catch (err) {
    if (res.headersSent) return void res.end();
    return handle(res, err);
  }
});

// A visit through a personal link (public): counts the open; an unknown link is ignored.
router.post("/api/drift/public/links/:token/open", async (req: AuthenticatedRequest, res: Response) => {
  const opened = await openShareLink(String(req.params.token || "")).catch(() => null);
  res.json(opened ? { ok: true, flowId: opened.flowId } : { ok: false });
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
    // Featured tours read through their pointer; one whose tour has gone quietly drops out.
    flows: (await resolveFeatures(flows)).map(serializePublicFlow).filter((f) => f.steps.length > 0),
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
  const shown = await resolveFeature(flow);
  if (!shown) return res.status(404).json({ error: "Not found", page: serializePage(org) });
  // A demo (the site's, or this page's own "View Demo") is shown without the page's back link.
  const isDemo = flow.isDemo || pageSettingsOf(org).demoFlowId === flow.id;
  res.json({ page: serializePage(org), flow: { ...serializePublicFlow(shown), isDemo } });
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
    const orgId = await requirePage(req, res, "EDIT");
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
      cleanup: true,
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
    const orgId = await requirePage(req, res, "EDIT");
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
      cleanup: true,
    });
  },
);

// A page's Featured Tours order: body { flowIds: [...] } in the new order (Editors + Admins).
// The public page and the admin view both list tours by this order.
router.put("/api/drift/my/page/tour-order", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  const ids: string[] | null = Array.isArray(req.body?.flowIds)
    ? [...new Set<string>(req.body.flowIds.map((s: unknown) => String(s)).filter(Boolean))].slice(0, 500)
    : null;
  if (!ids || !ids.length) return res.status(400).json({ error: "flowIds must list the tours in order" });
  const own = await prisma.driftFlow.count({ where: { organizationId: orgId, id: { in: ids } } });
  if (own !== ids.length) return res.status(404).json({ error: "Some of those tours aren't on this page" });
  await prisma.$transaction(ids.map((id, i) => prisma.driftFlow.update({ where: { id }, data: { order: i } })));
  res.json({ ok: true });
});

// Reorder: body { stepIds: [...] } in the new order → orders + links re-derived
// in one transaction. Registered BEFORE /steps/:stepId so "reorder" isn't an id.
router.patch(
  "/api/drift/my/flows/:id/steps/reorder",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const orgId = await requirePage(req, res, "EDIT");
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
    const orgId = await requirePage(req, res, "EDIT");
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
    const orgId = await requirePage(req, res, "EDIT");
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

// ───────────────────────────── pins ─────────────────────────────

const pinStep = (orgId: string, flowId: string, stepId: string) =>
  prisma.driftFlowStep.findFirst({
    where: { id: stepId, flowId, flow: { organizationId: orgId } },
    select: {
      id: true,
      flowId: true,
      product: { select: { id: true, status: true, driftDirection: true, pinTrack: true, spin: { select: { manifest: true } } } },
    },
  });

// A drift's pins for the pin editor, with the frames to place them on and the motion
// track they follow (measured here the first time — a few seconds).
router.get("/api/drift/my/flows/:id/steps/:stepId/pins", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "VIEW");
  if (!orgId) return;
  const step = await pinStep(orgId, req.params.id, req.params.stepId);
  const product = step?.product;
  if (!product) return res.status(404).json({ error: "Step not found" });
  if (product.status !== "READY" && product.status !== "PUBLISHED") {
    return res.status(409).json({ error: "Pins can be added once this drift is ready" });
  }
  const frames = pinFrames(product.spin?.manifest);
  if (frames.length < 2) return res.status(409).json({ error: "This drift has no frames yet" });
  const [track, pins] = await Promise.all([
    ensurePinTrack(product),
    prisma.driftPin.findMany({ where: { productId: product.id }, orderBy: { order: "asc" } }),
  ]);
  res.json({
    frames,
    track: track && Array.isArray(track.shift) && track.shift.length === frames.length ? { axis: track.axis, shift: track.shift } : null,
    pins: pins.map(serializePin),
    maxPins: MAX_PINS,
  });
});

// Save a drift's pins (the whole set). They're live on the drift right away.
router.put("/api/drift/my/flows/:id/steps/:stepId/pins", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = await requirePage(req, res, "EDIT");
  if (!orgId) return;
  const step = await pinStep(orgId, req.params.id, req.params.stepId);
  const product = step?.product;
  if (!step || !product) return res.status(404).json({ error: "Step not found" });
  const frames = pinFrames(product.spin?.manifest);
  if (frames.length < 2) return res.status(409).json({ error: "This drift has no frames yet" });
  const parsed = sanitizePins(req.body?.pins, frames.length);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  await prisma.$transaction([
    prisma.driftPin.deleteMany({ where: { productId: product.id } }),
    ...(parsed.pins.length
      ? [
          prisma.driftPin.createMany({
            data: parsed.pins.map((p) => ({
              ...p,
              productId: product.id,
              keys: p.keys ? (p.keys as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            })),
          }),
        ]
      : []),
    // Touch the drift so open previews reload with the new pins.
    prisma.driftProduct.update({ where: { id: product.id }, data: { updatedAt: new Date() } }),
  ]);
  const pins = await prisma.driftPin.findMany({ where: { productId: product.id }, orderBy: { order: "asc" } });
  console.log(`[${NS}] product ${product.id}: ${pins.length} pin(s) saved`);
  res.json({ pins: pins.map(serializePin), flow: serializeFlow(await loadFlow(orgId, step.flowId)) });
});

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
  // A featured tour is a pointer: read through it, or this answers with a tour that has no drifts.
  const shown = await resolveFeature(flow);
  if (!shown) return res.status(404).json({ error: "Not found" });
  res.json({ flow: serializePublicFlow(shown) });
});

export default router;
