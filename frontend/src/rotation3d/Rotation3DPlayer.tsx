import { useEffect, useState } from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { isSpinPlayerSite, isDriftSite, getPlayerBranding } from "../lib/branding";

/**
 * Public Rotation3D player (rotation3d.com/p/:id and /embed/:id). Fetches the
 * real frame manifest and renders it in the SpinViewer, firing anonymous
 * engagement events. /p/demo shows the synthetic object.
 */

const toCta = (c: any) =>
  c && typeof c === "object" && c.label && c.url && c.url !== "#"
    ? { label: String(c.label), url: String(c.url) }
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

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
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
  }, [productId, brandSlug, productSlug, isDemo, bySlug]);

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

  if (state.loading) return <Placeholder title="Loading…" sub="Preparing the spin." />;
  if (state.error === "not_found")
    return <Placeholder title="Not found" sub="This product isn't available yet." showHome />;
  if (state.error || !state.data)
    return <Placeholder title="Something went wrong" sub="Please try again in a moment." showHome />;

  const p = state.data;
  const m = p.manifest || {};
  const framesA: string[] = Array.isArray(m.frames) ? m.frames : [];
  // 2-clip drift: clip A + clip B form one seamless circular timeline. Dragging
  // scrubs through A then B then wraps back to A (the "there and back" loop).
  const secondM = drift ? p.secondManifest : null;
  const framesB: string[] =
    secondM && Array.isArray(secondM.frames) ? secondM.frames : [];
  const combinedFrames = framesB.length ? [...framesA, ...framesB] : framesA;
  // Remap clip-B captions into the combined index space (offset by A's length).
  let captions = drift ? p.captions : undefined;
  if (captions && framesB.length) {
    captions = captions.map((c: any) =>
      c.clip === "B"
        ? { ...c, clip: "A", startFrame: c.startFrame + framesA.length, endFrame: c.endFrame + framesA.length }
        : c,
    );
  }
  return (
    <SpinViewer
      manifest={{
        frameCount: combinedFrames.length || m.frameCount || 0,
        frames: combinedFrames,
        defaultFrame: p.defaultFrame ?? m.defaultFrame ?? 0,
      }}
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
      showLogo={showLogo}
      showName={showName}
      showTitle={showTitle}
      ctaPrimary={toCta(p.ctaPrimary)}
      ctaSecondary={toCta(p.ctaSecondary)}
      onCtaClick={(which) =>
        p?.id && trackEvent(p.id, "CTA_CLICK", { which }).catch(() => undefined)
      }
    />
  );
}
