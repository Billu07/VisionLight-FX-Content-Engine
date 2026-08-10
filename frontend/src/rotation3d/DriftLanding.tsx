import { useEffect, useMemo, useState } from "react";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { LoginModal } from "../components/LoginModal";

/**
 * drift.li landing — cinematic, motion-first but PERFORMANT: the grid shows clean
 * contained posters (no dozens of live canvases), and clicking any item opens a
 * full-screen interactive player MODAL built from the manifest already loaded on
 * the page. That makes it smooth and lets it open Drift *and* Rotation3D-sourced
 * items (cross-line curation) without any per-item endpoint. Curated via the
 * superadmin Drift → Landing showcase.
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
  brandName: string;
  defaultFrame: number;
  background: string | null;
  loopEnabled: boolean;
  manifest: any;
  secondManifest: any;
  thumb: string | null;
  isHero: boolean;
};

// Combine clip A + clip B into one circular sequence (matches the player).
const combinedManifest = (it: Item) => {
  const a: string[] = Array.isArray(it.manifest?.frames) ? it.manifest.frames : [];
  const b: string[] = Array.isArray(it.secondManifest?.frames) ? it.secondManifest.frames : [];
  const frames = b.length ? [...a, ...b] : a;
  return { frameCount: frames.length, frames, defaultFrame: 0 };
};

function Poster({ it, onOpen, big }: { it: Item; onOpen: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`dl-card ${big ? "dl-card-big" : ""}`}
      style={it.background ? { ["--card-bg" as any]: it.background } : undefined}
    >
      <div className="dl-card-art">
        {it.thumb ? <img src={it.thumb} alt={it.name} loading="lazy" /> : <div className="dl-card-empty" />}
        <span className="dl-card-glow" aria-hidden />
        <span className="dl-card-play" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
          </svg>
          interact
        </span>
      </div>
      <div className="dl-card-meta">
        <span className="dl-card-name">{it.name}</span>
        {it.brandName && <span className="dl-card-brand">{it.brandName}</span>}
      </div>
    </button>
  );
}

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
          brandName="Drift Link"
          productName={item.name}
          title={item.title}
          titleEnd={item.titleEnd}
          description={item.description}
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

export default function DriftLanding() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Item | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftPublicLanding()
      .then((r) => alive && setItems(r.data.items || []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const hero = items.find((i) => i.isHero) || items[0] || null;
  const rest = items.filter((i) => i !== hero);

  return (
    <div className="dl-root">
      <style>{CSS}</style>
      <div className="dl-aurora" aria-hidden />

      <header className="dl-header">
        <div className="dl-word">
          Drift Link<span>&nbsp;Interactive</span>
        </div>
        <button className="dl-login" onClick={() => setShowLogin(true)}>
          Log in
        </button>
      </header>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />

      {/* Hero */}
      <section className="dl-hero">
        <div className="dl-hero-copy">
          <div className="dl-eyebrow">Motion you can hold</div>
          <h1 className="dl-title">
            Drag anything <em>to life.</em>
          </h1>
          <p className="dl-sub">
            Real footage, turned into an interactive path you scrub with a finger. Explore a drift below.
          </p>
          {hero && (
            <button className="dl-cta" onClick={() => setActive(hero)}>
              Explore the drift
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
            </button>
          )}
        </div>
        <div className="dl-hero-art">
          {hero ? (
            <Poster it={hero} onOpen={() => setActive(hero)} big />
          ) : (
            <div className="dl-hero-placeholder">
              {loading ? "Loading…" : "Nothing showcased yet."}
            </div>
          )}
        </div>
      </section>

      {/* Grid */}
      {rest.length > 0 && (
        <section className="dl-grid-wrap">
          <div className="dl-grid-head">
            <h2>Explore</h2>
            <span>{rest.length} drift{rest.length === 1 ? "" : "s"}</span>
          </div>
          <div className="dl-grid">
            {rest.map((it) => (
              <Poster key={it.itemId} it={it} onOpen={() => setActive(it)} />
            ))}
          </div>
        </section>
      )}

      <footer className="dl-footer">
        <div className="dl-word">
          Drift Link<span>&nbsp;Interactive</span>
        </div>
        <span>Interactive drift paths</span>
      </footer>

      {active && <PlayerModal item={active} onClose={() => setActive(null)} />}
    </div>
  );
}

const CSS = `
.dl-root{position:relative;min-height:100dvh;background:#05070d;color:#e9eef7;
  font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;overflow-x:hidden;isolation:isolate}
.dl-aurora{position:fixed;inset:-20% -10% auto -10%;height:80vh;z-index:-1;pointer-events:none;
  background:
    radial-gradient(40% 55% at 20% 10%, rgba(34,211,238,.16), transparent 70%),
    radial-gradient(45% 55% at 85% 0%, rgba(59,130,246,.18), transparent 70%),
    radial-gradient(50% 50% at 55% 30%, rgba(99,102,241,.10), transparent 70%);
  filter:blur(20px);animation:dlfloat 18s ease-in-out infinite alternate}
@keyframes dlfloat{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(0,3%,0) scale(1.08)}}

.dl-header{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:22px clamp(20px,5vw,56px)}
.dl-word{font-weight:800;font-size:21px;letter-spacing:-.02em;color:#fff}
.dl-word span{background:linear-gradient(135deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-tag{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7387a1}
.dl-login{padding:9px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);color:#e9eef7;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.dl-login:hover{background:rgba(34,211,238,.12);border-color:rgba(34,211,238,.5);color:#fff}

/* Hero: asymmetric, text never overlaps the art */
.dl-hero{position:relative;z-index:1;display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(24px,4vw,64px);
  align-items:center;padding:clamp(24px,5vw,60px) clamp(20px,5vw,56px) clamp(30px,4vw,50px);max-width:1320px;margin:0 auto}
.dl-eyebrow{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${DRIFT_PRIMARY};margin-bottom:18px}
.dl-title{margin:0;font-size:clamp(38px,5.6vw,72px);line-height:1.02;font-weight:800;letter-spacing:-.03em;color:#fff}
.dl-title em{font-style:normal;background:linear-gradient(120deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});-webkit-background-clip:text;background-clip:text;color:transparent}
.dl-sub{margin:20px 0 0;font-size:clamp(15px,1.5vw,18px);line-height:1.6;color:#9db0c8;max-width:46ch}
.dl-cta{margin-top:30px;display:inline-flex;align-items:center;gap:10px;padding:13px 22px;border-radius:999px;border:none;cursor:pointer;
  font-family:inherit;font-weight:700;font-size:14px;color:#04121a;background:linear-gradient(120deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});
  box-shadow:0 14px 40px -12px rgba(34,211,238,.6);transition:transform .2s,box-shadow .2s}
.dl-cta:hover{transform:translateY(-2px);box-shadow:0 20px 50px -14px rgba(34,211,238,.75)}
.dl-cta svg{width:18px;height:18px}
.dl-hero-art{min-width:0}
.dl-hero-placeholder{aspect-ratio:4/3;display:grid;place-items:center;border-radius:22px;border:1px dashed rgba(255,255,255,.12);color:#5f7089;font-size:13px}

/* Cards */
.dl-card{display:block;width:100%;text-align:left;padding:0;border:0;background:transparent;cursor:pointer;font-family:inherit;color:inherit}
.dl-card-art{position:relative;aspect-ratio:4/3;border-radius:18px;overflow:hidden;
  background:var(--card-bg, linear-gradient(180deg,#0c1728,#070c16));border:1px solid rgba(255,255,255,.08);
  transition:transform .35s cubic-bezier(.2,.7,.2,1),border-color .35s,box-shadow .35s}
.dl-card-big .dl-card-art{aspect-ratio:16/11;border-radius:24px}
.dl-card-art img{width:100%;height:100%;object-fit:contain;padding:6%;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.dl-card-empty{width:100%;height:100%}
.dl-card-glow{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;
  background:radial-gradient(60% 60% at 50% 45%, rgba(34,211,238,.16), transparent 70%)}
.dl-card-play{position:absolute;left:14px;bottom:14px;display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:999px;
  font-size:12px;font-weight:700;letter-spacing:.02em;color:#eafcff;background:rgba(8,14,24,.6);border:1px solid rgba(255,255,255,.14);
  backdrop-filter:blur(8px);opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s}
.dl-card-play svg{width:15px;height:15px;color:${DRIFT_PRIMARY}}
.dl-card:hover .dl-card-art{transform:translateY(-5px);border-color:rgba(34,211,238,.45);box-shadow:0 30px 70px -34px rgba(34,211,238,.6)}
.dl-card:hover .dl-card-art img{transform:scale(1.04)}
.dl-card:hover .dl-card-glow{opacity:1}
.dl-card:hover .dl-card-play{opacity:1;transform:none}
.dl-card-meta{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:13px 4px 4px}
.dl-card-name{font-weight:600;font-size:15px;color:#eaf1fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl-card-brand{font-size:12px;color:#7286a0;white-space:nowrap}

/* Grid */
.dl-grid-wrap{position:relative;z-index:1;padding:clamp(20px,3vw,40px) clamp(20px,5vw,56px) 60px;max-width:1320px;margin:0 auto}
.dl-grid-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07)}
.dl-grid-head h2{margin:0;font-size:15px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#cdd8e8}
.dl-grid-head span{font-size:12px;color:#6c7f99}
.dl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:clamp(14px,1.6vw,22px)}

.dl-footer{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;
  padding:26px clamp(20px,5vw,56px);border-top:1px solid rgba(255,255,255,.06);color:#5f7089;font-size:12px;letter-spacing:.04em}
.dl-footer .dl-word{font-size:16px}

/* Modal player */
.dl-modal{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:clamp(14px,3vw,40px);
  background:rgba(3,6,12,.82);backdrop-filter:blur(10px);animation:dlfade .25s ease}
@keyframes dlfade{from{opacity:0}to{opacity:1}}
.dl-modal-stage{position:relative;width:min(1080px,94vw);height:min(78vh,760px);border-radius:22px;overflow:hidden;
  border:1px solid rgba(255,255,255,.12);box-shadow:0 50px 120px -40px rgba(0,0,0,.8)}
.dl-modal-viewer{height:100%!important}
.dl-modal-close{position:absolute;top:18px;right:20px;z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);
  background:rgba(10,16,26,.6);color:#e9eef7;font-size:26px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
.dl-modal-close:hover{background:rgba(30,40,55,.7)}
.dl-modal-cap{position:absolute;bottom:max(18px,3vh);left:0;right:0;text-align:center;color:#9db0c8;font-size:13px;letter-spacing:.02em}

@media (max-width:860px){
  .dl-hero{grid-template-columns:1fr;gap:26px}
  .dl-hero-art{order:-1}
}
`;
