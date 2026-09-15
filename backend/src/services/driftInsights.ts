import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./database";
import { FlowError, flowInclude, serializeFlow } from "./driftFlows";
import { rateLimiter } from "./driftVisitors";

/**
 * Tour Insights (TOUR_V2_PLAN.md, phase 4): what visitors do inside a tour.
 * - The player records attention per drift view (frontend rotation3d/attention.ts): time on
 *   the drift, time on each of 20 equal parts of the footage once the visitor starts
 *   dragging, which parts they reached, how often they dragged back, pin taps. One small
 *   record when the drift is left or the page is hidden → a DriftEvent of type "DWELL" (no
 *   schema change). Records of one view share its key and are merged here; a visit is a
 *   random id per browser tab (no cookies, no personal data).
 * - tourInsights: a tour's records rolled up — visits, time, how far people get, where they
 *   end their visit, and per drift a heat strip and pin taps.
 * - The owner report: a read-only, no-login link (/report/{code}; the code sits in
 *   DriftFlow.settings.reportCode) for the owner or client. Counts only — no names, no
 *   enquiry contents, no personal links.
 */

const NS = "drift-insights";
export const ATTENTION_PARTS = 20;
export const INSIGHT_RANGES = [7, 30, 90] as const;
const DAY_MS = 86400000;
/** one record covers at most this much time (the player sends on leave / hide) */
const MAX_PART_MS = 15 * 60 * 1000;
const MIN_VIEW_MS = 300;
const MAX_EVENTS = 60000;
const MAX_PINS_PER_RECORD = 24;

const ID = /^[0-9a-f-]{36}$/i;
const KEY = /^[a-z0-9]{8,32}$/;
const LINK_TOKEN = /^[a-z0-9]{6,40}$/;
const CODE = /^[a-z0-9]{6,20}$/;
const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

/** A visitor's attention records: a long tour sends a couple per drift. */
const allowAttention = rateLimiter(10 * 60 * 1000, 300);

export type AttentionRecord = {
  productId: string;
  /** the view's key (same drift shown once) */
  k: string;
  /** the visit (browser tab) */
  v: string;
  ms: number;
  /** ms on each of the 20 parts of the footage */
  b: number[];
  /** bitmask of the parts reached */
  s: number;
  /** drag reversals */
  r: number;
  /** pin taps by pin id */
  p?: Record<string, number>;
  /** the personal link token the visit came through */
  l?: string;
  /** a visit on the unbranded link */
  u?: true;
};

const int = (v: unknown, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

/** Validates a player record (a JSON string from a beacon, or a parsed body). null → drop it. */
export function parseAttention(raw: unknown): AttentionRecord | null {
  let body: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 8000) return null;
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const productId = String(o.productId || "");
  const k = String(o.k || "");
  const v = String(o.v || "");
  if (!ID.test(productId) || !KEY.test(k) || !KEY.test(v)) return null;
  const ms = int(o.ms, 0, MAX_PART_MS);
  if (ms < MIN_VIEW_MS) return null;
  if (!Array.isArray(o.b) || o.b.length !== ATTENTION_PARTS) return null;
  const rec: AttentionRecord = {
    productId,
    k,
    v,
    ms,
    b: o.b.map((x) => int(x, 0, ms)),
    s: int(o.s, 0, (1 << ATTENTION_PARTS) - 1),
    r: int(o.r, 0, 1000),
  };
  if (o.p && typeof o.p === "object" && !Array.isArray(o.p)) {
    const pins: Record<string, number> = {};
    for (const [id, n] of Object.entries(o.p as Record<string, unknown>).slice(0, MAX_PINS_PER_RECORD)) {
      const taps = int(n, 0, 100);
      if (ID.test(id) && taps) pins[id] = taps;
    }
    if (Object.keys(pins).length) rec.p = pins;
  }
  const link = String(o.l || "").toLowerCase();
  if (link && LINK_TOKEN.test(link)) rec.l = link;
  if (o.u === true || o.u === 1) rec.u = true;
  return rec;
}

/** Stores a player record (public). Only drifts inside a tour are recorded; anything
 *  malformed, too short or over the visitor's limit is dropped silently. */
export async function recordAttention(raw: unknown, ip: string) {
  const rec = parseAttention(raw);
  if (!rec || !allowAttention(ip)) return;
  const step = await prisma.driftFlowStep.findUnique({
    where: { productId: rec.productId },
    select: { flowId: true, flow: { select: { organizationId: true } } },
  });
  if (!step) return;
  const { productId, ...meta } = rec;
  await prisma.driftEvent.create({
    data: {
      organizationId: step.flow.organizationId,
      productId,
      type: "DWELL",
      meta: { ...meta, flow: step.flowId } as Prisma.InputJsonValue,
    },
  });
}

// ───────────────────────────── roll-up ─────────────────────────────

export type InsightStep = {
  stepId: string;
  productId: string;
  name: string;
  thumb: string | null;
  /** the drift's (mobile) frames, for the filmstrip */
  frames: string[];
  pins: { id: string; title: string }[];
};

type RawEvent = { productId: string; ts: Date; meta: unknown };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const popcount = (n: number) => {
  let c = 0;
  for (let x = n >>> 0; x; x &= x - 1) c++;
  return c;
};

/** Rolls a tour's attention records up (pure — tested without a database). */
export function rollUpInsights(input: {
  steps: InsightStep[];
  events: RawEvent[];
  days: number;
  /** the first day of the period (UTC midnight) */
  since: Date;
  enquiries: number;
  countingSince: Date | null;
}) {
  const { steps, events, days, since } = input;
  const indexOf = new Map(steps.map((s, i) => [s.productId, i]));

  // 1. One view per key: a drift shown once, possibly sent in parts (the page was hidden).
  type View = { i: number; v: string; ms: number; bins: number[]; seen: number; rev: number; pins: Map<string, number>; first: number; last: number; link: boolean; unbranded: boolean };
  const views = new Map<string, View>();
  for (const e of events) {
    const i = indexOf.get(e.productId);
    const m = e.meta && typeof e.meta === "object" ? (e.meta as Record<string, any>) : null;
    if (i === undefined || !m || typeof m.k !== "string" || typeof m.v !== "string" || !Array.isArray(m.b)) continue;
    const t = e.ts.getTime();
    const key = `${m.k}|${e.productId}`;
    let view = views.get(key);
    if (!view) {
      view = { i, v: m.v, ms: 0, bins: new Array(ATTENTION_PARTS).fill(0), seen: 0, rev: 0, pins: new Map(), first: t, last: t, link: false, unbranded: false };
      views.set(key, view);
    }
    view.ms += Number(m.ms) || 0;
    for (let j = 0; j < ATTENTION_PARTS; j++) view.bins[j] += Number(m.b[j]) || 0;
    view.seen |= Number(m.s) || 0;
    view.rev += Number(m.r) || 0;
    if (m.p && typeof m.p === "object") {
      for (const [id, n] of Object.entries(m.p as Record<string, unknown>)) view.pins.set(id, (view.pins.get(id) || 0) + (Number(n) || 0));
    }
    view.first = Math.min(view.first, t);
    view.last = Math.max(view.last, t);
    if (typeof m.l === "string") view.link = true;
    if (m.u) view.unbranded = true;
  }

  // 2. Visits: which drifts each saw, its time, and the drift it ended on.
  type Visit = { drifts: Set<number>; ms: number; first: number; lastT: number; lastI: number; link: boolean; unbranded: boolean };
  const visits = new Map<string, Visit>();
  for (const view of views.values()) {
    let visit = visits.get(view.v);
    if (!visit) {
      visit = { drifts: new Set(), ms: 0, first: view.first, lastT: -1, lastI: view.i, link: false, unbranded: false };
      visits.set(view.v, visit);
    }
    visit.drifts.add(view.i);
    visit.ms += view.ms;
    visit.first = Math.min(visit.first, view.first);
    if (view.last > visit.lastT) {
      visit.lastT = view.last;
      visit.lastI = view.i;
    }
    visit.link = visit.link || view.link;
    visit.unbranded = visit.unbranded || view.unbranded;
  }

  // 3. Per drift.
  const per = steps.map(() => ({
    views: 0,
    visitors: new Set<string>(),
    ms: 0,
    bins: new Array<number>(ATTENTION_PARTS).fill(0),
    explored: 0,
    lookedBack: 0,
    exits: 0,
    pins: new Map<string, number>(),
  }));
  for (const view of views.values()) {
    const d = per[view.i];
    d.views++;
    d.visitors.add(view.v);
    d.ms += view.ms;
    for (let j = 0; j < ATTENTION_PARTS; j++) d.bins[j] += view.bins[j];
    d.explored += popcount(view.seen) / ATTENTION_PARTS;
    if (view.rev > 0) d.lookedBack++;
    for (const [id, n] of view.pins) d.pins.set(id, (d.pins.get(id) || 0) + n);
  }
  for (const visit of visits.values()) per[visit.lastI].exits++;

  const visitCount = visits.size;
  const drifts = steps.map((s, i) => {
    const d = per[i];
    const max = Math.max(0, ...d.bins);
    const titleOf = new Map(s.pins.map((p) => [p.id, p.title]));
    const pick = (n: number) => s.frames[Math.min(s.frames.length - 1, Math.floor(((n + 0.5) / 10) * s.frames.length))];
    return {
      stepId: s.stepId,
      productId: s.productId,
      name: s.name,
      thumb: s.thumb,
      strip: s.frames.length ? Array.from({ length: 10 }, (_, n) => pick(n)) : [],
      views: d.views,
      visitors: d.visitors.size,
      reachedPct: pct(d.visitors.size, visitCount),
      avgMs: d.views ? Math.round(d.ms / d.views) : 0,
      explored: d.views ? Math.round((d.explored / d.views) * 100) : 0,
      lookedBackPct: pct(d.lookedBack, d.views),
      exits: d.exits,
      exitPct: pct(d.exits, d.visitors.size),
      heat: d.bins.map((x) => (max > 0 ? Math.round((x / max) * 100) / 100 : 0)),
      topPart: max > 0 ? d.bins.indexOf(max) : null,
      pins: [...d.pins]
        .filter(([id, taps]) => titleOf.has(id) && taps > 0)
        .map(([id, taps]) => ({ title: titleOf.get(id) as string, taps }))
        .sort((a, b) => b.taps - a.taps)
        .slice(0, 6),
    };
  });

  let totalMs = 0;
  let sawAll = 0;
  let driftsSeen = 0;
  let personal = 0;
  let unbranded = 0;
  for (const visit of visits.values()) {
    totalMs += visit.ms;
    driftsSeen += visit.drifts.size;
    if (steps.length && visit.drifts.size >= steps.length) sawAll++;
    if (visit.unbranded) unbranded++;
    else if (visit.link) personal++;
  }

  // Visits per day (by the day a visit started, UTC), oldest first.
  const series = Array.from({ length: days }, (_, j) => ({
    date: new Date(since.getTime() + j * DAY_MS).toISOString().slice(0, 10),
    visits: 0,
  }));
  const dayIndex = new Map(series.map((d, j) => [d.date, j]));
  for (const visit of visits.values()) {
    const j = dayIndex.get(new Date(visit.first).toISOString().slice(0, 10));
    if (j !== undefined) series[j].visits++;
  }

  return {
    days,
    from: series[0]?.date ?? since.toISOString().slice(0, 10),
    to: series[series.length - 1]?.date ?? since.toISOString().slice(0, 10),
    countingSince: input.countingSince ? input.countingSince.toISOString() : null,
    visits: visitCount,
    totalMs,
    avgVisitMs: visitCount ? Math.round(totalMs / visitCount) : 0,
    sawAllPct: pct(sawAll, visitCount),
    avgDriftsSeen: visitCount ? Math.round((driftsSeen / visitCount) * 10) / 10 : 0,
    driftCount: steps.length,
    enquiries: input.enquiries,
    /** team only (the owner report leaves it out) */
    sources: { direct: visitCount - personal - unbranded, personal, unbranded } as { direct: number; personal: number; unbranded: number } | null,
    series,
    drifts,
  };
}

export type TourInsights = ReturnType<typeof rollUpInsights>;

const rangeOf = (days: unknown) => {
  const n = Number(days);
  return (INSIGHT_RANGES as readonly number[]).includes(n) ? n : 30;
};

const viewable = (status: string) => status === "READY" || status === "PUBLISHED";

/** Loads a tour's records for the period and rolls them up. `flow` = a DriftFlow with flowInclude. */
async function insightsFor(flow: any, days: number): Promise<TourInsights> {
  const serialized = serializeFlow(flow);
  const rawSteps = new Map<string, any>((flow.steps || []).map((s: any) => [s.id as string, s]));
  const live = serialized.steps.filter((s) => s.product && viewable(s.product.status));
  const ids = live.map((s) => s.product!.id);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
  const where = { organizationId: flow.organizationId as string, productId: { in: ids }, type: "DWELL" };
  const [events, enquiries, first, pins] = await Promise.all([
    ids.length
      ? prisma.driftEvent.findMany({
          where: { ...where, ts: { gte: since } },
          select: { productId: true, ts: true, meta: true },
          orderBy: { ts: "desc" },
          take: MAX_EVENTS,
        })
      : Promise.resolve([]),
    prisma.driftLead.count({
      where: { organizationId: flow.organizationId, formId: null, createdAt: { gte: since }, source: { path: ["flowId"], equals: flow.id } },
    }),
    ids.length ? prisma.driftEvent.findFirst({ where, orderBy: { ts: "asc" }, select: { ts: true } }) : Promise.resolve(null),
    ids.length
      ? prisma.driftPin.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true, title: true } })
      : Promise.resolve([]),
  ]);
  const steps: InsightStep[] = live.map((s) => {
    const m = rawSteps.get(s.id)?.product?.spin?.manifest || {};
    const frames: string[] = Array.isArray(m.frames) ? m.frames : [];
    const small: string[] = Array.isArray(m.framesMobile) && m.framesMobile.length === frames.length ? m.framesMobile : frames;
    const productId = s.product!.id;
    return {
      stepId: s.id,
      productId,
      name: s.product!.name,
      thumb: s.product!.thumb,
      frames: small,
      pins: pins.filter((p) => p.productId === productId).map((p) => ({ id: p.id, title: p.title })),
    };
  });
  return rollUpInsights({ steps, events, days, since, enquiries, countingSince: first?.ts ?? null });
}

/** The tour's Insights for its page team (?days=7|30|90). */
export async function tourInsights(orgId: string, flowId: string, days: unknown) {
  const flow = await prisma.driftFlow.findFirst({ where: { id: flowId, organizationId: orgId }, include: flowInclude });
  if (!flow) throw new FlowError(404, "Flow not found");
  return insightsFor(flow, rangeOf(days));
}

// ───────────────────────────── owner report ─────────────────────────────

const settingsObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};

const reportCodeOf = (settings: unknown) => {
  const c = settingsObj(settings).reportCode;
  return typeof c === "string" && CODE.test(c) ? c : null;
};

/** /report/{code} while the tour's owner report link is on. */
export const reportPathOf = (settings: unknown) => {
  const c = reportCodeOf(settings);
  return c ? `/report/${c}` : null;
};

/** The tour's owner report link: made on first use, then kept until it's turned off. */
export async function ensureReportLink(orgId: string, flowId: string) {
  const flow = await prisma.driftFlow.findFirst({ where: { id: flowId, organizationId: orgId }, select: { id: true, settings: true } });
  if (!flow) throw new FlowError(404, "Flow not found");
  const existing = reportCodeOf(flow.settings);
  if (existing) return { code: existing, path: `/report/${existing}` };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from(crypto.randomBytes(12), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
    const taken = await prisma.driftFlow.findFirst({ where: { settings: { path: ["reportCode"], equals: code } }, select: { id: true } });
    if (taken) continue;
    await prisma.driftFlow.update({
      where: { id: flow.id },
      data: { settings: { ...settingsObj(flow.settings), reportCode: code } as Prisma.InputJsonValue },
    });
    console.log(`[${NS}] flow ${flow.id}: owner report link made`);
    return { code, path: `/report/${code}` };
  }
  throw new FlowError(500, "We couldn't make that link — please try again.");
}

/** Turns the owner report link off (a new one can be made later; the old one stays dead). */
export async function removeReportLink(orgId: string, flowId: string) {
  const flow = await prisma.driftFlow.findFirst({ where: { id: flowId, organizationId: orgId }, select: { id: true, settings: true } });
  if (!flow) throw new FlowError(404, "Flow not found");
  const settings = settingsObj(flow.settings);
  if (!("reportCode" in settings)) return;
  delete settings.reportCode;
  await prisma.driftFlow.update({ where: { id: flow.id }, data: { settings: settings as Prisma.InputJsonValue } });
  console.log(`[${NS}] flow ${flow.id}: owner report link turned off`);
}

/** The owner report (public, read-only): the tour, its page, and counts only. null → no such link. */
export async function ownerReport(rawCode: unknown, days: unknown) {
  const code = String(rawCode || "").trim().toLowerCase();
  if (!CODE.test(code)) return null;
  const flow = await prisma.driftFlow.findFirst({
    where: { settings: { path: ["reportCode"], equals: code } },
    include: { ...flowInclude, organization: { select: { slug: true, name: true, tourSettings: true } } },
  });
  if (!flow) return null;
  const insights = await insightsFor(flow, rangeOf(days));
  const page = settingsObj(flow.organization?.tourSettings);
  return {
    tour: { title: flow.title || flow.name, description: flow.description ?? null, thumb: serializeFlow(flow).thumb },
    page: {
      name: flow.organization?.name ?? "",
      logoUrl: typeof page.logoUrl === "string" && page.logoUrl ? page.logoUrl : null,
    },
    insights: { ...insights, sources: null },
  };
}
