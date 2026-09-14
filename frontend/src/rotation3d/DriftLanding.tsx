import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { getResolvedDriftBrandSlug } from "../lib/branding";
import { resolveDriftTarget, prefetchDriftTargets } from "./driftNav";
import { LoginModal } from "../components/LoginModal";
import { initMetaPixel, track } from "./metaPixel";
import DriftHome from "./DriftHome";

const toCta = (c: any) =>
  c && typeof c === "object" && c.label && ((c.url && c.url !== "#") || c.formId)
    ? { label: String(c.label), url: c.url && c.url !== "#" ? String(c.url) : undefined, formId: c.formId || undefined }
    : undefined;

/**
 * The "/" of a drift host. drift.li itself is the Drift Live Interactive home
 * (DriftHome — the superadmin's landing drift is its live hero). A brand's custom
 * domain shows that brand's designated landing drift full-screen (HeroLanding), or a
 * quiet placeholder when it hasn't picked one. The old gallery reel is retired.
 */

const DRIFT_PRIMARY = "#22d3ee";
const DRIFT_SECONDARY = "#3b82f6";

// Legal pages: drift.li serves its own /terms and /privacy (the shared agreement,
// branded Drift Live Interactive). A brand may override them per org (termsUrl / privacyUrl).
const DRIFT_TERMS_URL = "/terms";
const DRIFT_PRIVACY_URL = "/privacy";

// When a superadmin designates a drift as THE drift.li landing, the root renders
// that drift's full interactive player in place of the gallery — the drift's own
// logo/name hidden, drift.li branding in the header.
const HERO_CSS = `
.dl-hero-root{position:fixed;top:0;left:0;right:0;height:100vh;height:100svh;background:#05070d;overflow:hidden;overscroll-behavior:none}
.dl-hero-header{position:absolute;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;
  padding:14px clamp(16px,4vw,32px);pointer-events:none}
.dl-hero-header .dl-word{font-size:19px;font-weight:800;letter-spacing:-.01em;color:#fff}
.dl-hero-header .dl-word span{margin-left:7px;font-weight:600;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#22d3ee}
.dl-word-brand{display:flex;align-items:center;gap:9px}
.dl-word-brand .dl-word-brandname{font-size:19px;font-weight:800;letter-spacing:-.01em;color:#fff}
.dl-hero-logo{height:26px;width:auto;max-width:140px;object-fit:contain;display:block}
/* Terms/Privacy now render INSIDE the player (SpinViewer .r3d-legal), just under
   the "Powered by" badge, so they travel with the bottom stack on phones. */
.dl-hero-login{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);
  color:#e8edf4;border-radius:11px;padding:8px 16px;font-size:12.5px;font-weight:650;backdrop-filter:blur(8px);transition:background .16s}
.dl-hero-login:hover{background:rgba(255,255,255,.12)}
.dl-hero-stage{position:absolute;inset:0}
`;

function HeroLanding({ product }: { product: any }) {
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();
  // A CTA on the hero that points to another drift on this host swaps in-app
  // instead of a full reload — instant + no loader (its target is prefetched below).
  const onInternalNavigate = (url: string): boolean => {
    const t = resolveDriftTarget(url);
    if (!t) return false;
    navigate(t.path);
    return true;
  };
  // A brand can set its own Terms/Privacy for its landing; fall back to Drift Live Interactive's.
  const termsUrl = product.termsUrl || DRIFT_TERMS_URL;
  const privacyUrl = product.privacyUrl || DRIFT_PRIVACY_URL;
  // On a brand's custom domain the header shows the brand's own logo/name.
  const brandScoped = !!product.brandScoped;
  const brandLogo = product.brandLogo || null;
  const brandName = product.brandName || "Drift";
  // Memoize the frame list + manifest so an incidental re-render (a resize event,
  // a state change) never hands SpinViewer a fresh manifest object — that would
  // re-run its preload effect and flash the full loader mid-session.
  const combined = useMemo<string[]>(() => {
    const framesA: string[] = Array.isArray(product.manifest?.frames) ? product.manifest.frames : [];
    const framesB: string[] = product.secondManifest && Array.isArray(product.secondManifest.frames) ? product.secondManifest.frames : [];
    return framesB.length ? [...framesA, ...framesB] : framesA;
  }, [product]);
  const captions = useMemo(() => {
    const framesALen = Array.isArray(product.manifest?.frames) ? product.manifest.frames.length : 0;
    const hasB = product.secondManifest && Array.isArray(product.secondManifest.frames) && product.secondManifest.frames.length;
    if (product.captions && hasB) {
      return product.captions.map((c: any) =>
        c.clip === "B"
          ? { ...c, clip: "A", startFrame: c.startFrame + framesALen, endFrame: c.endFrame + framesALen }
          : c,
      );
    }
    return product.captions;
  }, [product]);
  const heroManifest = useMemo(
    () => ({ frameCount: combined.length || product.manifest?.frameCount || 0, frames: combined, defaultFrame: product.defaultFrame ?? 0 }),
    [combined, product],
  );

  // Full-screen takeover: lock the document so the in-app browser can't
  // pull-to-refresh (reload) or scroll the body behind the fixed player.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOB: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOB: body.style.overscrollBehavior,
      bodyBg: body.style.background,
    };
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.background = "#05070d";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOB;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOB;
      body.style.background = prev.bodyBg;
    };
  }, []);

  useEffect(() => {
    if (product?.metaPixelId) {
      initMetaPixel(product.metaPixelId);
      track("ViewContent", { content_name: product.name });
    }
    if (product?.id) apiEndpoints.driftTrackEvent(product.id, "VIEW").catch(() => undefined);
  }, [product]);

  // Warm the drift(s) this hero's CTAs point at, so the first hop off the landing is
  // instant (no loader) — the player reads them straight from the shared cache.
  useEffect(() => {
    prefetchDriftTargets(product);
  }, [product]);

  return (
    <div className="dl-hero-root">
      <style>{HERO_CSS}</style>
      <header className="dl-hero-header">
        {brandScoped ? (
          <div className="dl-word dl-word-brand">
            {brandLogo ? <img className="dl-hero-logo" src={brandLogo} alt={brandName} /> : null}
            <span className="dl-word-brandname">{brandName}</span>
          </div>
        ) : (
          <div className="dl-word">
            Drift Live<span>Interactive</span>
          </div>
        )}
        <button className="dl-hero-login" onClick={() => setShowLogin(true)}>
          Log in
        </button>
      </header>
      <div className="dl-hero-stage">
        <SpinViewer
          manifest={heroManifest}
          driftMode
          loopScrub={product.loopEnabled ?? false}
          driftDirection={product.driftDirection}
          brandName="Drift Live Interactive"
          productName={product.name}
          title={product.title}
          titleEnd={product.titleEnd}
          description={product.description}
          descriptionEnd={product.descriptionEnd}
          helperStart={product.helperStart}
          helperEnd={product.helperEnd}
          termsUrl={termsUrl}
          privacyUrl={privacyUrl}
          background={product.background || undefined}
          primaryColor={product.primaryColor || DRIFT_PRIMARY}
          secondaryColor={product.secondaryColor || DRIFT_SECONDARY}
          captions={captions}
          forms={product.forms}
          productId={product.id}
          ctaPrimary={toCta(product.ctaPrimary)}
          ctaSecondary={toCta(product.ctaSecondary)}
          ctaPlacement={product.ctaPlacement}
          showLogo={false}
          showName={false}
          showTitle={false}
          showTools={false}
          mobileZoom={!!product.mobileZoom}
          landing
          introHint
          onInternalNavigate={onInternalNavigate}
          onCtaClick={(which) => {
            if (product.id) apiEndpoints.driftTrackEvent(product.id, "CTA_CLICK", { which }).catch(() => undefined);
            if (product.metaPixelId) track("CTAClick", { which, content_name: product.name }, true);
          }}
        />
      </div>
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}

export default function DriftLanding() {
  return getResolvedDriftBrandSlug() ? <BrandDomainLanding /> : <DriftHome />;
}

// A brand's custom domain: its landing drift full-screen, or a quiet placeholder (never
// the drift.li home — that would leak drift.li onto the brand's domain).
function BrandDomainLanding() {
  const [landingHero, setLandingHero] = useState<any>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftPublicLandingHero(getResolvedDriftBrandSlug())
      .then((r) => {
        if (alive) setLandingHero(r.data?.product || null);
      })
      .catch(() => alive && setLandingHero(null))
      .finally(() => alive && setChecked(true));
    return () => {
      alive = false;
    };
  }, []);
  if (!checked) return <div style={{ position: "fixed", inset: 0, background: "#05070d" }} />;
  if (landingHero) return <HeroLanding product={landingHero} />;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#05070d",
        display: "grid",
        placeItems: "center",
        color: "#5b6472",
        fontFamily: '"Bai Jamjuree",system-ui,sans-serif',
        fontSize: 14,
        padding: 24,
        textAlign: "center",
      }}
    >
      Nothing here yet.
    </div>
  );
}
