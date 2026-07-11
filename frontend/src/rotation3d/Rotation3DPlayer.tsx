import { useEffect, useState } from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { isRotation3dSite } from "../lib/branding";

/**
 * Public Rotation3D player (rotation3d.com/p/:id and /embed/:id). Fetches the
 * real frame manifest and renders it in the SpinViewer, firing anonymous
 * engagement events. /p/demo shows the synthetic object.
 */

const toCta = (c: any) =>
  c && typeof c === "object" && c.label && c.url && c.url !== "#"
    ? { label: String(c.label), url: String(c.url) }
    : undefined;

function Placeholder({ title, sub }: { title: string; sub: string }) {
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
  const bySlug = !!(brandSlug && productSlug);
  const isDemo = !bySlug && (!productId || productId === "demo");
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
      ? apiEndpoints.r3dPublicBrandProduct(brandSlug!, productSlug!)
      : apiEndpoints.r3dPublicProduct(productId!);
    req
      .then((res) => {
        if (!alive) return;
        const data = res.data.product;
        setState({ loading: false, data });
        if (data?.id) apiEndpoints.r3dTrackEvent(data.id, "VIEW").catch(() => undefined);
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
  if (bySlug && !isRotation3dSite()) return <Navigate to="/" replace />;

  if (isDemo) {
    return (
      <SpinViewer
        manifest={{ frameCount: 36, defaultFrame: 3 }}
        brandName="Rotation3D"
        productName="Demo Product"
        ctaPrimary={{ label: "Buy now", url: "#" }}
        ctaSecondary={{ label: "Next product", url: "#" }}
      />
    );
  }

  if (state.loading) return <Placeholder title="Loading…" sub="Preparing the spin." />;
  if (state.error === "not_found")
    return <Placeholder title="Not found" sub="This product isn't available yet." />;
  if (state.error || !state.data)
    return <Placeholder title="Something went wrong" sub="Please try again in a moment." />;

  const p = state.data;
  const m = p.manifest || {};
  return (
    <SpinViewer
      manifest={{
        frameCount: m.frameCount || (m.frames?.length ?? 0),
        frames: m.frames,
        defaultFrame: p.defaultFrame ?? m.defaultFrame ?? 0,
      }}
      brandName={p.brandName || "Rotation3D"}
      productName={p.name || "Product"}
      logoUrl={p.logoUrl}
      primaryColor={p.primaryColor}
      secondaryColor={p.secondaryColor}
      background={p.background}
      showControls={showControls}
      showCtas={showCtas}
      showBrand={showBrand}
      ctaPrimary={toCta(p.ctaPrimary)}
      ctaSecondary={toCta(p.ctaSecondary)}
      onCtaClick={(which) =>
        p?.id && apiEndpoints.r3dTrackEvent(p.id, "CTA_CLICK", { which }).catch(() => undefined)
      }
    />
  );
}
