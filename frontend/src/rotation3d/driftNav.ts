import { apiEndpoints } from "../lib/api";

/**
 * Shared drift-to-drift navigation cache + prefetch. Used by both the standalone
 * player (Rotation3DPlayer) and the drift.li landing takeover (DriftLanding's
 * HeroLanding) so a CTA that points to another drift on this host is fetched (and
 * a spread of its frames warmed) ahead of the click — the next drift then swaps in
 * INSTANTLY, with no loader, and (because we navigate in-app) fullscreen survives.
 *
 * How the loading ahead is paced (the way a video player loads the next segment):
 *   1. the drift on screen owns the network while it is still opening (no warming at all),
 *   2. once it is playable it keeps filling in, and the NEXT drift trickles in behind it on
 *      two connections at LOW fetch priority, so the frames the visitor is dragging win,
 *   3. when it is complete, warming runs at full width,
 *   4. a finger on the drift pauses new background requests until it lifts.
 * Depth: the next stop in full, the one after it as a coarse spread — enough to open
 * instantly and sharpen. On data-saver / 2G links only the essentials are warmed.
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
  "u", // unbranded (MLS-safe) tour links: /u/{code}
  "report", // owner reports: /report/{code}
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

/** A phone-sized viewport (kept for callers that size things by device, not bytes). */
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

/** Exactly the URLs the player will load for a payload — the lighter 1080px set whenever the
 *  product has one, on every device (SpinViewer picks the same). A drift is drawn a few hundred
 *  pixels wide to about a laptop's width, so the 2048px set mostly bought bytes and decode time:
 *  a 180-frame drift was tens of megabytes, which is why a tour felt heavy and the next drift
 *  was never warm in time. */
export const playerFrames = (product: any): string[] => {
  const { frames, framesMobile } = combinedFrameSets(product);
  return framesMobile && framesMobile.length ? framesMobile : frames;
};
const deviceFrames = playerFrames;

// Frames known to be in the browser's cache: warmed here, or loaded by a player. A drift
// swaps in without its loader only when its frames are already in (see SpinViewer).
const framesIn = new Set<string>();

/** A player tells us the frames it has decoded, so revisiting the drift is instant. */
export const markFramesIn = (urls: string[]) => {
  for (const u of urls) if (u) framesIn.add(u);
};

/** Are this payload's frames ready to play (all of them, or `need` of them)? */
export const framesReady = (urls: string[], need?: number): boolean => {
  if (!urls.length) return false;
  const want = Math.min(need ?? urls.length, urls.length);
  let have = 0;
  for (const u of urls) if (framesIn.has(u) && ++have >= want) return true;
  return false;
};

// ───────────────────────────── background warm queue ─────────────────────────────

const WARM_CONCURRENCY = 6;
// How many connections the next drift may use while the one on screen is still filling in.
const WARM_TRICKLE = 2;
const WARM_DELAY_MS = 250;
// Players whose drift is not playable yet (see holdForegroundLoad) — nothing warms while
// one of these is open — and players still filling in a playable drift (warming trickles).
let foregroundLeases = 0;
let trickleLeases = 0;
const warmQueue: string[] = [];
let warmActive = 0;
let warmTimer: number | null = null;
let warmPaused = false;
let warmPauseTimer: number | null = null;

/** Data saver or a 2G link: warm only what an instant first paint needs. */
const constrainedNetwork = () => {
  const c = typeof navigator !== "undefined" ? (navigator as any).connection : undefined;
  return !!c && (!!c.saveData || /(^|-)2g$/.test(String(c.effectiveType || "")));
};

/** How much of the network background loading may take right now. */
const warmWidth = () => {
  if (warmPaused) return 0; // a finger is on the drift
  if (foregroundLeases > 0) return 0; // a drift is still opening — it comes first
  if (trickleLeases > 0) return constrainedNetwork() ? 0 : WARM_TRICKLE; // behind the one playing
  return WARM_CONCURRENCY;
};

const pumpWarm = () => {
  const width = warmWidth();
  while (warmActive < width && warmQueue.length) {
    const url = warmQueue.shift()!;
    warmActive++;
    const img = new Image();
    img.decoding = "async";
    // Low priority: the browser serves the frames of the drift on screen first, so loading
    // ahead never costs the visitor a stutter (Chrome/Safari; ignored elsewhere).
    (img as any).fetchPriority = "low";
    img.onload = () => {
      framesIn.add(url);
      warmActive--;
      pumpWarm();
    };
    img.onerror = () => {
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

/** The visitor is dragging a drift: hold new background requests so the frames being
 *  scrubbed get the network and the main thread. Auto-resumes if a pointer-up is missed. */
export const setWarmPaused = (on: boolean) => {
  if (typeof window === "undefined") return;
  if (warmPauseTimer !== null) {
    clearTimeout(warmPauseTimer);
    warmPauseTimer = null;
  }
  warmPaused = on;
  if (on) {
    warmPauseTimer = window.setTimeout(() => {
      warmPauseTimer = null;
      warmPaused = false;
      if (warmQueue.length) scheduleWarm();
    }, 5000);
  } else if (warmQueue.length) scheduleWarm();
};

/** A player takes one of these while it loads a drift's frames:
 *   - `usable()` when the drift can be played (its coarse ring is in) — the next drift may
 *     start trickling in behind it,
 *   - `release()` when every frame is in, or the player unmounts — warming runs full width.
 *  Both are idempotent, and release works whether or not usable was called. */
export function holdForegroundLoad(): { usable: () => void; release: () => void } {
  foregroundLeases++;
  let state: "opening" | "playing" | "done" = "opening";
  const usable = () => {
    if (state !== "opening") return;
    state = "playing";
    foregroundLeases = Math.max(0, foregroundLeases - 1);
    trickleLeases++;
    if (warmQueue.length) scheduleWarm();
  };
  const release = () => {
    if (state === "done") return;
    if (state === "opening") foregroundLeases = Math.max(0, foregroundLeases - 1);
    else trickleLeases = Math.max(0, trickleLeases - 1);
    state = "done";
    if (warmQueue.length) scheduleWarm();
  };
  return { usable, release };
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

/** Load ahead along a tour: the stop the visitor will most likely open next in full, the one
 *  after it as a coarse spread. Uses the tour's OWN order, so the last stop correctly warms
 *  #1 again (its "next" button loops), which CTA links alone never told us. */
export function warmFlowAhead(flow: any) {
  const stops: any[] = Array.isArray(flow?.stops) ? flow.stops : [];
  const at = Number(flow?.index);
  if (stops.length < 2 || !Number.isFinite(at)) return;
  prefetchDriftPath(stops[(at + 1) % stops.length]?.playerPath, { full: true });
  if (stops.length > 2 && !constrainedNetwork()) {
    prefetchDriftPath(stops[(at + 2) % stops.length]?.playerPath, { full: false });
  }
}
