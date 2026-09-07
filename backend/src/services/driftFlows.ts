import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./database";

// Drift flows — the drift.li self-serve creator suite (/tour, /view, /memory,
// /path). Domain logic shared by the creator API (routes/driftFlows.ts) and the
// drift product routes (relink hooks). A flow is an ORDERED path of steps; each
// DRIFT step is a normal DriftProduct whose primary CTA ("Next") is OWNED by the
// flow and regenerated from step order, so reordering can never break the path.
// Playback needs nothing new: the public player + driftNav already swap
// same-origin /p/{id} links in-app, instantly, keeping fullscreen.

const NS = "drift-flow";

export const FLOW_KINDS = ["TOUR", "VIEW", "MEMORY", "PATH"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];
export const parseFlowKind = (v: unknown): FlowKind | null => {
  const k = String(v ?? "").trim().toUpperCase();
  return (FLOW_KINDS as readonly string[]).includes(k) ? (k as FlowKind) : null;
};

/** Frames per step clip: every source frame, capped here (smooth scrubbing). */
export const STEP_TARGET_FRAMES = 180;
export const STEP_MIN_FRAMES = 12;
/** Slack over Organization.maxClipSeconds so a "5.2s" phone clip isn't rejected. */
export const CLIP_DURATION_TOLERANCE_S = 0.5;

const DEFAULT_NEXT_LABEL: Record<FlowKind, string> = {
  TOUR: "Next stop",
  VIEW: "Next view",
  MEMORY: "Next memory",
  PATH: "Continue",
};
const DEFAULT_END_LABEL: Record<FlowKind, string> = {
  TOUR: "Restart tour",
  VIEW: "Back to start",
  MEMORY: "Back to start",
  PATH: "Back to start",
};
export const stepNoun = (kind: FlowKind) =>
  kind === "TOUR" ? "Stop" : kind === "VIEW" ? "View" : kind === "MEMORY" ? "Memory" : "Step";

/** Player path of a step's drift. Relative on purpose: it works on drift.li AND any
 *  custom host, and it's exactly what the player intercepts for an instant in-app
 *  swap (frontend driftNav.resolveDriftTarget). */
export const stepPlayerPath = (productId: string) => `/p/${productId}`;
export const flowPublicPath = (kind: string, slug: string) => `/${kind.toLowerCase()}/${slug}`;

// Hosts a creator's own buttons may link to (drift + picdrift only — never external).
const CREATOR_LINK_HOSTS = (process.env.DRIFT_CREATOR_LINK_HOSTS || "drift.li,picdrift.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isCreatorLinkAllowed(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  // Browsers parse a backslash as a slash ("/\evil.com" → "//evil.com") — refuse them,
  // and refuse embedded whitespace outright.
  if (/[\\\s]/.test(u)) return false;
  // A path on this site (/p/…, /brand/slug, /tour/…): must still be on-site once resolved.
  if (u.startsWith("/")) {
    if (u.startsWith("//")) return false;
    try {
      return new URL(u, "https://drift.li").origin === "https://drift.li";
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return CREATOR_LINK_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export type CreatorCta = { label: string; url: string };
export type CtaParse = { ok: true; cta: CreatorCta | null } | { ok: false; error: string };

/** Parse a creator-supplied button (object, or a JSON string from multipart).
 *  Absent/empty → ok + null (clears it). External links are rejected. */
export function parseCreatorCta(raw: unknown): CtaParse {
  let v = raw;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return { ok: true, cta: null };
    try {
      v = JSON.parse(s);
    } catch {
      return { ok: false, error: "Button must be an object { label, url }" };
    }
  }
  if (v === null || v === undefined) return { ok: true, cta: null };
  if (typeof v !== "object") return { ok: false, error: "Button must be an object { label, url }" };
  const label = String((v as any).label ?? "").trim().slice(0, 40);
  const url = String((v as any).url ?? "").trim().slice(0, 2000);
  if (!label && !url) return { ok: true, cta: null };
  if (!label) return { ok: false, error: "Button label is required" };
  if (!url) return { ok: false, error: "Button link is required" };
  if (!isCreatorLinkAllowed(url)) {
    return {
      ok: false,
      error: `Buttons can only link to ${CREATOR_LINK_HOSTS.join(" or ")} (or a page on this site)`,
    };
  }
  return { ok: true, cta: { label, url } };
}

/** Player background: "transparent", a hex colour, or rgb()/rgba(). */
const BACKGROUND_RE = /^(transparent|#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/i;
export const parseBackground = (v: unknown): string | null | false => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().slice(0, 40);
  if (!s) return null;
  return BACKGROUND_RE.test(s) ? s : false;
};

/** Error the creator routes translate into an HTTP response. */
export class FlowError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Serialize plan-limit checks per org (row lock on the org for the transaction). */
const lockOrg = async (db: Prisma.TransactionClient, orgId: string) => {
  await db.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
};

const planLimit = (message: string, limit: number, used: number) =>
  new FlowError(403, message, { upgrade: true, code: "PLAN_LIMIT", details: { upgrade: true, limit, used } });

export const flowLimitError = (kind: FlowKind, limit: number, used: number) => {
  const noun = kind.toLowerCase();
  return planLimit(`Your plan includes ${limit} ${noun}${limit === 1 ? "" : "s"}. Upgrade to create more.`, limit, used);
};
export const stepLimitError = (kind: FlowKind, limit: number, used: number) => {
  const noun = stepNoun(kind).toLowerCase();
  return planLimit(`Your plan allows ${limit} ${noun}s per ${kind.toLowerCase()}. Upgrade to add more.`, limit, used);
};

const settingsOf = (flow: { settings: unknown }): Record<string, any> =>
  flow.settings && typeof flow.settings === "object" ? (flow.settings as Record<string, any>) : {};

const isReady = (status: string | null | undefined) => status === "READY" || status === "PUBLISHED";

// ───────────────────────────── links (the core) ─────────────────────────────

/**
 * Single source of truth for a path's links. Re-derives every DRIFT step's
 * primary CTA from step order (Next → the following drift; the last step gets the
 * flow's own endCta, else "back to start"), mirrors each step's own button into
 * ctaSecondary, and normalizes `order` to 0..n-1 (gaps appear after a cascade
 * delete). Run it inside the same transaction as any step create/reorder/delete.
 */
export async function relinkFlow(db: Db, flowId: string): Promise<void> {
  const flow = await db.driftFlow.findUnique({
    where: { id: flowId },
    select: {
      id: true,
      kind: true,
      endCta: true,
      settings: true,
      steps: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, stepType: true, productId: true, customCta: true },
      },
    },
  });
  if (!flow) return;
  const kind = parseFlowKind(flow.kind) ?? "TOUR";
  const nextLabel =
    String(settingsOf(flow).nextLabel || "").trim().slice(0, 40) || DEFAULT_NEXT_LABEL[kind];

  for (let i = 0; i < flow.steps.length; i++) {
    if (flow.steps[i].order !== i) {
      await db.driftFlowStep.update({ where: { id: flow.steps[i].id }, data: { order: i } });
    }
  }

  const drifts = flow.steps.filter((s) => s.stepType === "DRIFT" && s.productId);
  const entry = drifts[0];
  for (let i = 0; i < drifts.length; i++) {
    const step = drifts[i];
    const next = drifts[i + 1];
    let primary: CreatorCta | null = null;
    if (next?.productId) primary = { label: nextLabel, url: stepPlayerPath(next.productId) };
    else if (flow.endCta && typeof flow.endCta === "object") primary = flow.endCta as CreatorCta;
    else if (drifts.length > 1 && entry?.productId) {
      primary = { label: DEFAULT_END_LABEL[kind], url: stepPlayerPath(entry.productId) };
    }
    const secondary =
      step.customCta && typeof step.customCta === "object" ? (step.customCta as CreatorCta) : null;
    await db.driftProduct.update({
      where: { id: step.productId as string },
      data: {
        ctaPrimary: primary ? (primary as any) : Prisma.DbNull,
        ctaSecondary: secondary ? (secondary as any) : Prisma.DbNull,
      },
    });
  }
}

/** The flow a product is a step of (null when it isn't one). Capture it BEFORE
 *  deleting the product — the DB cascades the step away — then relink. */
export async function stepFlowIdForProduct(productId: string): Promise<string | null> {
  const step = await prisma.driftFlowStep.findUnique({ where: { productId }, select: { flowId: true } });
  return step?.flowId ?? null;
}

export async function isFlowStepProduct(productId: string): Promise<boolean> {
  return (await stepFlowIdForProduct(productId)) !== null;
}

// ───────────────────────────── quota ─────────────────────────────

export type FlowQuota = {
  maxFlows: number;
  usedFlows: number;
  maxStepsPerFlow: number;
  maxClipSeconds: number;
};

export async function flowQuota(orgId: string): Promise<FlowQuota> {
  const [org, usedFlows] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { maxFlows: true, maxStepsPerFlow: true, maxClipSeconds: true },
    }),
    prisma.driftFlow.count({ where: { organizationId: orgId } }),
  ]);
  return {
    maxFlows: org?.maxFlows ?? 1,
    usedFlows,
    maxStepsPerFlow: org?.maxStepsPerFlow ?? 3,
    maxClipSeconds: org?.maxClipSeconds ?? 5,
  };
}

// ───────────────────────────── slugs ─────────────────────────────

export const slugifyFlow = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// Segments under /{kind}/ the app may need for itself; creators can't take them.
const RESERVED_FLOW_SLUGS = new Set([
  "demo", "new", "create", "edit", "admin", "api", "me", "my",
  "start", "signup", "login", "callback", // static /tour/* app routes
]);

export const isReservedFlowSlug = (slug: string) => RESERVED_FLOW_SLUGS.has(slug);

/** A slug unique per kind (the public URL is /{kind}/{slug}); suffixes on clash. */
export async function uniqueFlowSlug(
  kind: FlowKind,
  name: string,
  opts?: { allowReserved?: boolean; excludeId?: string },
): Promise<string> {
  const base = slugifyFlow(name) || kind.toLowerCase();
  for (let i = 0; i < 8; i++) {
    const slug = i === 0 ? base : `${base}-${crypto.randomBytes(2).toString("hex")}`;
    if (RESERVED_FLOW_SLUGS.has(slug) && !opts?.allowReserved) continue;
    const clash = await prisma.driftFlow.findFirst({
      where: { kind, slug, ...(opts?.excludeId ? { NOT: { id: opts.excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
  }
  return `${base}-${crypto.randomBytes(4).toString("hex")}`;
}

// ───────────────────────────── reads ─────────────────────────────

/** What a step's drift exposes to the builder (spin manifest only for the thumb). */
const stepProductSelect = {
  id: true,
  name: true,
  slug: true,
  title: true,
  titleEnd: true,
  description: true,
  descriptionEnd: true,
  background: true,
  status: true,
  defaultFrame: true,
  thumbnailUrl: true,
  ctaPrimary: true,
  ctaSecondary: true,
  updatedAt: true,
  spin: { select: { frameCount: true, manifest: true } },
};

export const flowInclude = {
  steps: {
    orderBy: { order: "asc" as const },
    include: { product: { select: stepProductSelect } },
  },
};

export function serializeStepProduct(p: any) {
  if (!p) return null;
  const m = p.spin?.manifest || {};
  const frames: string[] = Array.isArray(m.frames) ? m.frames : [];
  return {
    id: p.id as string,
    name: p.name as string,
    slug: p.slug as string,
    title: (p.title ?? null) as string | null,
    titleEnd: (p.titleEnd ?? null) as string | null,
    description: (p.description ?? null) as string | null,
    descriptionEnd: (p.descriptionEnd ?? null) as string | null,
    background: (p.background ?? null) as string | null,
    status: p.status as string,
    defaultFrame: (p.defaultFrame ?? 0) as number,
    frameCount: (p.spin?.frameCount ?? frames.length) as number,
    thumb: (p.thumbnailUrl || frames[p.defaultFrame] || frames[0] || null) as string | null,
    ctaPrimary: (p.ctaPrimary ?? null) as CreatorCta | null,
    ctaSecondary: (p.ctaSecondary ?? null) as CreatorCta | null,
    playerPath: stepPlayerPath(p.id),
    updatedAt: p.updatedAt as Date,
  };
}

export function serializeStep(s: any) {
  return {
    id: s.id as string,
    flowId: s.flowId as string,
    order: s.order as number,
    stepType: s.stepType as string,
    customCta: (s.customCta ?? null) as CreatorCta | null,
    createdAt: s.createdAt as Date,
    updatedAt: s.updatedAt as Date,
    product: serializeStepProduct(s.product),
  };
}

export function serializeFlow(f: any) {
  const steps = (f.steps || []).map(serializeStep);
  const products = steps.map((s: any) => s.product).filter(Boolean);
  const counts = {
    steps: steps.length,
    ready: products.filter((p: any) => isReady(p.status)).length,
    processing: products.filter((p: any) => p.status === "PROCESSING").length,
    failed: products.filter((p: any) => p.status === "FAILED").length,
  };
  const entry = products[0] || null;
  return {
    id: f.id as string,
    kind: f.kind as string,
    slug: f.slug as string,
    name: f.name as string,
    title: (f.title ?? null) as string | null,
    description: (f.description ?? null) as string | null,
    status: f.status as string,
    isDemo: !!f.isDemo,
    coverUrl: (f.coverUrl ?? null) as string | null,
    endCta: (f.endCta ?? null) as CreatorCta | null,
    settings: { nextLabel: (settingsOf(f).nextLabel ?? null) as string | null },
    order: (f.order ?? 0) as number,
    publishedAt: (f.publishedAt ?? null) as Date | null,
    createdAt: f.createdAt as Date,
    updatedAt: f.updatedAt as Date,
    publicPath: flowPublicPath(f.kind, f.slug),
    entryProductId: (entry?.id ?? null) as string | null,
    entryPath: entry ? stepPlayerPath(entry.id) : null,
    thumb: (f.coverUrl || entry?.thumb || null) as string | null,
    counts,
    steps,
  };
}

/** The public shape (/{kind}/{slug}): only steps whose drift is viewable. */
export function serializePublicFlow(f: any) {
  const full = serializeFlow(f);
  const steps = full.steps.filter((s: any) => s.product && isReady(s.product.status));
  const entry = steps[0]?.product ?? null;
  return {
    id: full.id,
    kind: full.kind,
    slug: full.slug,
    name: full.name,
    title: full.title,
    description: full.description,
    coverUrl: full.coverUrl,
    endCta: full.endCta,
    settings: full.settings,
    publicPath: full.publicPath,
    entryProductId: entry?.id ?? null,
    entryPath: entry ? stepPlayerPath(entry.id) : null,
    thumb: full.coverUrl || entry?.thumb || null,
    steps: steps.map((s: any) => ({
      id: s.id,
      order: s.order,
      productId: s.product.id,
      name: s.product.name,
      title: s.product.title,
      thumb: s.product.thumb,
      playerPath: s.product.playerPath,
    })),
  };
}

// ───────────────────────────── writes ─────────────────────────────

/** Create a DRIFT step + its (PROCESSING) drift, append it, relink — one transaction.
 *  The caller queues the clip processing AFTER this resolves. */
export async function createDriftStep(args: {
  flowId: string;
  orgId: string;
  userId: string | null;
  slug: string;
  name: string;
  title: string | null;
  titleEnd: string | null;
  description: string | null;
  background: string | null;
  customCta: CreatorCta | null;
  /** plan limit (null = unlimited, e.g. superadmin) — enforced INSIDE the transaction */
  maxSteps: number | null;
  kind: FlowKind;
}) {
  return prisma.$transaction(async (tx) => {
    await lockOrg(tx, args.orgId);
    if (args.maxSteps !== null) {
      const used = await tx.driftFlowStep.count({ where: { flowId: args.flowId } });
      if (used >= args.maxSteps) throw stepLimitError(args.kind, args.maxSteps, used);
    }
    const last = await tx.driftFlowStep.findFirst({
      where: { flowId: args.flowId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const product = await tx.driftProduct.create({
      data: {
        organizationId: args.orgId,
        slug: args.slug,
        name: args.name,
        title: args.title,
        titleEnd: args.titleEnd,
        description: args.description,
        background: args.background,
        status: "PROCESSING",
        loopEnabled: true,
        createdByUserId: args.userId,
      },
    });
    const step = await tx.driftFlowStep.create({
      data: {
        flowId: args.flowId,
        stepType: "DRIFT",
        order: (last?.order ?? -1) + 1,
        productId: product.id,
        customCta: args.customCta ? (args.customCta as any) : Prisma.DbNull,
      },
    });
    await relinkFlow(tx, args.flowId);
    console.log(
      `[${NS}] flow ${args.flowId} step ${step.id} created (product ${product.id}, order ${step.order})`,
    );
    return { product, step };
  });
}

export async function reorderSteps(flowId: string, stepIds: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const steps = await tx.driftFlowStep.findMany({ where: { flowId }, select: { id: true } });
    const have = new Set(steps.map((s) => s.id));
    const unique = new Set(stepIds);
    if (
      unique.size !== stepIds.length ||
      stepIds.length !== steps.length ||
      stepIds.some((id) => !have.has(id))
    ) {
      throw new FlowError(400, "stepIds must list every step of this flow exactly once");
    }
    for (let i = 0; i < stepIds.length; i++) {
      await tx.driftFlowStep.update({ where: { id: stepIds[i] }, data: { order: i } });
    }
    await relinkFlow(tx, flowId);
  });
  console.log(`[${NS}] flow ${flowId} reordered (${stepIds.length} steps)`);
}

/** Remove a step and its drift (the flow created that drift), then relink. */
export async function deleteStep(flowId: string, stepId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const step = await tx.driftFlowStep.findFirst({
      where: { id: stepId, flowId },
      select: { id: true, productId: true },
    });
    if (!step) throw new FlowError(404, "Step not found");
    if (step.productId) await tx.driftProduct.delete({ where: { id: step.productId } }); // cascades the step
    else await tx.driftFlowStep.delete({ where: { id: step.id } });
    await relinkFlow(tx, flowId);
  });
  console.log(`[${NS}] flow ${flowId} step ${stepId} deleted`);
}

/** Delete a flow together with the drifts it created. */
export async function deleteFlow(flowId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const steps = await tx.driftFlowStep.findMany({ where: { flowId }, select: { productId: true } });
    const ids = steps.map((s) => s.productId).filter((id): id is string => !!id);
    if (ids.length) await tx.driftProduct.deleteMany({ where: { id: { in: ids } } });
    await tx.driftFlow.delete({ where: { id: flowId } });
  });
  console.log(`[${NS}] flow ${flowId} deleted`);
}

/** Create a flow with the plan limit enforced inside the transaction (per-org lock). */
export async function createFlowWithQuota(args: {
  orgId: string;
  kind: FlowKind;
  name: string;
  title: string | null;
  description: string | null;
  endCta: CreatorCta | null;
  nextLabel: string | null;
  createdByUserId: string | null;
  /** null = unlimited (superadmin) */
  maxFlows: number | null;
}): Promise<{ id: string; slug: string }> {
  const slug = await uniqueFlowSlug(args.kind, args.name);
  return prisma.$transaction(async (tx) => {
    await lockOrg(tx, args.orgId);
    if (args.maxFlows !== null) {
      const used = await tx.driftFlow.count({ where: { organizationId: args.orgId } });
      if (used >= args.maxFlows) throw flowLimitError(args.kind, args.maxFlows, used);
    }
    return tx.driftFlow.create({
      data: {
        organizationId: args.orgId,
        kind: args.kind,
        slug,
        name: args.name,
        title: args.title,
        description: args.description,
        endCta: args.endCta ? (args.endCta as any) : Prisma.DbNull,
        settings: args.nextLabel ? { nextLabel: args.nextLabel } : Prisma.DbNull,
        createdByUserId: args.createdByUserId,
      },
      select: { id: true, slug: true },
    });
  });
}

/** Publish (every step must be READY) or unpublish a flow and its step drifts. */
export async function setFlowPublished(flowId: string, publish: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const flow = await tx.driftFlow.findUnique({
      where: { id: flowId },
      select: {
        id: true,
        steps: { select: { productId: true, product: { select: { status: true } } } },
      },
    });
    if (!flow) throw new FlowError(404, "Flow not found");
    const ids = flow.steps.map((s) => s.productId).filter((id): id is string => !!id);
    if (publish) {
      if (ids.length === 0) throw new FlowError(409, "Add at least one step before publishing");
      const pending = flow.steps.filter((s) => s.product && !isReady(s.product.status));
      if (pending.length) {
        throw new FlowError(409, "Every step must finish processing before you publish", {
          pending: pending.length,
        });
      }
      await tx.driftProduct.updateMany({ where: { id: { in: ids } }, data: { status: "PUBLISHED" } });
      await tx.driftFlow.update({
        where: { id: flowId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    } else {
      if (ids.length) {
        await tx.driftProduct.updateMany({
          where: { id: { in: ids }, status: "PUBLISHED" },
          data: { status: "READY" },
        });
      }
      await tx.driftFlow.update({ where: { id: flowId }, data: { status: "DRAFT" } });
    }
  });
  console.log(`[${NS}] flow ${flowId} ${publish ? "PUBLISHED" : "unpublished"}`);
}
