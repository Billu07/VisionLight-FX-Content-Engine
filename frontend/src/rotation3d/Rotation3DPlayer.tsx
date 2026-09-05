import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Navigate, useNavigate } from "react-router-dom";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { isSpinPlayerSite, isDriftSite, getPlayerBranding } from "../lib/branding";
import { initMetaPixel, track } from "./metaPixel";

/**
 * Public Rotation3D player (rotation3d.com/p/:id and /embed/:id). Fetches the
 * real frame manifest and renders it in the SpinViewer, firing anonymous
 * engagement events. /p/demo shows the synthetic object.
 */

const toCta = (c: any) =>
  c && typeof c === "object" && c.label && ((c.url && c.url !== "#") || c.formId)
    ? {
        label: String(c.label),
        url: c.url && c.url !== "#" ? String(c.url) : undefined,
        formId: c.formId || undefined,
      }
    : undefined;

// Session cache of fetched drift products + the frames we've already warmed. A CTA
// that points to another drift on this same host is prefetched here so clicking it
// swaps the next drift in INSTANTLY (no loader) — and because we swap in place
// (React Router param change, same player element) fullscreen is never dropped.
const driftCache = new Map<string, any>();
const warmedFrames = new Set<string>();

// First-segment paths that are app routes, not brand vanity — never treat a CTA to
// one of these as an internal drift to prefetch / SPA-navigate.
const RESERVED_SEG = new Set([
  "p", "embed", "app", "admin", "projects", "studios", "pricing", "terms",
  "privacy", "demo", "rotation3d", "billing", "auth", "support-handoff",
  "reset-password", "api",
]);

type DriftTarget =
  | { productId: string; path: string }
  | { bySlug: true; brandSlug: string; productSlug: string; path: string };

// Parse a CTA url into an internal drift target we can prefetch + SPA-navigate to,
// or null (external / non-drift → let the browser navigate normally). Same-origin
// only, so a CTA to an unrelated site is never intercepted.
function parseDriftTarget(raw: string | undefined): DriftTarget | null {
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

const targetKey = (t: DriftTarget) => ("bySlug" in t ? `${t.brandSlug}/${t.productSlug}` : t.productId);

// Decode a spread of a drift's frames ahead of time so the swap paints immediately
// instead of loading them on demand when it becomes visible.
function warmFrames(product: any) {
  const m = product?.manifest || {};
  const a: string[] = Array.isArray(m.frames) ? m.frames : [];
  const secondM = product?.secondManifest;
  const b: string[] = secondM && Array.isArray(secondM.frames) ? secondM.frames : [];
  const all = [...a, ...b];
  if (!all.length) return;
  const step = Math.max(1, Math.floor(all.length / 12)); // ~12 frames spread around the loop
  for (let i = 0; i < all.length; i += step) {
    const url = all[i];
    if (!url || warmedFrames.has(url)) continue;
    warmedFrames.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

/**
 * Fetch-phase loader. Rendered while the manifest is loading, BEFORE SpinViewer
 * mounts. It deliberately mirrors SpinViewer's own `.r3d-loader` (same dark
 * gradient, same 64px gradient ring, same "Loading…" + powered line) so the
 * hand-off to the real loader is seamless — the viewer sees one continuous
 * loading screen instead of a generic card flashing before the configured one.
 */
function FullscreenLoader({ drift }: { drift: boolean }) {
  const c0 = drift ? "#22d3ee" : "var(--primary-brand,#6366f1)";
  const c1 = drift ? "#3b82f6" : "var(--secondary-brand,#8b5cf6)";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(to bottom right, #111827, #0B0F19)",
        fontFamily: '"Bai Jamjuree", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <style>{"@keyframes r3dfetchspin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ animation: "r3dfetchspin .9s linear infinite" }}>
          <defs>
            <linearGradient id="r3dfetchg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={c0} />
              <stop offset="1" stopColor={c1} />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={5} />
          <circle cx="32" cy="32" r="27" fill="none" stroke="url(#r3dfetchg)" strokeWidth={5} strokeLinecap="round" strokeDasharray="170" strokeDashoffset="118" />
        </svg>
        <div style={{ fontSize: 12, color: "#9aa3b6", letterSpacing: ".14em", textTransform: "uppercase" }}>Loading…</div>
        <div style={{ marginTop: 4, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#9aa3b6", opacity: 0.65 }}>
          {drift ? (
            <b style={{ fontWeight: 700, color: "#22d3ee" }}>Drift Link Interactive</b>
          ) : (
            <>
              Powered by <b style={{ fontWeight: 700 }}>{getPlayerBranding().name}</b>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ title, sub, showHome }: { title: string; sub: string; showHome?: boolean }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
        color: "#eef1f6",
        fontFamily: '"Bai Jamjuree", ui-sans-serif, system-ui, sans-serif',
        background:
          "radial-gradient(120% 80% at 50% -10%, #1a2336 0%, rgba(17,24,39,0) 55%), linear-gradient(to bottom right, #111827, #0B0F19)",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div
          style={{
            width: 44,
            height: 44,
            margin: "0 auto 18px",
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background:
              "linear-gradient(135deg, var(--primary-brand,#6366f1), var(--secondary-brand,#8b5cf6))",
            boxShadow: "0 0 24px rgba(34,211,238,.18)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>{title}</h1>
        <p style={{ color: "#9aa3b6", lineHeight: 1.6, margin: 0 }}>{sub}</p>
        {showHome ? (
          <a
            href={getPlayerBranding().url}
            style={{
              display: "inline-block",
              marginTop: 22,
              padding: "11px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              textDecoration: "none",
              background:
                "linear-gradient(135deg, var(--primary-brand,#6366f1), var(--secondary-brand,#8b5cf6))",
              boxShadow: "0 10px 30px -10px rgba(139,92,246,.6)",
            }}
          >
            Go to {getPlayerBranding().name} →
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function Rotation3DPlayer() {
  // /p/:productId (id) OR /:brandSlug/:productSlug (vanity)
  const { productId, brandSlug, productSlug } = useParams();
  const [search] = useSearchParams();
  // embed customization via URL params (?cta=0&controls=0&brand=0)
  const showCtas = search.get("cta") !== "0";
  const showControls = search.get("controls") !== "0";
  const showBrand = search.get("brand") !== "0";
  const showLogo = search.get("logo") !== "0";
  const showName = search.get("name") !== "0";
  const showTitle = search.get("title") !== "0";
  const bySlug = !!(brandSlug && productSlug);
  const isDemo = !bySlug && (!productId || productId === "demo");
  // drift.li serves the same player against its own data (/api/drift/*).
  const drift = isDriftSite();
  const pubProduct = drift ? apiEndpoints.driftPublicProduct : apiEndpoints.r3dPublicProduct;
  const pubBrandProduct = drift
    ? apiEndpoints.driftPublicBrandProduct
    : apiEndpoints.r3dPublicBrandProduct;
  const trackEvent = drift ? apiEndpoints.driftTrackEvent : apiEndpoints.r3dTrackEvent;
  const navigate = useNavigate();
  // The drift currently being shown. Keeping this (and the SpinViewer below) MOUNTED
  // across route changes is what lets a drift→drift jump be instant and stay
  // fullscreen: we never unmount the player element, we just swap its data.
  const cacheKey = bySlug ? `${brandSlug}/${productSlug}` : productId || "";
  const [data, setData] = useState<any>(() => (isDemo ? null : driftCache.get(cacheKey) || null));
  const [error, setError] = useState<"not_found" | "error" | undefined>(undefined);

  // Prefetch every drift a CTA points at, so its click is an instant swap.
  const prefetchNeighbors = (product: any) => {
    if (!drift) return;
    for (const cta of [product?.ctaPrimary, product?.ctaSecondary]) {
      const url = cta && typeof cta === "object" ? cta.url : undefined;
      const t = parseDriftTarget(url);
      if (!t) continue;
      const k = targetKey(t);
      if (!k || driftCache.has(k)) {
        if (k && driftCache.has(k)) warmFrames(driftCache.get(k));
        continue;
      }
      const req = "bySlug" in t ? pubBrandProduct(t.brandSlug, t.productSlug) : pubProduct(t.productId);
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
  };

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    // Captured at effect start: is a drift already on screen? If so this is a
    // TRANSITION (keep it up on failure); if not, it's the first load (may error).
    const hadData = !!data;
    const cached = driftCache.get(cacheKey);
    if (cached) {
      // Instant: we already have this drift (prefetched or revisited). Swap it in
      // without a loader — the player element stays mounted, so fullscreen holds.
      setData(cached);
      setError(undefined);
      if (cached?.id) trackEvent(cached.id, "VIEW").catch(() => undefined);
      prefetchNeighbors(cached);
      return () => {
        alive = false;
      };
    }
    // Not cached: fetch it. We deliberately DON'T clear `data` first — the previous
    // drift stays on screen (and fullscreen) until the new one is ready, so a
    // transition never flashes the loader. The loader shows only on the very first
    // load, when there's nothing to keep showing.
    const req = bySlug ? pubBrandProduct(brandSlug!, productSlug!) : pubProduct(productId!);
    req
      .then((res) => {
        if (!alive) return;
        const d = res.data.product;
        driftCache.set(cacheKey, d);
        setData(d);
        setError(undefined);
        if (d?.id) trackEvent(d.id, "VIEW").catch(() => undefined);
        prefetchNeighbors(d);
      })
      .catch((err) => {
        if (!alive) return;
        // Only surface an error when we have nothing to show; a failed TRANSITION
        // keeps the current drift up rather than blowing away the fullscreen view.
        if (!hadData) setError(err?.response?.status === 404 ? "not_found" : "error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, isDemo, bySlug]);

  // Drift ad tracking: load the brand's Meta Pixel and log a ViewContent once
  // the product resolves (per-drift id, or the brand default, from the payload).
  useEffect(() => {
    if (drift && data?.metaPixelId) {
      initMetaPixel(data.metaPixelId);
      track("ViewContent", { content_name: data.name });
    }
  }, [data, drift]);

  // Intercept a CTA that points to another drift on this host: navigate in-app
  // (SPA) instead of a full reload, so the swap is instant and fullscreen survives.
  // Returns true when handled; SpinViewer falls back to a normal navigation on false.
  const onInternalNavigate = (url: string): boolean => {
    const t = parseDriftTarget(url);
    if (!t) return false;
    navigate(t.path);
    return true;
  };

  // Memoize the manifest/captions so an incidental re-render never hands SpinViewer a
  // fresh manifest object (which would re-run its preload). It changes only when the
  // drift itself changes — which is exactly when we DO want the in-place swap.
  const view = useMemo(() => {
    if (!data) return null;
    const p = data;
    const m = p.manifest || {};
    const framesA: string[] = Array.isArray(m.frames) ? m.frames : [];
    // 2-clip drift: clip A + clip B form one seamless circular timeline.
    const secondM = drift ? p.secondManifest : null;
    const framesB: string[] = secondM && Array.isArray(secondM.frames) ? secondM.frames : [];
    const combinedFrames = framesB.length ? [...framesA, ...framesB] : framesA;
    let captions = drift ? p.captions : undefined;
    if (captions && framesB.length) {
      captions = captions.map((c: any) =>
        c.clip === "B"
          ? { ...c, clip: "A", startFrame: c.startFrame + framesA.length, endFrame: c.endFrame + framesA.length }
          : c,
      );
    }
    const manifest = {
      frameCount: combinedFrames.length || m.frameCount || 0,
      frames: combinedFrames,
      defaultFrame: p.defaultFrame ?? m.defaultFrame ?? 0,
    };
    return { p, manifest, captions };
  }, [data, drift]);

  // vanity URLs are Rotation3D-host only — on other domains fall through to "/"
  if (bySlug && !isSpinPlayerSite()) return <Navigate to="/" replace />;

  if (isDemo) {
    return (
      <SpinViewer
        manifest={{ frameCount: 36, defaultFrame: 3 }}
        brandName={getPlayerBranding().name}
        productName="Demo Product"
        ctaPrimary={{ label: "Buy now", url: "#" }}
        ctaSecondary={{ label: "Next product", url: "#" }}
        enableLoop={getPlayerBranding().loopByDefault}
      />
    );
  }

  // First load only (nothing to keep showing). Transitions never hit this — the
  // previous drift stays mounted until the next one is ready.
  if (!view) {
    if (error === "not_found")
      return <Placeholder title="Not found" sub="This product isn't available yet." showHome />;
    if (error)
      return <Placeholder title="Something went wrong" sub="Please try again in a moment." showHome />;
    return <FullscreenLoader drift={drift} />;
  }

  const p = view.p;
  return (
    <SpinViewer
      manifest={view.manifest}
      brandName={p.brandName || getPlayerBranding().name}
      productName={p.name || "Product"}
      title={p.title}
      description={p.description}
      titleEnd={drift ? p.titleEnd : undefined}
      descriptionEnd={drift ? p.descriptionEnd : undefined}
      helperStart={drift ? p.helperStart : undefined}
      helperEnd={drift ? p.helperEnd : undefined}
      videoUrl={p.videoUrl}
      showViewSelector={p.showViewSelector}
      enableLoop={drift ? false : getPlayerBranding().loopByDefault}
      loopScrub={drift ? p.loopEnabled ?? false : true}
      driftMode={drift}
      captions={view.captions}
      logoUrl={p.logoUrl}
      primaryColor={p.primaryColor}
      secondaryColor={p.secondaryColor}
      background={p.background}
      showControls={showControls}
      showCtas={showCtas}
      showBrand={showBrand}
      showLogo={showLogo && !(drift && p.hideLogo)}
      showName={showName && !(drift && p.hideName)}
      showTitle={showTitle && !(drift && p.hideTitle)}
      mobileZoom={drift ? !!p.mobileZoom : true}
      introHint={drift}
      ctaPrimary={toCta(p.ctaPrimary)}
      ctaSecondary={toCta(p.ctaSecondary)}
      forms={drift ? p.forms : undefined}
      productId={p.id}
      onInternalNavigate={drift ? onInternalNavigate : undefined}
      onCtaClick={(which) => {
        if (p?.id) trackEvent(p.id, "CTA_CLICK", { which }).catch(() => undefined);
        if (drift && p.metaPixelId) track("CTAClick", { which, content_name: p.name }, true);
      }}
    />
  );
}
