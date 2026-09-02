import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

const DEMO_MANIFEST = { frameCount: 36, defaultFrame: 3 };

// The poster shown during a drift-to-drift cross-fade — the captioned snapshot,
// else the default frame.
function posterOf(d: any): string | null {
  if (!d) return null;
  if (d.thumbnailUrl) return String(d.thumbnailUrl);
  const frames = d.manifest?.frames;
  if (Array.isArray(frames) && frames.length) {
    return String(frames[Math.min(d.defaultFrame ?? 0, frames.length - 1)]);
  }
  return null;
}

// Resolve a CTA url to a same-origin PLAYER route we can SPA-navigate + cross-fade
// to. Returns the path + a cache key (+ params), or null for external / non-player
// links (which fall back to a normal navigation).
const RESERVED_TOP = new Set([
  "p", "embed", "app", "admin", "projects", "demo", "rotation3d", "pricing",
  "terms", "privacy", "studios", "billing", "auth", "reset-password", "support-handoff",
]);
function parsePlayerTarget(
  raw: string,
  currentPath: string,
): { path: string; key: string; id?: string; brand?: string; slug?: string } | null {
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    if (u.pathname === currentPath) return null;
    const mP = /^\/p\/([^/]+)$/.exec(u.pathname);
    if (mP) return { path: u.pathname + u.search, key: `p:${mP[1]}`, id: mP[1] };
    const mS = /^\/([^/]+)\/([^/]+)$/.exec(u.pathname);
    if (mS && !RESERVED_TOP.has(mS[1])) {
      return { path: u.pathname + u.search, key: `s:${mS[1]}/${mS[2]}`, brand: mS[1], slug: mS[2] };
    }
    return null;
  } catch {
    return null;
  }
}

// The poster cross-fade overlay that bridges a drift-to-drift jump.
function XfadeOverlay({ poster, show }: { poster: string | null; show: boolean }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "#0B0F19",
        opacity: show && entered ? 1 : 0,
        transition: "opacity .42s ease",
        pointerEvents: "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      {poster ? (
        <img src={poster} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : null}
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
  const [state, setState] = useState<{
    loading: boolean;
    data?: any;
    error?: "not_found" | "error";
  }>({ loading: !isDemo });

  // Drift-to-drift SPA transition: a poster cross-fade covers the swap so the
  // viewer never hits the "Loading…" wall when jumping between drifts.
  const navigate = useNavigate();
  const [xfade, setXfade] = useState<{ poster: string | null; show: boolean } | null>(null);
  const prefetch = useRef<Map<string, any>>(new Map());
  const fetchKey = bySlug ? `s:${brandSlug}/${productSlug}` : `p:${productId}`;

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    // Prefetched (from a CTA) → swap in instantly, no loading flash.
    const cached = prefetch.current.get(fetchKey);
    if (cached) {
      setState({ loading: false, data: cached });
      if (cached?.id) trackEvent(cached.id, "VIEW").catch(() => undefined);
      return () => {
        alive = false;
      };
    }
    setState({ loading: true });
    const req = bySlug
      ? pubBrandProduct(brandSlug!, productSlug!)
      : pubProduct(productId!);
    req
      .then((res) => {
        if (!alive) return;
        const data = res.data.product;
        setState({ loading: false, data });
        if (data?.id) trackEvent(data.id, "VIEW").catch(() => undefined);
      })
      .catch((err) => {
        if (!alive) return;
        setState({
          loading: false,
          error: err?.response?.status === 404 ? "not_found" : "error",
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, brandSlug, productSlug, isDemo, bySlug]);

  // Drift ad tracking: load the brand's Meta Pixel and log a ViewContent once
  // the product resolves (per-drift id, or the brand default, from the payload).
  useEffect(() => {
    const d = state.data;
    if (drift && d?.metaPixelId) {
      initMetaPixel(d.metaPixelId);
      track("ViewContent", { content_name: d.name });
    }
  }, [state.data, drift]);

  // Prefetch the drift(s) the CTAs point at, so "Next" lands with a ready poster
  // (and warm frame cache) instead of a cold load.
  useEffect(() => {
    const d = state.data;
    if (!d || isDemo) return;
    let cancelled = false;
    const currentPath = window.location.pathname;
    const targets = [d.ctaPrimary?.url, d.ctaSecondary?.url].filter(Boolean) as string[];
    targets.forEach((raw) => {
      const t = parsePlayerTarget(raw, currentPath);
      if (!t || prefetch.current.has(t.key)) return;
      const req = t.id ? pubProduct(t.id) : pubBrandProduct(t.brand!, t.slug!);
      req
        .then((res) => {
          if (cancelled) return;
          const data = res.data?.product;
          if (!data) return;
          prefetch.current.set(t.key, data);
          const poster = posterOf(data);
          if (poster) {
            const im = new Image();
            im.src = poster; // warm the poster for an instant cross-fade
          }
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, isDemo]);

  // Memoize the frame manifest + captions so incidental re-renders (e.g. the
  // cross-fade state) never hand SpinViewer a fresh manifest and restart its
  // preloader — only a real drift change (new state.data) rebuilds them.
  const manifest = useMemo(() => {
    const p = state.data;
    if (!p) return null;
    const m = p.manifest || {};
    const framesA: string[] = Array.isArray(m.frames) ? m.frames : [];
    const secondM = drift ? p.secondManifest : null;
    const framesB: string[] = secondM && Array.isArray(secondM.frames) ? secondM.frames : [];
    const combined = framesB.length ? [...framesA, ...framesB] : framesA;
    return {
      frameCount: combined.length || m.frameCount || 0,
      frames: combined,
      defaultFrame: p.defaultFrame ?? m.defaultFrame ?? 0,
    };
  }, [state.data, drift]);

  const captions = useMemo(() => {
    const p = state.data;
    if (!p || !drift) return undefined;
    const m = p.manifest || {};
    const framesALen = Array.isArray(m.frames) ? m.frames.length : 0;
    const hasB = p.secondManifest && Array.isArray(p.secondManifest.frames) && p.secondManifest.frames.length;
    if (p.captions && hasB) {
      return p.captions.map((c: any) =>
        c.clip === "B"
          ? { ...c, clip: "A", startFrame: c.startFrame + framesALen, endFrame: c.endFrame + framesALen }
          : c,
      );
    }
    return p.captions;
  }, [state.data, drift]);

  const handleNavigate = (raw: string): boolean => {
    const t = parsePlayerTarget(raw, window.location.pathname);
    if (!t) return false; // external / non-player → let SpinViewer navigate normally
    const cached = prefetch.current.get(t.key);
    setXfade({ poster: cached ? posterOf(cached) : null, show: true });
    navigate(t.path);
    return true;
  };
  const handleReady = () => {
    // The incoming drift's frames are up — fade the poster bridge back out.
    setXfade((x) => (x ? { ...x, show: false } : null));
    window.setTimeout(() => setXfade(null), 460);
  };

  // vanity URLs are Rotation3D-host only — on other domains fall through to "/"
  if (bySlug && !isSpinPlayerSite()) return <Navigate to="/" replace />;

  if (isDemo) {
    return (
      <SpinViewer
        manifest={DEMO_MANIFEST}
        brandName={getPlayerBranding().name}
        productName="Demo Product"
        ctaPrimary={{ label: "Buy now", url: "#" }}
        ctaSecondary={{ label: "Next product", url: "#" }}
        enableLoop={getPlayerBranding().loopByDefault}
      />
    );
  }

  const p = state.data;
  let content: ReactNode;
  if (state.loading) {
    content = <Placeholder title="Loading…" sub="Preparing the spin." />;
  } else if (state.error === "not_found") {
    content = <Placeholder title="Not found" sub="This product isn't available yet." showHome />;
  } else if (state.error || !p || !manifest) {
    content = <Placeholder title="Something went wrong" sub="Please try again in a moment." showHome />;
  } else {
    content = (
      <SpinViewer
        manifest={manifest}
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
        captions={captions}
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
        ctaPrimary={toCta(p.ctaPrimary)}
        ctaSecondary={toCta(p.ctaSecondary)}
        forms={drift ? p.forms : undefined}
        productId={p.id}
        onNavigate={drift ? handleNavigate : undefined}
        onReady={handleReady}
        onCtaClick={(which) => {
          if (p?.id) trackEvent(p.id, "CTA_CLICK", { which }).catch(() => undefined);
          if (drift && p.metaPixelId) track("CTAClick", { which, content_name: p.name }, true);
        }}
      />
    );
  }

  return (
    <>
      {content}
      {xfade ? <XfadeOverlay poster={xfade.poster} show={xfade.show} /> : null}
    </>
  );
}
