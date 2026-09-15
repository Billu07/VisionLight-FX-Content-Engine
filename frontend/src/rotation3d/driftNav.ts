import { apiEndpoints } from "../lib/api";

/**
 * Shared drift-to-drift navigation cache + prefetch. Used by both the standalone
 * player (Rotation3DPlayer) and the drift.li landing takeover (DriftLanding's
 * HeroLanding) so a CTA that points to another drift on this host is fetched (and
 * a spread of its frames warmed) ahead of the click — the next drift then swaps in
 * INSTANTLY, with no loader, and (because we navigate in-app) fullscreen survives.
 *
 * Warming waits until the drift on screen has loaded ALL of its own frames (the player
 * holds a foreground lease while it loads), then fetches the next drift's whole frame
 * set — the set THIS device will play (the lighter mobile set on phones) — so the swap
 * is instant and smooth. On data-saver / 2G links it only warms what a first paint needs.
 */

// Session caches: drift product payloads by key, and frame URLs we've warmed.
const driftCache = new Map<string, any>();
const warmedFrames = new Set<string>();
const inflight = new Set<string>();

// First-path-segments that are app routes, never a brand vanity — a CTA to one of
// these is not an internal drift to prefetch / SPA-navigate.
const RESERVED_SEG = new Set([
  "p", "embed", "app", "admin", "projects", "studios", "pricing", "terms",
  "privacy", "demo", "rotation3d", "billing", "auth", "support-handoff",
  "reset-password", "api",
  "tour", "view", "memory", "path", // creator suite (/{kind}/{slug})
]);

export type DriftTarget =
  | { productId: string; path: string }
  | { bySlug: true; brandSlug: string; productSlug: string; path: string }
  | { byFlow: true; kind: string; page: string; flow: string; drift: string; path: string };

// Creator-suite kinds: /{kind}/{page}/{flow}/{drift} is one drift of a flow.
const FLOW_KINDS = new Set(["tour", "view", "memory", "path"]);

// Parse a CTA url into an internal drift target (same-origin only), or null when
// it's external / not a drift — then the browser navigates it normally.
export function resolveDriftTarget(raw: string | undefined | null): DriftTarget | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const segs = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    const path = u.pathname + u.search;
    if ((segs[0] === "p" || segs[0] === "embed") && segs[1]) return { productId: segs[1], path };
    if (FLOW_KINDS.has(segs[0]) && segs.length === 4) {
      return { byFlow: true, kind: segs[0], page: segs[1], flow: segs[2], drift: segs[3], path };
    }
    if (segs.length === 2 && !RESERVED_SEG.has(segs[0])) {
      return { bySlug: true, brandSlug: segs[0], productSlug: segs[1], path };
    }
    return null;
  } catch {
    return null;
  }
}

/** Cache key of a flow drift's readable link (the player uses the same key). */
export const flowDriftKey = (kind: string, page: string, flow: string, drift: string) =>
  `${kind}:${page}/${flow}/${drift}`;

export const targetKey = (t: DriftTarget) =>
  "byFlow" in t
    ? flowDriftKey(t.kind, t.page, t.flow, t.drift)
    : "bySlug" in t
      ? `${t.brandSlug}/${t.productSlug}`
      : t.productId;

export const driftKey = (bySlug: boolean, brandSlug?: string, productSlug?: string, productId?: string) =>
  bySlug ? `${brandSlug}/${productSlug}` : productId || "";

export const getCachedDrift = (key: string) => driftCache.get(key);
export const cacheDrift = (key: string, product: any) => {
  if (key && product) driftCache.set(key, product);
};

// ───────────────────────────── frame sets ─────────────────────────────

/** Phones and touch tablets play the lighter mobile frame set — the same rule
 *  SpinViewer applies when it picks `manifest.framesMobile`. */
export const prefersMobileFrames = () =>
  typeof window !== "undefined" &&
  (Math.min(window.innerWidth, window.innerHeight) <= 820 ||
    !!window.matchMedia?.("(pointer: coarse)").matches);

/** The frame lists the player shows for a payload: clip A, plus clip B when
 *  `withSecond` (a 2-clip drift is one circular timeline). The mobile list is only
 *  offered when every clip has one of the same length, so frame indexes line up. */
export function combinedFrameSets(product: any, withSecond = true): { frames: string[]; framesMobile?: string[] } {
  const m = product?.manifest || {};
  const s = withSecond ? product?.secondManifest : null;
  const a: string[] = Array.isArray(m.frames) ? m.frames : [];
  const b: string[] = s && Array.isArray(s.frames) ? s.frames : [];
  const am: string[] = Array.isArray(m.framesMobile) ? m.framesMobile : [];
  const bm: string[] = s && Array.isArray(s.framesMobile) ? s.framesMobile : [];
  const mobileOk = a.length > 0 && am.length === a.length && (b.length === 0 || bm.length === b.length);
  return {
    frames: b.length ? [...a, ...b] : a,
    framesMobile: mobileOk ? (b.length ? [...am, ...bm] : am) : undefined,
  };
}

/** Exactly the URLs this device's player will load for a payload. */
const deviceFrames = (product: any): string[] => {
  const { frames, framesMobile } = combinedFrameSets(product);
  return framesMobile && prefersMobileFrames() ? framesMobile : frames;
};

// ───────────────────────────── background warm queue ─────────────────────────────

const WARM_CONCURRENCY = 6;
const WARM_DELAY_MS = 250;
// Players still loading their own frames (see holdForegroundLoad).
let foregroundLeases = 0;
const warmQueue: string[] = [];
let warmActive = 0;
let warmTimer: number | null = null;

/** Data saver or a 2G link: warm only what an instant first paint needs. */
const constrainedNetwork = () => {
  const c = typeof navigator !== "undefined" ? (navigator as any).connection : undefined;
  return !!c && (!!c.saveData || /(^|-)2g$/.test(String(c.effectiveType || "")));
};

const pumpWarm = () => {
  if (foregroundLeases > 0) return; // the drift on screen comes first
  while (warmActive < WARM_CONCURRENCY && warmQueue.length) {
    const url = warmQueue.shift()!;
    warmActive++;
    const img = new Image();
    img.decoding = "async";
    img.onload = img.onerror = () => {
      warmActive--;
      pumpWarm();
    };
    img.src = url;
  }
};

const scheduleWarm = () => {
  if (warmTimer !== null || typeof window === "undefined") return;
  warmTimer = window.setTimeout(() => {
    warmTimer = null;
    const ric = (window as any).requestIdleCallback;
    if (typeof ric === "function") ric(pumpWarm, { timeout: 2000 });
    else pumpWarm();
  }, WARM_DELAY_MS);
};

/** A player calls this when it starts loading a drift's frames and calls the returned
 *  release when they're all in (or it unmounts): warming waits for every lease. */
export function holdForegroundLoad(): () => void {
  foregroundLeases++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    foregroundLeases = Math.max(0, foregroundLeases - 1);
    if (foregroundLeases === 0 && warmQueue.length) scheduleWarm();
  };
}

const enqueueWarm = (url?: string) => {
  if (!url || warmedFrames.has(url)) return;
  warmedFrames.add(url);
  warmQueue.push(url);
};

/** Drop warms that haven't started (the visitor moved on) so they can re-queue later. */
const clearPendingWarms = () => {
  for (const url of warmQueue) warmedFrames.delete(url);
  warmQueue.length = 0;
};

// Preload a drift's frames ahead of time so it swaps in fully-formed — the default
// frame first (painted immediately), then a coarse spread (a usable drift right away),
// then (full, on a decent connection) every remaining frame. `warmedFrames` dedupes,
// so re-calling is cheap.
export function warmFrames(product: any, opts: { full?: boolean } = {}) {
  const all = deviceFrames(product);
  if (!all.length) return;
  const first = Math.min(Math.max(0, Number(product?.defaultFrame) || 0), all.length - 1);
  enqueueWarm(all[first]);
  const step = Math.max(1, Math.floor(all.length / 16));
  for (let i = 0; i < all.length; i += step) enqueueWarm(all[i]);
  if (opts.full !== false && !constrainedNetwork()) for (const url of all) enqueueWarm(url);
  scheduleWarm();
}

const fetchTarget = (t: DriftTarget) =>
  ("byFlow" in t
    ? apiEndpoints.driftPublicPageDrift(t.page, t.flow, t.drift)
    : "bySlug" in t
      ? apiEndpoints.driftPublicBrandProduct(t.brandSlug, t.productSlug)
      : apiEndpoints.driftPublicProduct(t.productId)
  ).then((r) => r.data.product);

const prefetchTarget = (t: DriftTarget, opts: { full?: boolean }) => {
  const k = targetKey(t);
  const cached = driftCache.get(k);
  if (cached) {
    warmFrames(cached, opts);
    return;
  }
  if (inflight.has(k)) return;
  inflight.add(k);
  fetchTarget(t)
    .then((d) => {
      if (d) {
        driftCache.set(k, d);
        warmFrames(d, opts);
      }
    })
    .catch(() => undefined)
    .finally(() => inflight.delete(k));
};

// Prefetch every drift a CTA on `product` points at (same host), so its click is an
// instant swap. Called when a drift comes on screen: warms queued for the drift the
// visitor just left are dropped first. Safe to call repeatedly.
export function prefetchDriftTargets(product: any) {
  clearPendingWarms();
  for (const cta of [product?.ctaPrimary, product?.ctaSecondary]) {
    const url = cta && typeof cta === "object" ? cta.url : undefined;
    const t = resolveDriftTarget(url);
    if (t) prefetchTarget(t, { full: true });
  }
}

/** Prefetch a drift link from a page (a pathway's Start Tour, a strip on touch/hover):
 *  its payload plus the first frame and a coarse spread — the rest warms once it plays. */
export function prefetchDriftPath(path: string | null | undefined, opts: { full?: boolean } = { full: false }) {
  const t = resolveDriftTarget(path);
  if (t) prefetchTarget(t, opts);
}
