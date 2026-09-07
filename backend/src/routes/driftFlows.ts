import { Router, Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { Prisma } from "@prisma/client";
import { prisma } from "../services/database";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { probeClipInfo } from "../services/rotation3d/pipeline";
import { processClip, uniqueSlug } from "./drift";
import {
  CLIP_DURATION_TOLERANCE_S,
  FlowError,
  STEP_MIN_FRAMES,
  STEP_TARGET_FRAMES,
  createDriftStep,
  deleteFlow,
  deleteStep,
  flowInclude,
  flowQuota,
  isReservedFlowSlug,
  parseBackground,
  parseCreatorCta,
  parseFlowKind,
  relinkFlow,
  reorderSteps,
  serializeFlow,
  serializePublicFlow,
  setFlowPublished,
  slugifyFlow,
  stepNoun,
  uniqueFlowSlug,
  type CreatorCta,
} from "../services/driftFlows";

// Creator API for drift flows (drift.li/tour | view | memory | path).
// Org-scoped like the other /api/drift/my/* routes: any member of the caller's
// org (a creator is the ADMIN of their own personal org). Superadmins skip the
// plan quotas so the client can seed the demo flow. Clip processing reuses the
// drift pipeline verbatim; the flow's links are re-derived after every change.

const router = Router();
const NS = "drift-flow";

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `drift-flow-upload-${crypto.randomUUID()}.mp4`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const requireOrg = (req: AuthenticatedRequest, res: Response): string | null => {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    res.status(403).json({ error: "No organization on this account" });
    return null;
  }
  return orgId;
};
const isSuperAdmin = (req: AuthenticatedRequest) => req.user?.role === "SUPERADMIN";
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

// Probe + validate an uploaded clip against the org's plan. Deletes the temp
// file and writes the error response on failure (returns null).
async function validateClip(
  orgId: string,
  file: Express.Multer.File,
  res: Response,
): Promise<{ frameCount: number; duration: number } | null> {
  const quota = await flowQuota(orgId);
  const info = await probeClipInfo(file.path);
  if (!info.duration) {
    await rmFile(file.path);
    res.status(400).json({ error: "We couldn't read that clip. Please upload an MP4 or MOV video." });
    return null;
  }
  if (info.duration > quota.maxClipSeconds + CLIP_DURATION_TOLERANCE_S) {
    await rmFile(file.path);
    res.status(400).json({
      error: `Clips must be ${quota.maxClipSeconds} seconds or shorter — this one is ${info.duration.toFixed(1)}s.`,
      upgrade: true,
      limit: quota.maxClipSeconds,
      duration: info.duration,
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
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const kindRaw = req.query.kind;
  const kind = kindRaw !== undefined ? parseFlowKind(kindRaw) : null;
  if (kindRaw !== undefined && !kind) return res.status(400).json({ error: "Unknown flow kind" });
  const [flows, quota, org] = await Promise.all([
    prisma.driftFlow.findMany({
      where: { organizationId: orgId, ...(kind ? { kind } : {}) },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: flowInclude,
    }),
    flowQuota(orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, slug: true } }),
  ]);
  res.json({
    flows: flows.map(serializeFlow),
    quota,
    creator: { name: org?.name ?? null, handle: org?.slug ?? null },
  });
});

// Create a flow. Plan gate: maxFlows (all kinds count) → 403 { upgrade: true }.
router.post("/api/drift/my/flows", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const kind = parseFlowKind(req.body?.kind ?? "TOUR");
  if (!kind) return res.status(400).json({ error: "Unknown flow kind" });
  const noun = kind.toLowerCase();
  const name = str(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: `Give your ${noun} a name` });

  const quota = await flowQuota(orgId);
  if (!isSuperAdmin(req) && quota.usedFlows >= quota.maxFlows) {
    return res.status(403).json({
      error: `Your plan includes ${quota.maxFlows} ${noun}${quota.maxFlows === 1 ? "" : "s"}. Upgrade to create more.`,
      upgrade: true,
      limit: quota.maxFlows,
      used: quota.usedFlows,
    });
  }
  const endCta = parseCreatorCta(req.body?.endCta);
  if (!endCta.ok) return res.status(400).json({ error: endCta.error });
  const nextLabel = strOrNull(req.body?.nextLabel, 40) ?? null;

  const slug = await uniqueFlowSlug(kind, name);
  const created = await prisma.driftFlow.create({
    data: {
      organizationId: orgId,
      kind,
      slug,
      name,
      title: strOrNull(req.body?.title, 120) ?? null,
      description: strOrNull(req.body?.description, 600) ?? null,
      endCta: endCta.cta ? (endCta.cta as any) : Prisma.DbNull,
      settings: nextLabel ? { nextLabel } : Prisma.DbNull,
      createdByUserId: req.user?.id || null,
    },
    select: { id: true },
  });
  console.log(`[${NS}] org ${orgId} created ${kind} flow ${created.id} (${slug})`);
  const flow = await loadFlow(orgId, created.id);
  res.status(201).json({ flow: serializeFlow(flow), quota: { ...quota, usedFlows: quota.usedFlows + 1 } });
});

router.get("/api/drift/my/flows/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const flow = await loadFlow(orgId, req.params.id);
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  res.json({ flow: serializeFlow(flow), quota: await flowQuota(orgId) });
});

// Edit a flow's own fields. endCta / nextLabel changes re-derive the step links.
router.patch("/api/drift/my/flows/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
  if (!orgId) return;
  const flow = await prisma.driftFlow.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true, kind: true, settings: true, isDemo: true },
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
  }
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
  const orgId = requireOrg(req, res);
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
  const orgId = requireOrg(req, res);
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
  res.json({ flow: serializeFlow(await loadFlow(orgId, flow.id)) });
});

router.post("/api/drift/my/flows/:id/unpublish", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = requireOrg(req, res);
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

// ───────────────────────────── steps ─────────────────────────────

// Add a DRIFT step: multipart { video, name?, title?, titleEnd?, description?,
// background?, customCta? (JSON) }. Validates the clip against the plan, creates
// the (PROCESSING) drift + step, relinks, responds 201, then queues extraction.
// The builder polls GET /my/flows/:id until the step's product is READY.
router.post(
  "/api/drift/my/flows/:id/steps",
  authenticateToken,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    const orgId = requireOrg(req, res);
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

    const quota = await flowQuota(orgId);
    if (!isSuperAdmin(req) && flow.steps.length >= quota.maxStepsPerFlow) {
      await rmFile(file.path);
      const noun = stepNoun(kind).toLowerCase();
      return res.status(403).json({
        error: `Your plan allows ${quota.maxStepsPerFlow} ${noun}s per ${kind.toLowerCase()}. Upgrade to add more.`,
        upgrade: true,
        limit: quota.maxStepsPerFlow,
        used: flow.steps.length,
      });
    }
    const cta = parseCreatorCta(req.body?.customCta);
    if (!cta.ok) {
      await rmFile(file.path);
      return res.status(400).json({ error: cta.error });
    }
    const background = parseBackground(req.body?.background);
    if (background === false) {
      await rmFile(file.path);
      return res.status(400).json({ error: "Background must be a colour (e.g. #101418) or transparent" });
    }
    const clip = await validateClip(orgId, file, res);
    if (!clip) return;

    const name = str(req.body?.name, 120) || `${stepNoun(kind)} ${flow.steps.length + 1}`;
    const slug = await uniqueSlug(orgId, name);
    const { product, step } = await createDriftStep({
      flowId: flow.id,
      orgId,
      userId: req.user?.id || null,
      slug,
      name,
      title: strOrNull(req.body?.title, 120) ?? null,
      titleEnd: strOrNull(req.body?.titleEnd, 120) ?? null,
      description: strOrNull(req.body?.description, 600) ?? null,
      background,
      customCta: cta.cta,
    });
    const full = serializeFlow(await loadFlow(orgId, flow.id));
    res.status(201).json({ step: full.steps.find((s: any) => s.id === step.id) ?? null, flow: full });

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

// Replace a step's clip (also the "try again" for a FAILED step). Same checks as
// adding; the drift goes back to PROCESSING and its frames are rebuilt in place.
router.post(
  "/api/drift/my/flows/:id/steps/:stepId/clip",
  authenticateToken,
  videoUpload.single("video"),
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    const orgId = requireOrg(req, res);
    if (!orgId) return rmFile(file?.path);
    const step = await prisma.driftFlowStep.findFirst({
      where: { id: req.params.stepId, flowId: req.params.id, flow: { organizationId: orgId } },
      select: { id: true, flowId: true, productId: true, product: { select: { status: true } } },
    });
    if (!step || !step.productId) {
      await rmFile(file?.path);
      return res.status(404).json({ error: "Step not found" });
    }
    if (!file) return res.status(400).json({ error: "A clip is required" });
    if (step.product?.status === "PROCESSING") {
      await rmFile(file.path);
      return res.status(409).json({ error: "This step is still processing — give it a moment" });
    }
    const clip = await validateClip(orgId, file, res);
    if (!clip) return;

    await prisma.driftProduct.update({ where: { id: step.productId }, data: { status: "PROCESSING" } });
    const full = serializeFlow(await loadFlow(orgId, step.flowId));
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
    const orgId = requireOrg(req, res);
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
    const orgId = requireOrg(req, res);
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
        await relinkFlow(tx, step.flowId);
      }
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
    const orgId = requireOrg(req, res);
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
