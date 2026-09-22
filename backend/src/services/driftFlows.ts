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

/** Frames per step clip: the clip sampled at STEP_INGEST_FPS, capped here (smooth scrubbing). */
export const STEP_TARGET_FRAMES = 180;
export const STEP_MIN_FRAMES = 12;
/** Tour clips are sampled at this rate: a 60 fps phone clip keeps every other frame — half the
 *  frames to build, store and download, and the drift looks the same under a finger. At 30 fps the
 *  180-frame cap is 6 seconds of footage. Env TOUR_INGEST_FPS overrides it (10–60). */
export const STEP_INGEST_FPS = Math.min(60, Math.max(10, Number(process.env.TOUR_INGEST_FPS) || 30));
/** Slack over Organization.maxClipSeconds so a "5.2s" phone clip isn't rejected. */
export const CLIP_DURATION_TOLERANCE_S = 0.5;

export const stepNoun = (kind: FlowKind) =>
  kind === "TOUR" ? "Drift" : kind === "VIEW" ? "View" : kind === "MEMORY" ? "Memory" : "Step";

/** Fallback player path of a step's drift (by id) — only when the page has no slug.
 *  Relative on purpose: it works on drift.li AND any custom host, and the player
 *  intercepts it for an instant in-app swap (frontend driftNav.resolveDriftTarget). */
export const stepPlayerPath = (productId: string) => `/p/${productId}`;
const kindSeg = (kind: string) => String(kind || "TOUR").toLowerCase();
/** A page (the creator's profile — admin + public view): /tour/{page}. */
export const pagePublicPath = (pageSlug: string, kind: string = "TOUR") => `/${kindSeg(kind)}/${pageSlug}`;
/** A flow's main link, its pathway menu: /tour/{page}/{tour} (legacy /tour/{tour}
 *  only when the page has no slug). */
export const flowPublicPath = (kind: string, pageSlug: string | null | undefined, slug: string) =>
  pageSlug ? `/${kindSeg(kind)}/${pageSlug}/${slug}` : `/${kindSeg(kind)}/${slug}`;
/** One drift of a flow: /tour/{page}/{tour}/{drift}. */
export const driftPublicPath = (kind: string, pageSlug: string, flowSlug: string, driftSlug: string) =>
  `/${kindSeg(kind)}/${pageSlug}/${flowSlug}/${driftSlug}`;

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

/** Who made a tour saved to the Drift channel (DriftFlow.settings.credit; services/driftChannel.ts). */
export type TourCredit = { flowId: string; pageId: string; pageName: string; pageSlug: string | null; savedAt: string };

export const creditOf = (settings: unknown): TourCredit | null => {
  const c = settings && typeof settings === "object" ? (settings as Record<string, any>).credit : null;
  return c && typeof c === "object" && typeof c.pageName === "string" && c.pageName ? (c as TourCredit) : null;
};

/** What a saved tour's pathway shows: "Tour by {creator}" → their page. */
export const publicCredit = (settings: unknown): { name: string; path: string | null } | null => {
  const c = creditOf(settings);
  return c ? { name: c.pageName, path: c.pageSlug ? pagePublicPath(c.pageSlug) : null } : null;
};

/** A tour drift's background until its creator picks one: drift.li's own dark ground. */
export const TOUR_DEFAULT_BACKGROUND = "#0d1119";

/** The colour a creator picked for a tour drift, or null for the default. Builds before 2026-09-22
 *  filled the colour auto-detected from the frames in on processing — that counts as not picked. */
export const pickedTourBackground = (background: unknown, detectedBg: unknown): string | null =>
  typeof background === "string" && background && background !== detectedBg ? background : null;

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

const HOME_LABEL = "Home";
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** URL segment of each step's drift, unique within its flow and derived from the
 *  drift's name ("Porch" → porch, a second "Porch" → porch-2, unnamed → drift-3).
 *  Computed over ALL steps in order, so the relink, the serializers and the public
 *  resolver always agree. */
export function stepDriftSlugs(
  steps: Array<{ id: string; product?: { name?: string | null } | null }>,
  noun: string = "Drift",
): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  const nounSlug = slugifyFlow(noun) || "drift";
  steps.forEach((s, i) => {
    const base = slugifyFlow(String(s.product?.name || "")) || `${nounSlug}-${i + 1}`;
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    out.set(s.id, slug);
  });
  return out;
}

/**
 * Single source of truth for a flow's buttons. Every drift gets exactly two:
 * **Home** (left) back to the flow's pathway menu, and the **next drift's name**
 * (right). The last drift points at drift #1 — a tour loops, it never ends — and a
 * one-drift flow shows Home only. Derived from step order + names, so reordering or
 * renaming can never break the path. Also normalizes `order` to 0..n-1 (gaps appear
 * after a cascade delete). Run it inside the same transaction as any step create /
 * reorder / delete / rename, and after a flow's slug changes.
 */
export async function relinkFlow(db: Db, flowId: string): Promise<void> {
  const flow = await db.driftFlow.findUnique({
    where: { id: flowId },
    select: {
      id: true,
      kind: true,
      slug: true,
      organization: { select: { slug: true } },
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          stepType: true,
          productId: true,
          product: { select: { name: true, status: true, ctaPrimary: true, ctaSecondary: true, ctaPlacement: true } },
        },
      },
    },
  });
  if (!flow) return;
  const kind = parseFlowKind(flow.kind) ?? "TOUR";

  for (let i = 0; i < flow.steps.length; i++) {
    if (flow.steps[i].order !== i) {
      await db.driftFlowStep.update({ where: { id: flow.steps[i].id }, data: { order: i } });
    }
  }

  const pageSlug = flow.organization?.slug || null;
  const slugs = stepDriftSlugs(flow.steps, stepNoun(kind));
  const home: CreatorCta = { label: HOME_LABEL, url: flowPublicPath(kind, pageSlug, flow.slug) };
  // Only viewable drifts are linked: one still building, failed or waiting for checkout
  // is skipped (its neighbours point past it) and joins once it's READY.
  const drifts = flow.steps.filter((s) => s.stepType === "DRIFT" && s.productId && isReady(s.product?.status));
  for (let i = 0; i < drifts.length; i++) {
    const nextIndex = (i + 1) % drifts.length;
    const next = drifts.length > 1 ? drifts[nextIndex] : null;
    const nextSlug = next ? slugs.get(next.id) : undefined;
    const nextCta: CreatorCta | null = next
      ? {
          label: String(next.product?.name || `${stepNoun(kind)} ${nextIndex + 1}`).slice(0, 80),
          url:
            pageSlug && nextSlug
              ? driftPublicPath(kind, pageSlug, flow.slug, nextSlug)
              : stepPlayerPath(next.productId as string),
        }
      : null;
    const current = drifts[i].product;
    if (
      current &&
      sameJson(current.ctaPrimary, home) &&
      sameJson(current.ctaSecondary, nextCta) &&
      current.ctaPlacement === "CENTER"
    ) {
      continue; // already right — no write, no updatedAt churn
    }
    await db.driftProduct.update({
      where: { id: drifts[i].productId as string },
      data: {
        ctaPrimary: home as any,
        ctaSecondary: nextCta ? (nextCta as any) : Prisma.DbNull,
        ctaPlacement: "CENTER",
      },
    });
  }
}

/** Re-derive every flow's buttons (writes only where something changed). Run at boot
 *  so drifts built under older link rules pick up the current ones. */
export async function relinkAllFlows(): Promise<void> {
  const flows = await prisma.driftFlow.findMany({ select: { id: true } });
  let ok = 0;
  for (const f of flows) {
    try {
      await relinkFlow(prisma, f.id);
      ok++;
    } catch (err) {
      console.error(`[${NS}] relink ${f.id} failed:`, err);
    }
  }
  if (flows.length) console.log(`[${NS}] boot relink checked ${ok}/${flows.length} flows`);
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
  loopEnabled: true,
  driftDirection: true,
  ctaPlacement: true,
  thumbnailUrl: true,
  ctaPrimary: true,
  ctaSecondary: true,
  updatedAt: true,
  billingStatus: true,
  paidAt: true,
  hostingExpiresAt: true,
  spin: { select: { frameCount: true, manifest: true } },
  _count: { select: { pins: true } },
};

export const flowInclude = {
  organization: { select: { slug: true, name: true } },
  steps: {
    orderBy: { order: "asc" as const },
    include: { product: { select: stepProductSelect } },
  },
};

/** What the auto clean-up did to a tour clip (services/driftCleanup.ts), or null when nothing. */
const cleanupSummary = (c: any) => {
  if (!c || typeof c !== "object" || c.v !== 1) return null;
  const out = {
    trimmedS: Math.round(((Number(c.trimmedStartS) || 0) + (Number(c.trimmedEndS) || 0)) * 10) / 10,
    steadied: !!c.steadied,
    direction: typeof c.direction === "string" ? (c.direction as string) : null,
  };
  return out.trimmedS > 0 || out.steadied || out.direction ? out : null;
};

export function serializeStepProduct(p: any) {
  if (!p) return null;
  const m = p.spin?.manifest || {};
  const frames: string[] = Array.isArray(m.frames) ? m.frames : [];
  // Thumbnails (cards, strips, builder) use the lighter mobile frame when there is one.
  const small: string[] =
    Array.isArray(m.framesMobile) && m.framesMobile.length === frames.length ? m.framesMobile : frames;
  return {
    id: p.id as string,
    name: p.name as string,
    slug: p.slug as string,
    title: (p.title ?? null) as string | null,
    titleEnd: (p.titleEnd ?? null) as string | null,
    description: (p.description ?? null) as string | null,
    descriptionEnd: (p.descriptionEnd ?? null) as string | null,
    // the creator's pick (null = drift.li's dark ground)
    background: pickedTourBackground(p.background, m.detectedBg),
    status: p.status as string,
    defaultFrame: (p.defaultFrame ?? 0) as number,
    loopEnabled: !!p.loopEnabled,
    driftDirection: (p.driftDirection || "LTR") as string,
    ctaPlacement: (p.ctaPlacement || "CENTER") as string,
    frameCount: (p.spin?.frameCount ?? frames.length) as number,
    thumb: (p.thumbnailUrl || small[p.defaultFrame] || small[0] || null) as string | null,
    ctaPrimary: (p.ctaPrimary ?? null) as CreatorCta | null,
    ctaSecondary: (p.ctaSecondary ?? null) as CreatorCta | null,
    playerPath: stepPlayerPath(p.id),
    billingStatus: (p.billingStatus || "FREE") as string,
    paidAt: (p.paidAt ?? null) as Date | null,
    hostingExpiresAt: (p.hostingExpiresAt ?? null) as Date | null,
    pinCount: (p._count?.pins ?? 0) as number,
    cleanup: cleanupSummary(m.cleanup),
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
  const kind = parseFlowKind(f.kind) ?? "TOUR";
  const pageSlug: string | null = f.organization?.slug ?? null;
  const rawSteps: any[] = f.steps || [];
  const slugs = stepDriftSlugs(rawSteps, stepNoun(kind));
  const steps = rawSteps.map((s: any) => {
    const out = serializeStep(s);
    const slug = slugs.get(s.id) ?? null;
    if (out.product && pageSlug && slug) out.product.playerPath = driftPublicPath(kind, pageSlug, f.slug, slug);
    return { ...out, slug };
  });
  const products = steps.map((s: any) => s.product).filter(Boolean);
  const counts = {
    steps: steps.length,
    ready: products.filter((p: any) => isReady(p.status)).length,
    processing: products.filter((p: any) => p.status === "PROCESSING").length,
    failed: products.filter((p: any) => p.status === "FAILED").length,
    awaiting: products.filter((p: any) => p.status === "AWAITING_PAYMENT").length,
  };
  const entry = products[0] || null;
  // Cover choices: the first drift's start, middle and end frames.
  const firstFrames: string[] = Array.isArray(rawSteps[0]?.product?.spin?.manifest?.frames)
    ? rawSteps[0].product.spin.manifest.frames
    : [];
  const coverFrames = firstFrames.length
    ? [firstFrames[0], firstFrames[Math.floor((firstFrames.length - 1) / 2)], firstFrames[firstFrames.length - 1]]
    : [];
  return {
    id: f.id as string,
    kind: f.kind as string,
    slug: f.slug as string,
    name: f.name as string,
    title: (f.title ?? null) as string | null,
    description: (f.description ?? null) as string | null,
    status: f.status as string,
    isDemo: !!f.isDemo,
    hidden: !!f.hidden,
    coverUrl: (f.coverUrl ?? null) as string | null,
    endCta: (f.endCta ?? null) as CreatorCta | null,
    settings: { nextLabel: (settingsOf(f).nextLabel ?? null) as string | null },
    order: (f.order ?? 0) as number,
    publishedAt: (f.publishedAt ?? null) as Date | null,
    createdAt: f.createdAt as Date,
    updatedAt: f.updatedAt as Date,
    pageSlug,
    pageName: (f.organization?.name ?? null) as string | null,
    pagePath: pageSlug ? pagePublicPath(pageSlug, kind) : null,
    publicPath: flowPublicPath(kind, pageSlug, f.slug),
    /** the unbranded (MLS-safe) link, once made: /u/{code} */
    unbrandedPath: typeof settingsOf(f).unbrandedCode === "string" ? `/u/${settingsOf(f).unbrandedCode as string}` : null,
    /** the owner report link while it's on: /report/{code} */
    reportPath: typeof settingsOf(f).reportCode === "string" ? `/report/${settingsOf(f).reportCode as string}` : null,
    entryProductId: (entry?.id ?? null) as string | null,
    entryPath: entry ? (entry.playerPath as string) : null,
    thumb: (f.coverUrl || entry?.thumb || null) as string | null,
    coverFrames,
    counts,
    steps,
  };
}

/** The public shape (a pathway menu): only steps whose drift is viewable. */
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
    settings: full.settings,
    hidden: full.hidden,
    // saved to the Drift channel: who made it
    credit: publicCredit(f.settings),
    pageSlug: full.pageSlug,
    pageName: full.pageName,
    pagePath: full.pagePath,
    publicPath: full.publicPath,
    entryProductId: entry?.id ?? null,
    entryPath: entry ? entry.playerPath : null,
    thumb: full.coverUrl || entry?.thumb || null,
    steps: steps.map((s: any) => ({
      id: s.id,
      order: s.order,
      slug: s.slug,
      productId: s.product.id,
      name: s.product.name,
      title: s.product.title,
      thumb: s.product.thumb,
      playerPath: s.product.playerPath,
    })),
  };
}

// ───────────────────────────── writes ─────────────────────────────

/** Create a DRIFT step + its drift, append it, relink — one transaction under the org
 *  lock. Billing is decided here too, so two uploads can't both take the last free
 *  drift: COMP for a superadmin; FREE while the page has free drifts left; otherwise
 *  AWAITING_PAYMENT (the caller stores the clip — nothing converts before checkout).
 *  The caller queues processing for FREE/COMP AFTER this resolves. */
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
  /** drag wraps end → start (off for tours: the path continues via the buttons) */
  loopEnabled: boolean;
  /** LTR | RTL | TTB | BTT — which way the clip pans */
  driftDirection: string;
  /** where the buttons sit (tours: CENTER) */
  ctaPlacement: string;
  /** step limit (null = unlimited, e.g. superadmin) — enforced INSIDE the transaction */
  maxSteps: number | null;
  kind: FlowKind;
  /** AUTO = free allowance, then paid; COMP = superadmin */
  billing: "AUTO" | "COMP";
}) {
  return prisma.$transaction(async (tx) => {
    await lockOrg(tx, args.orgId);
    if (args.maxSteps !== null) {
      const used = await tx.driftFlowStep.count({ where: { flowId: args.flowId } });
      if (used >= args.maxSteps) throw stepLimitError(args.kind, args.maxSteps, used);
    }
    let billingStatus: "FREE" | "COMP" | "AWAITING_PAYMENT" = "COMP";
    if (args.billing === "AUTO") {
      const org = await tx.organization.findUnique({ where: { id: args.orgId }, select: { freeDrifts: true } });
      const usedFree = await tx.driftProduct.count({
        where: { organizationId: args.orgId, billingStatus: "FREE", flowStep: { isNot: null } },
      });
      billingStatus = usedFree < (org?.freeDrifts ?? 3) ? "FREE" : "AWAITING_PAYMENT";
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
        status: billingStatus === "AWAITING_PAYMENT" ? "AWAITING_PAYMENT" : "PROCESSING",
        billingStatus,
        loopEnabled: args.loopEnabled,
        driftDirection: args.driftDirection,
        ctaPlacement: args.ctaPlacement,
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
      `[${NS}] flow ${args.flowId} step ${step.id} created (product ${product.id}, order ${step.order}, ${billingStatus})`,
    );
    return { product, step, billingStatus };
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
      const awaiting = flow.steps.filter((s) => s.product?.status === "AWAITING_PAYMENT");
      if (awaiting.length) {
        throw new FlowError(409, "Check out the new drifts (or remove them) before publishing", {
          code: "CHECKOUT_REQUIRED",
          pending: awaiting.length,
        });
      }
      const pending = flow.steps.filter((s) => s.product && !isReady(s.product.status));
      if (pending.length) {
        throw new FlowError(409, "Every drift must finish building before you publish", {
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
