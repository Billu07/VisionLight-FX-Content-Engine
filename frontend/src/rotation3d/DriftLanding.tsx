import { useEffect, useMemo, useState } from "react";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
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
.dl-hero-root{position:fixed;inset:0;background:#05070d;overflow:hidden}
.dl-hero-header{position:absolute;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;
  padding:14px clamp(16px,4vw,32px);pointer-events:none}
.dl-hero-header .dl-word{font-size:19px;font-weight:800;letter-spacing:-.01em;color:#fff}
.dl-hero-header .dl-word span{margin-left:7px;font-weight:600;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#22d3ee}
.dl-hero-login{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);
  color:#e8edf4;border-radius:11px;padding:8px 16px;font-size:12.5px;font-weight:650;backdrop-filter:blur(8px);transition:background .16s}
.dl-hero-login:hover{background:rgba(255,255,255,.12)}
.dl-hero-stage{position:absolute;inset:0}
`;

function HeroLanding({ product }: { product: any }) {
  const [showLogin, setShowLogin] = useState(false);
  const framesA: string[] = Array.isArray(product.manifest?.frames) ? product.manifest.frames : [];
  const framesB: string[] = product.secondManifest && Array.isArray(product.secondManifest.frames) ? product.secondManifest.frames : [];
  const combined = framesB.length ? [...framesA, ...framesB] : framesA;
  let captions = product.captions;
  if (captions && framesB.length) {
    captions = captions.map((c: any) =>
      c.clip === "B"
        ? { ...c, clip: "A", startFrame: c.startFrame + framesA.length, endFrame: c.endFrame + framesA.length }
        : c,
    );
  }

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
        <div className="dl-word">
          Drift Link<span>Interactive</span>
        </div>
        <button className="dl-hero-login" onClick={() => setShowLogin(true)}>
          Log in
        </button>
      </header>
      <div className="dl-hero-stage">
        <SpinViewer
          manifest={{ frameCount: combined.length || product.manifest?.frameCount || 0, frames: combined, defaultFrame: product.defaultFrame ?? 0 }}
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
          landing
          loaderLabel={product.title || "Loading…"}
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
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Item | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [landingHero, setLandingHero] = useState<any>(null);
  const [heroChecked, setHeroChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    // Check for a designated landing drift first; only load the gallery if none.
    apiEndpoints
      .driftPublicLandingHero()
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
    <div className="dl-root">
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
.dl-root{position:relative;min-height:100dvh;background:#050912;color:#e9eef7;font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;overflow-x:hidden;isolation:isolate}
.dl-aurora{position:fixed;inset:0;z-index:-2;pointer-events:none;background:
  radial-gradient(45% 55% at 15% 8%, rgba(34,211,238,.16), transparent 70%),
  radial-gradient(50% 55% at 85% 12%, rgba(59,130,246,.22), transparent 70%),
  radial-gradient(60% 60% at 50% 100%, rgba(37,99,235,.16), transparent 70%),
  linear-gradient(to bottom,#050912,#070c1a 60%,#04080f)}
.dl-grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.045;background-image:${GRAIN};background-size:140px 140px}

.dl-header{position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:20px clamp(18px,5vw,56px);border-bottom:1px solid rgba(255,255,255,.07);background:rgba(6,10,22,.5);backdrop-filter:blur(18px)}
.dl-word{font-weight:800;font-size:21px;letter-spacing:-.02em;color:#fff}
.dl-word span{margin-left:6px;background:linear-gradient(120deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-word-sm{font-size:15px}
.dl-nav{display:flex;align-items:center;gap:18px}
.dl-nav-tag{display:none;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7387a1}
@media(min-width:640px){.dl-nav-tag{display:inline}}
.dl-login{padding:9px 20px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.05);color:#fff;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:background .2s,border-color .2s}
.dl-login:hover{background:rgba(34,211,238,.12);border-color:rgba(34,211,238,.5)}

.dl-hero{position:relative;z-index:2;max-width:940px;margin:0 auto;text-align:center;padding:clamp(48px,9vw,110px) 22px clamp(28px,4vw,44px)}
.dl-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 15px;border-radius:999px;border:1px solid rgba(34,211,238,.25);background:rgba(34,211,238,.06);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#a6ecf7;margin-bottom:22px}
.dl-dot{width:6px;height:6px;border-radius:50%;background:${DRIFT_PRIMARY};box-shadow:0 0 10px rgba(34,211,238,.9)}
.dl-title{margin:0;font-size:clamp(40px,7.4vw,86px);line-height:1.0;font-weight:800;letter-spacing:-.035em;color:#fff}
.dl-title em{font-style:normal;background:linear-gradient(120deg,${DRIFT_PRIMARY},#7dd3fc,${DRIFT_SECONDARY});-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-sub{margin:22px auto 0;max-width:52ch;font-size:clamp(15px,1.7vw,19px);line-height:1.6;color:#9fb2c9}
.dl-cta-row{margin-top:32px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.dl-cta{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;border-radius:999px;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:14px;color:#04121a;background:linear-gradient(120deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});box-shadow:0 16px 44px -14px rgba(34,211,238,.6);transition:transform .2s,box-shadow .2s}
.dl-cta:hover{transform:translateY(-2px);box-shadow:0 22px 54px -16px rgba(34,211,238,.75)}
.dl-cta-ghost{padding:14px 26px;border-radius:999px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.05);color:#fff;font-family:inherit;font-weight:700;font-size:14px;cursor:pointer;transition:background .2s}
.dl-cta-ghost:hover{background:rgba(255,255,255,.12)}

/* Signature marquee gallery */
.dl-reel-wrap{position:relative;z-index:2;display:flex;flex-direction:column;gap:16px;padding:clamp(20px,4vw,44px) 0}
.dl-reel-wrap::before,.dl-reel-wrap::after{content:"";position:absolute;top:0;bottom:0;width:12vw;max-width:180px;z-index:3;pointer-events:none}
.dl-reel-wrap::before{left:0;background:linear-gradient(to right,#050912,transparent)}
.dl-reel-wrap::after{right:0;background:linear-gradient(to left,#050912,transparent)}
.dl-reel-row{overflow:hidden}
.dl-reel-track{display:flex;gap:18px;width:max-content;padding:0 9px;animation:dlreel 60s linear infinite}
.dl-reel-rev{animation-direction:reverse;animation-duration:72s}
.dl-reel-wrap:hover .dl-reel-track{animation-play-state:paused}
@keyframes dlreel{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.dl-reel-card{flex:0 0 auto;width:clamp(180px,20vw,236px);padding:0;border:0;background:transparent;cursor:pointer}
.dl-reel-art{position:relative;aspect-ratio:4/5;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.09);background:linear-gradient(180deg,#0c1830,#070c1a);transition:transform .4s cubic-bezier(.2,.7,.2,1),border-color .4s,box-shadow .4s}
.dl-reel-art img{width:100%;height:100%;object-fit:contain;padding:8%;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.dl-reel-glow{position:absolute;inset:0;opacity:0;transition:opacity .4s;background:radial-gradient(60% 60% at 50% 42%,rgba(34,211,238,.18),transparent 70%)}
.dl-reel-card:hover .dl-reel-art{transform:translateY(-6px) scale(1.02);border-color:rgba(34,211,238,.5);box-shadow:0 30px 60px -28px rgba(34,211,238,.55)}
.dl-reel-card:hover .dl-reel-art img{transform:scale(1.06)}
.dl-reel-card:hover .dl-reel-glow{opacity:1}
.dl-reel-tag{position:absolute;left:12px;top:12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(4,8,18,.5);padding:3px 9px;font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.85);backdrop-filter:blur(6px)}
.dl-reel-name{position:absolute;left:12px;right:12px;bottom:12px;text-align:center;font-size:12px;font-weight:700;color:#eaf1fa;background:rgba(4,8,18,.45);border-radius:9px;padding:5px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(6px);opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s}
.dl-reel-card:hover .dl-reel-name{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.dl-reel-track{animation:none}}

/* Bento explore */
.dl-explore{position:relative;z-index:2;max-width:1240px;margin:0 auto;padding:clamp(30px,5vw,64px) clamp(18px,5vw,40px) 60px}
.dl-explore-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.08)}
.dl-explore-head h2{margin:0;font-size:clamp(20px,2.4vw,28px);font-weight:800;letter-spacing:-.02em;color:#fff}
.dl-explore-head span{font-size:12px;color:#6c7f99;letter-spacing:.04em}
.dl-bento-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:170px;gap:14px}
.dl-bento{position:relative;overflow:hidden;border-radius:20px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,#0b1626,#070c18);padding:0;cursor:pointer;transition:transform .4s cubic-bezier(.2,.7,.2,1),border-color .4s,box-shadow .4s}
.dl-bento-big{grid-column:span 2;grid-row:span 2}
.dl-bento:hover{transform:translateY(-4px);border-color:rgba(34,211,238,.45);box-shadow:0 30px 66px -30px rgba(34,211,238,.5)}
.dl-bento-art{position:absolute;inset:0}
.dl-bento-art img{width:100%;height:100%;object-fit:contain;padding:8%;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.dl-bento:hover .dl-bento-art img{transform:scale(1.05)}
.dl-bento-glow{position:absolute;inset:0;opacity:0;transition:opacity .4s;background:radial-gradient(55% 55% at 50% 42%,rgba(34,211,238,.15),transparent 70%)}
.dl-bento:hover .dl-bento-glow{opacity:1}
.dl-bento-meta{position:absolute;inset:auto 0 0 0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:linear-gradient(to top,rgba(4,8,16,.85),transparent)}
.dl-bento-name{font-size:13px;font-weight:600;color:#eaf1fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl-bento-big .dl-bento-name{font-size:16px}
.dl-bento-go{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px solid rgba(34,211,238,.4);background:rgba(34,211,238,.12);color:${DRIFT_PRIMARY};flex:none;opacity:0;transform:translateX(-4px);transition:opacity .3s,transform .3s}
.dl-bento:hover .dl-bento-go{opacity:1;transform:none}
@media(max-width:860px){.dl-bento-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:150px}.dl-bento-big{grid-column:span 2;grid-row:span 2}}

.dl-empty{position:relative;z-index:2;text-align:center;padding:100px 20px;color:#6b7c93;font-size:14px}
.dl-footer{position:relative;z-index:2;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:space-between;padding:26px clamp(18px,5vw,40px);border-top:1px solid rgba(255,255,255,.07);color:#5f7089;font-size:12px;letter-spacing:.04em}
@media(min-width:640px){.dl-footer{flex-direction:row}}

/* Modal */
.dl-modal{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:clamp(14px,3vw,40px);background:rgba(3,6,12,.82);backdrop-filter:blur(10px);animation:dlfade .25s ease}
@keyframes dlfade{from{opacity:0}to{opacity:1}}
.dl-modal-stage{position:relative;width:min(1080px,94vw);height:min(78vh,760px);border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 50px 120px -40px rgba(0,0,0,.8)}
.dl-modal-viewer{height:100%!important}
.dl-modal-close{position:absolute;top:18px;right:20px;z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(10,16,26,.6);color:#e9eef7;font-size:26px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
.dl-modal-close:hover{background:rgba(30,40,55,.7)}
.dl-modal-cap{position:absolute;bottom:max(18px,3vh);left:0;right:0;text-align:center;color:#9db0c8;font-size:13px;letter-spacing:.02em}
`;
