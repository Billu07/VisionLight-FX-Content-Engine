import { useEffect, useMemo, useState } from "react";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { getResolvedDriftBrandSlug } from "../lib/branding";
import { LoginModal } from "../components/LoginModal";
import { initMetaPixel, track } from "./metaPixel";

const toCta = (c: any) =>
  c && typeof c === "object" && c.label && ((c.url && c.url !== "#") || c.formId)
    ? { label: String(c.label), url: c.url && c.url !== "#" ? String(c.url) : undefined, formId: c.formId || undefined }
    : undefined;

/**
 * drift.li landing — a cinematic "gallery in motion": an infinite auto-scrolling
 * poster reel (two rows drifting opposite ways) over a grain + aurora backdrop,
 * then an asymmetric bento explore grid. Clicking any drift opens a smooth
 * full-screen interactive modal built from the manifest already on the page
 * (works for Drift + Rotation3D-sourced items). Cyan/blue cinematic theme.
 */

const DRIFT_PRIMARY = "#22d3ee";
const DRIFT_SECONDARY = "#3b82f6";

// Legal docs shown only on the drift.li landing takeover (not on the players).
const DRIFT_TERMS_URL =
  "https://docs.google.com/document/d/1fBXABIgmCxjwK6oMxeSGDZ6ny-PdFwe7Orhd_L02oOQ/edit?usp=sharing";
const DRIFT_PRIVACY_URL =
  "https://docs.google.com/document/d/1f5mEo1Fcc64gzGEyQmz81ReW_PqlhZS87tpffaVgNt0/edit?usp=sharing";

type Item = {
  itemId: string;
  source: string;
  id: string;
  name: string;
  title?: string | null;
  titleEnd?: string | null;
  description?: string | null;
  descriptionEnd?: string | null;
  helperStart?: string | null;
  helperEnd?: string | null;
  brandName: string;
  defaultFrame: number;
  background: string | null;
  loopEnabled: boolean;
  manifest: any;
  secondManifest: any;
  thumb: string | null;
  isHero: boolean;
};

const combinedManifest = (it: Item) => {
  const a: string[] = Array.isArray(it.manifest?.frames) ? it.manifest.frames : [];
  const b: string[] = Array.isArray(it.secondManifest?.frames) ? it.secondManifest.frames : [];
  const frames = b.length ? [...a, ...b] : a;
  return { frameCount: frames.length, frames, defaultFrame: 0 };
};

function PlayerModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const manifest = useMemo(() => combinedManifest(item), [item]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dl-modal" onClick={onClose}>
      <button className="dl-modal-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="dl-modal-stage" onClick={(e) => e.stopPropagation()}>
        <SpinViewer
          manifest={manifest}
          driftMode
          loopScrub={item.loopEnabled}
          brandName="Drift Link"
          productName={item.name}
          title={item.title}
          titleEnd={item.titleEnd}
          description={item.description}
          descriptionEnd={item.descriptionEnd}
          helperStart={item.helperStart}
          helperEnd={item.helperEnd}
          background={item.background || undefined}
          primaryColor={DRIFT_PRIMARY}
          secondaryColor={DRIFT_SECONDARY}
          showBrand={false}
          className="dl-modal-viewer"
        />
      </div>
      <div className="dl-modal-cap">
        {item.name}
        {item.brandName ? ` · ${item.brandName}` : ""}
      </div>
    </div>
  );
}

// A single reel card (used in the marquee rows).
function ReelCard({ it, onOpen }: { it: Item; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="dl-reel-card group" aria-label={it.name}>
      <div className="dl-reel-art">
        {it.thumb ? <img src={it.thumb} alt={it.name} loading="lazy" /> : null}
        <span className="dl-reel-glow" />
        <span className="dl-reel-tag">{it.source === "ROTATION3D" ? "R3D" : "Drift"}</span>
        <span className="dl-reel-name">{it.name}</span>
      </div>
    </button>
  );
}

// A bento tile (varied size in the explore grid).
function BentoTile({ it, onOpen, big }: { it: Item; onOpen: () => void; big?: boolean }) {
  return (
    <button type="button" onClick={onOpen} className={`dl-bento group ${big ? "dl-bento-big" : ""}`} aria-label={it.name}>
      <div className="dl-bento-art">
        {it.thumb ? <img src={it.thumb} alt={it.name} loading="lazy" /> : null}
        <span className="dl-bento-glow" />
      </div>
      <div className="dl-bento-meta">
        <span className="dl-bento-name">{it.name}</span>
        <span className="dl-bento-go">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </span>
      </div>
    </button>
  );
}

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
  // A brand can set its own Terms/Privacy for its landing; fall back to Drift Link's.
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
            Drift Link<span>Interactive</span>
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
          brandName="Drift Link"
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
          showLogo={false}
          showName={false}
          showTitle={false}
          showTools={false}
          mobileZoom={!!product.mobileZoom}
          landing
          introHint
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

const DL_THEME_KEY = "drift-landing-theme";

export default function DriftLanding() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Item | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [landingHero, setLandingHero] = useState<any>(null);
  const [heroChecked, setHeroChecked] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem(DL_THEME_KEY) === "light" ? "light" : "dark";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(DL_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    let alive = true;
    // On a brand's custom domain, scope the hero to that brand's landing drift.
    const brandSlug = getResolvedDriftBrandSlug();
    // Check for a designated landing drift first; only load the gallery if none.
    apiEndpoints
      .driftPublicLandingHero(brandSlug)
      .then((r) => {
        if (alive) setLandingHero(r.data?.product || null);
      })
      .catch(() => alive && setLandingHero(null))
      .finally(() => alive && setHeroChecked(true));
    apiEndpoints
      .driftPublicLanding()
      .then((r) => alive && setItems(r.data.items || []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // A designated landing drift takes over the whole page.
  if (heroChecked && landingHero) return <HeroLanding product={landingHero} />;
  // Avoid a flash of the gallery before the hero check resolves.
  if (!heroChecked) return <div style={{ position: "fixed", inset: 0, background: "#05070d" }} />;
  // On a brand's custom domain with no landing drift set, don't fall back to the
  // drift.li gallery (it would leak other brands' drifts) — show a quiet placeholder.
  if (getResolvedDriftBrandSlug()) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#05070d", display: "grid", placeItems: "center", color: "#5b6472", fontFamily: '"Bai Jamjuree",system-ui,sans-serif', fontSize: 14, padding: 24, textAlign: "center" }}>
        Nothing here yet.
      </div>
    );
  }

  const hero = items.find((i) => i.isHero) || items[0] || null;

  // Build a reel long enough to loop smoothly (repeat sparse sets), then split.
  const reel = useMemo(() => {
    if (items.length === 0) return { a: [] as Item[], b: [] as Item[] };
    let pool = [...items];
    while (pool.length < 8) pool = [...pool, ...items];
    const half = Math.ceil(pool.length / 2);
    return { a: pool.slice(0, half), b: pool.slice(half).concat(pool.slice(0, half)).slice(0, half) };
  }, [items]);

  return (
    <div className="dl-root" data-theme={theme}>
      <style>{CSS}</style>
      <div className="dl-aurora" aria-hidden />
      <div className="dl-grain" aria-hidden />

      {/* Header */}
      <header className="dl-header">
        <div className="dl-word">
          Drift Link<span>Interactive</span>
        </div>
        <div className="dl-nav">
          <span className="dl-nav-tag">Interactive drift paths</span>
          <button
            className="dl-theme"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            )}
          </button>
          <button className="dl-login" onClick={() => setShowLogin(true)}>
            Log in
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="dl-hero">
        <div className="dl-eyebrow">
          <span className="dl-dot" />
          Motion you can hold
        </div>
        <h1 className="dl-title">
          Drag anything <em>to life.</em>
        </h1>
        <p className="dl-sub">
          Real footage, turned into an interactive path you scrub with a finger — headlines, captions, and
          calls-to-action that move with the shot.
        </p>
        <div className="dl-cta-row">
          {hero && (
            <button className="dl-cta" onClick={() => setActive(hero)}>
              Explore the drift
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
            </button>
          )}
          <button className="dl-cta-ghost" onClick={() => setShowLogin(true)}>
            Log in
          </button>
        </div>
      </section>

      {/* Signature marquee gallery */}
      {items.length > 0 && (
        <section className="dl-reel-wrap" aria-label="Drift gallery">
          <div className="dl-reel-row">
            <div className="dl-reel-track">
              {[...reel.a, ...reel.a].map((it, i) => (
                <ReelCard key={`a${i}`} it={it} onOpen={() => setActive(it)} />
              ))}
            </div>
          </div>
          <div className="dl-reel-row">
            <div className="dl-reel-track dl-reel-rev">
              {[...reel.b, ...reel.b].map((it, i) => (
                <ReelCard key={`b${i}`} it={it} onOpen={() => setActive(it)} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bento explore */}
      {items.length > 0 ? (
        <section className="dl-explore">
          <div className="dl-explore-head">
            <h2>The gallery</h2>
            <span>{items.length} interactive drift{items.length === 1 ? "" : "s"}</span>
          </div>
          <div className="dl-bento-grid">
            {items.map((it, i) => (
              <BentoTile key={it.itemId} it={it} onOpen={() => setActive(it)} big={i === 0} />
            ))}
          </div>
        </section>
      ) : (
        <section className="dl-empty">{loading ? "Loading the gallery…" : "Nothing showcased yet."}</section>
      )}

      <footer className="dl-footer">
        <div className="dl-word dl-word-sm">
          Drift Link<span>Interactive</span>
        </div>
        <span>Interactive drift paths · © 2026</span>
      </footer>

      {active && <PlayerModal item={active} onClose={() => setActive(null)} />}
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const CSS = `
.dl-root{
  --dl-bg:#050912; --dl-bg2:#070c1a; --dl-bg3:#04080f;
  --dl-text:#fff; --dl-text2:#9fb2c9; --dl-text3:#6c7f99; --dl-text4:#5f7089;
  --dl-border:rgba(255,255,255,.08); --dl-border2:rgba(255,255,255,.28);
  --dl-glass:rgba(255,255,255,.05); --dl-glass2:rgba(255,255,255,.12);
  --dl-header:rgba(6,10,22,.5);
  --dl-tile:linear-gradient(180deg,#0c1830,#070c1a); --dl-tile-b:rgba(255,255,255,.09);
  --dl-bento:linear-gradient(180deg,#0b1626,#070c18);
  --dl-chip-bg:rgba(4,8,18,.5); --dl-chip-t:rgba(255,255,255,.85);
  --dl-name-bg:rgba(4,8,18,.45); --dl-name-t:#eaf1fa;
  --dl-meta:linear-gradient(to top,rgba(4,8,16,.85),transparent);
  --dl-eb-bg:rgba(34,211,238,.06); --dl-eb-b:rgba(34,211,238,.25); --dl-eb-t:#a6ecf7;
  --dl-accent:#22d3ee; --dl-accent-grad:linear-gradient(120deg,#22d3ee,#3b82f6);
  --dl-title-grad:linear-gradient(120deg,#22d3ee,#7dd3fc,#3b82f6);
  --dl-grain-op:.045; --dl-grain-blend:normal;
  --dl-aurora:
    radial-gradient(45% 55% at 15% 8%, rgba(34,211,238,.16), transparent 70%),
    radial-gradient(50% 55% at 85% 12%, rgba(59,130,246,.22), transparent 70%),
    radial-gradient(60% 60% at 50% 100%, rgba(37,99,235,.16), transparent 70%),
    linear-gradient(to bottom,#050912,#070c1a 60%,#04080f);
  position:relative;min-height:100dvh;background:var(--dl-bg);color:var(--dl-text);font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;overflow-x:hidden;isolation:isolate;transition:background .3s,color .3s}
.dl-root[data-theme="light"]{
  --dl-bg:#f5f8fc; --dl-bg2:#eef3fb; --dl-bg3:#f3f6fc;
  --dl-text:#14203a; --dl-text2:#586a86; --dl-text3:#7a8aa3; --dl-text4:#8b98ad;
  --dl-border:rgba(15,23,42,.09); --dl-border2:rgba(15,23,42,.16);
  --dl-glass:rgba(15,23,42,.04); --dl-glass2:rgba(15,23,42,.08);
  --dl-header:rgba(255,255,255,.72);
  --dl-tile:linear-gradient(180deg,#ffffff,#eef3fa); --dl-tile-b:rgba(15,23,42,.10);
  --dl-bento:linear-gradient(180deg,#ffffff,#eef3fa);
  --dl-chip-bg:rgba(255,255,255,.72); --dl-chip-t:#334155;
  --dl-name-bg:rgba(255,255,255,.78); --dl-name-t:#1c2942;
  --dl-meta:linear-gradient(to top,rgba(255,255,255,.92),transparent);
  --dl-eb-bg:rgba(8,145,178,.08); --dl-eb-b:rgba(8,145,178,.28); --dl-eb-t:#0e7490;
  --dl-accent:#0891b2; --dl-accent-grad:linear-gradient(120deg,#0891b2,#2563eb);
  --dl-title-grad:linear-gradient(120deg,#0891b2,#0ea5e9,#2563eb);
  --dl-grain-op:.03; --dl-grain-blend:multiply;
  --dl-aurora:
    radial-gradient(45% 55% at 15% 8%, rgba(34,211,238,.14), transparent 70%),
    radial-gradient(50% 55% at 85% 12%, rgba(59,130,246,.13), transparent 70%),
    radial-gradient(60% 60% at 50% 100%, rgba(37,99,235,.08), transparent 70%),
    linear-gradient(to bottom,#f5f8fc,#eef3fb 60%,#f3f6fc);
}
.dl-aurora{position:fixed;inset:0;z-index:-2;pointer-events:none;background:var(--dl-aurora)}
.dl-grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:var(--dl-grain-op);mix-blend-mode:var(--dl-grain-blend);background-image:${GRAIN};background-size:140px 140px}

.dl-header{position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:20px clamp(18px,5vw,56px);border-bottom:1px solid var(--dl-border);background:var(--dl-header);backdrop-filter:blur(18px)}
.dl-word{font-weight:800;font-size:21px;letter-spacing:-.02em;color:var(--dl-text)}
.dl-word span{margin-left:6px;background:var(--dl-accent-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-word-sm{font-size:15px}
.dl-nav{display:flex;align-items:center;gap:14px}
.dl-nav-tag{display:none;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--dl-text3)}
@media(min-width:720px){.dl-nav-tag{display:inline}}
.dl-theme{width:38px;height:38px;display:grid;place-items:center;border-radius:999px;border:1px solid var(--dl-border2);background:var(--dl-glass);color:var(--dl-text);cursor:pointer;transition:background .2s,border-color .2s}
.dl-theme:hover{background:var(--dl-glass2)}
.dl-login{padding:9px 20px;border-radius:999px;border:1px solid var(--dl-border2);background:var(--dl-glass);color:var(--dl-text);font-family:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:background .2s,border-color .2s}
.dl-login:hover{background:var(--dl-eb-bg);border-color:var(--dl-eb-b)}

.dl-hero{position:relative;z-index:2;max-width:940px;margin:0 auto;text-align:center;padding:clamp(48px,9vw,110px) 22px clamp(28px,4vw,44px)}
.dl-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 15px;border-radius:999px;border:1px solid var(--dl-eb-b);background:var(--dl-eb-bg);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--dl-eb-t);margin-bottom:22px}
.dl-dot{width:6px;height:6px;border-radius:50%;background:var(--dl-accent);box-shadow:0 0 10px var(--dl-accent)}
.dl-title{margin:0;font-size:clamp(40px,7.4vw,86px);line-height:1.0;font-weight:800;letter-spacing:-.035em;color:var(--dl-text)}
.dl-title em{font-style:normal;background:var(--dl-title-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-sub{margin:22px auto 0;max-width:52ch;font-size:clamp(15px,1.7vw,19px);line-height:1.6;color:var(--dl-text2)}
.dl-cta-row{margin-top:32px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.dl-cta{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;border-radius:999px;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:14px;color:#fff;background:var(--dl-accent-grad);box-shadow:0 16px 44px -14px rgba(34,211,238,.5);transition:transform .2s,box-shadow .2s}
.dl-cta:hover{transform:translateY(-2px);box-shadow:0 22px 54px -16px rgba(34,211,238,.6)}
.dl-cta-ghost{padding:14px 26px;border-radius:999px;border:1px solid var(--dl-border2);background:var(--dl-glass);color:var(--dl-text);font-family:inherit;font-weight:700;font-size:14px;cursor:pointer;transition:background .2s}
.dl-cta-ghost:hover{background:var(--dl-glass2)}

/* Signature marquee gallery */
.dl-reel-wrap{position:relative;z-index:2;display:flex;flex-direction:column;gap:16px;padding:clamp(20px,4vw,44px) 0}
.dl-reel-wrap::before,.dl-reel-wrap::after{content:"";position:absolute;top:0;bottom:0;width:12vw;max-width:180px;z-index:3;pointer-events:none}
.dl-reel-wrap::before{left:0;background:linear-gradient(to right,var(--dl-bg),transparent)}
.dl-reel-wrap::after{right:0;background:linear-gradient(to left,var(--dl-bg),transparent)}
.dl-reel-row{overflow:hidden}
.dl-reel-track{display:flex;gap:18px;width:max-content;padding:0 9px;animation:dlreel 60s linear infinite}
.dl-reel-rev{animation-direction:reverse;animation-duration:72s}
.dl-reel-wrap:hover .dl-reel-track{animation-play-state:paused}
@keyframes dlreel{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.dl-reel-card{flex:0 0 auto;width:clamp(180px,20vw,236px);padding:0;border:0;background:transparent;cursor:pointer}
.dl-reel-art{position:relative;aspect-ratio:4/5;border-radius:18px;overflow:hidden;border:1px solid var(--dl-tile-b);background:var(--dl-tile);transition:transform .4s cubic-bezier(.2,.7,.2,1),border-color .4s,box-shadow .4s}
.dl-reel-art img{width:100%;height:100%;object-fit:contain;padding:8%;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.dl-reel-glow{position:absolute;inset:0;opacity:0;transition:opacity .4s;background:radial-gradient(60% 60% at 50% 42%,rgba(34,211,238,.18),transparent 70%)}
.dl-reel-card:hover .dl-reel-art{transform:translateY(-6px) scale(1.02);border-color:var(--dl-eb-b);box-shadow:0 30px 60px -28px rgba(34,211,238,.4)}
.dl-reel-card:hover .dl-reel-art img{transform:scale(1.06)}
.dl-reel-card:hover .dl-reel-glow{opacity:1}
.dl-reel-tag{position:absolute;left:12px;top:12px;border-radius:999px;border:1px solid var(--dl-border);background:var(--dl-chip-bg);padding:3px 9px;font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--dl-chip-t);backdrop-filter:blur(6px)}
.dl-reel-name{position:absolute;left:12px;right:12px;bottom:12px;text-align:center;font-size:12px;font-weight:700;color:var(--dl-name-t);background:var(--dl-name-bg);border-radius:9px;padding:5px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(6px);opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s}
.dl-reel-card:hover .dl-reel-name{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.dl-reel-track{animation:none}}

/* Bento explore */
.dl-explore{position:relative;z-index:2;max-width:1240px;margin:0 auto;padding:clamp(30px,5vw,64px) clamp(18px,5vw,40px) 60px}
.dl-explore-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid var(--dl-border)}
.dl-explore-head h2{margin:0;font-size:clamp(20px,2.4vw,28px);font-weight:800;letter-spacing:-.02em;color:var(--dl-text)}
.dl-explore-head span{font-size:12px;color:var(--dl-text3);letter-spacing:.04em}
.dl-bento-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:170px;gap:14px}
.dl-bento{position:relative;overflow:hidden;border-radius:20px;border:1px solid var(--dl-border);background:var(--dl-bento);padding:0;cursor:pointer;transition:transform .4s cubic-bezier(.2,.7,.2,1),border-color .4s,box-shadow .4s}
.dl-bento-big{grid-column:span 2;grid-row:span 2}
.dl-bento:hover{transform:translateY(-4px);border-color:var(--dl-eb-b);box-shadow:0 30px 66px -30px rgba(34,211,238,.35)}
.dl-bento-art{position:absolute;inset:0}
.dl-bento-art img{width:100%;height:100%;object-fit:contain;padding:8%;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.dl-bento:hover .dl-bento-art img{transform:scale(1.05)}
.dl-bento-glow{position:absolute;inset:0;opacity:0;transition:opacity .4s;background:radial-gradient(55% 55% at 50% 42%,rgba(34,211,238,.15),transparent 70%)}
.dl-bento:hover .dl-bento-glow{opacity:1}
.dl-bento-meta{position:absolute;inset:auto 0 0 0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:var(--dl-meta)}
.dl-bento-name{font-size:13px;font-weight:600;color:var(--dl-name-t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl-bento-big .dl-bento-name{font-size:16px}
.dl-bento-go{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px solid var(--dl-eb-b);background:var(--dl-eb-bg);color:var(--dl-accent);flex:none;opacity:0;transform:translateX(-4px);transition:opacity .3s,transform .3s}
.dl-bento:hover .dl-bento-go{opacity:1;transform:none}
@media(max-width:860px){.dl-bento-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:150px}.dl-bento-big{grid-column:span 2;grid-row:span 2}}

.dl-empty{position:relative;z-index:2;text-align:center;padding:100px 20px;color:var(--dl-text3);font-size:14px}
.dl-footer{position:relative;z-index:2;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:space-between;padding:26px clamp(18px,5vw,40px);border-top:1px solid var(--dl-border);color:var(--dl-text4);font-size:12px;letter-spacing:.04em}
@media(min-width:640px){.dl-footer{flex-direction:row}}

/* Modal — stays dark (the interactive player is a dark stage) */
.dl-modal{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:clamp(14px,3vw,40px);background:rgba(3,6,12,.82);backdrop-filter:blur(10px);animation:dlfade .25s ease}
@keyframes dlfade{from{opacity:0}to{opacity:1}}
.dl-modal-stage{position:relative;width:min(1080px,94vw);height:min(78vh,760px);border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 50px 120px -40px rgba(0,0,0,.8)}
.dl-modal-viewer{height:100%!important}
.dl-modal-close{position:absolute;top:18px;right:20px;z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(10,16,26,.6);color:#e9eef7;font-size:26px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
.dl-modal-close:hover{background:rgba(30,40,55,.7)}
.dl-modal-cap{position:absolute;bottom:max(18px,3vh);left:0;right:0;text-align:center;color:#9db0c8;font-size:13px;letter-spacing:.02em}
`;
