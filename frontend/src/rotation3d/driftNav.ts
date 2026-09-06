import { apiEndpoints } from "../lib/api";

/**
 * Shared drift-to-drift navigation cache + prefetch. Used by both the standalone
 * player (Rotation3DPlayer) and the drift.li landing takeover (DriftLanding's
 * HeroLanding) so a CTA that points to another drift on this host is fetched (and
 * a spread of its frames warmed) ahead of the click — the next drift then swaps in
 * INSTANTLY, with no loader, and (because we navigate in-app) fullscreen survives.
 */

// Session caches: drift product payloads by key, and frame URLs we've warmed.
const driftCache = new Map<string, any>();
const warmedFrames = new Set<string>();

// First-path-segments that are app routes, never a brand vanity — a CTA to one of
// these is not an internal drift to prefetch / SPA-navigate.
const RESERVED_SEG = new Set([
  "p", "embed", "app", "admin", "projects", "studios", "pricing", "terms",
  "privacy", "demo", "rotation3d", "billing", "auth", "support-handoff",
  "reset-password", "api",
]);

export type DriftTarget =
  | { productId: string; path: string }
  | { bySlug: true; brandSlug: string; productSlug: string; path: string };

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
    if (segs.length === 2 && !RESERVED_SEG.has(segs[0])) {
      return { bySlug: true, brandSlug: segs[0], productSlug: segs[1], path };
    }
    return null;
  } catch {
    return null;
  }
}

export const targetKey = (t: DriftTarget) =>
  "bySlug" in t ? `${t.brandSlug}/${t.productSlug}` : t.productId;

export const driftKey = (bySlug: boolean, brandSlug?: string, productSlug?: string, productId?: string) =>
  bySlug ? `${brandSlug}/${productSlug}` : productId || "";

export const getCachedDrift = (key: string) => driftCache.get(key);
export const cacheDrift = (key: string, product: any) => {
  if (key && product) driftCache.set(key, product);
};

// Decode a spread of a drift's frames ahead of time (the default frame first) so the
// swap paints immediately instead of loading frames on demand when it appears.
export function warmFrames(product: any) {
  const m = product?.manifest || {};
  const a: string[] = Array.isArray(m.frames) ? m.frames : [];
  const secondM = product?.secondManifest;
  const b: string[] = secondM && Array.isArray(secondM.frames) ? secondM.frames : [];
  const all = [...a, ...b];
  if (!all.length) return;
  const warm = (url?: string) => {
    if (!url || warmedFrames.has(url)) return;
    warmedFrames.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  };
  warm(a[product?.defaultFrame ?? 0] || a[0]); // the frame shown first
  const step = Math.max(1, Math.floor(all.length / 16)); // ~16 spread around the loop
  for (let i = 0; i < all.length; i += step) warm(all[i]);
}

// Prefetch every drift a CTA on `product` points at (same host), so its click is an
// instant swap. Safe to call repeatedly — cached targets just get re-warmed.
export function prefetchDriftTargets(product: any) {
  for (const cta of [product?.ctaPrimary, product?.ctaSecondary]) {
    const url = cta && typeof cta === "object" ? cta.url : undefined;
    const t = resolveDriftTarget(url);
    if (!t) continue;
    const k = targetKey(t);
    if (driftCache.has(k)) {
      warmFrames(driftCache.get(k));
      continue;
    }
    const req = "bySlug" in t
      ? apiEndpoints.driftPublicBrandProduct(t.brandSlug, t.productSlug)
      : apiEndpoints.driftPublicProduct(t.productId);
    req
      .then((r) => {
        const d = r.data.product;
        if (d) {
          driftCache.set(k, d);
          warmFrames(d);
        }
      })
      .catch(() => undefined);
  }
}
