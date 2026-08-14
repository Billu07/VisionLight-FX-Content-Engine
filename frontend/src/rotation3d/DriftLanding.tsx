import { useEffect, useMemo, useState } from "react";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { LoginModal } from "../components/LoginModal";

/**
 * drift.li landing — crafted, premium SaaS feel (matches the picdrift studio
 * design language: layered gradient base, frosted header, gradient headlines,
 * pill CTAs, fanned preview cards, a 3D-tilted showcase panel). Content is the
 * curated drifts; clicking any opens a smooth full-screen interactive modal
 * built from the manifest already on the page (works for Drift + Rotation3D).
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

// A poster card — the building block used in the hero fan and the grid.
function Poster({ it, onOpen }: { it: Item; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.4rem] border border-white/10 bg-gradient-to-b from-[#0c1830] to-[#070c1a] shadow-[0_20px_50px_-24px_rgba(3,10,30,0.9)] transition-all duration-500 group-hover:-translate-y-1.5 group-hover:border-cyan-300/40 group-hover:shadow-[0_34px_70px_-28px_rgba(34,211,238,0.45)]">
        {it.thumb ? (
          <img src={it.thumb} alt={it.name} loading="lazy" className="h-full w-full object-contain p-[7%] transition-transform duration-700 group-hover:scale-[1.05]" />
        ) : (
          <div className="h-full w-full" />
        )}
        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(60% 60% at 50% 42%, rgba(34,211,238,0.16), transparent 70%)" }} />
        <span className="absolute left-3.5 top-3.5 rounded-full border border-white/15 bg-black/35 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/80 backdrop-blur-sm">
          {it.source === "ROTATION3D" ? "Rotation3D" : "Drift"}
        </span>
        <span className="absolute bottom-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-cyan-100 opacity-0 backdrop-blur-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100" style={{ transform: "translateY(6px)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={DRIFT_PRIMARY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          interact
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
        <span className="truncate text-[15px] font-semibold text-slate-100">{it.name}</span>
        {it.brandName && <span className="shrink-0 text-[11px] text-slate-500">{it.brandName}</span>}
      </div>
    </button>
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
  const fan = items.slice(0, 4);
  const fanRot = ["-9deg", "-3deg", "4deg", "10deg"];
  const fanX = ["0%", "24%", "48%", "70%"];
  const fanY = ["16%", "4%", "9%", "1%"];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#060a18] text-white" style={{ fontFamily: '"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif' }}>
      <style>{CSS}</style>

      {/* Layered gradient atmosphere */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(34,211,238,0.16),transparent_40%),radial-gradient(circle_at_84%_16%,rgba(59,130,246,0.28),transparent_44%),radial-gradient(circle_at_50%_62%,rgba(11,14,34,0.6),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[50%] bg-gradient-to-r from-[#04121f] via-[#0b1c48] to-[#0a2a52]" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[-160px] h-[66%] bg-gradient-to-r from-[#0e3a6b] via-[#2a5ad8] to-[#123a86] opacity-90"
        style={{ clipPath: "polygon(0 18%, 100% 0, 100% 100%, 0 100%)" }}
      />

      {/* Header */}
      <header className="relative z-20 border-b border-white/10 bg-[#0a1024]/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="text-[20px] font-extrabold tracking-tight text-white">
            Drift Link<span className="ml-1 bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Interactive</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-slate-400 sm:inline">Interactive drift paths</span>
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-full border border-white/30 bg-white/5 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Log in
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/[0.07] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
              Motion you can hold
            </div>
            <h1 className="text-4xl font-black leading-[1.03] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Drag anything
              <span className="mt-1 block bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-transparent">
                to life.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-300 sm:text-xl">
              Real footage turned into an interactive path you scrub with a finger — headlines, captions, and CTAs that move with the motion.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {hero && (
                <button
                  onClick={() => setActive(hero)}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-7 py-3 text-sm font-black text-[#04121a] shadow-[0_16px_40px_-14px_rgba(34,211,238,0.65)] transition hover:from-cyan-300 hover:to-blue-400"
                >
                  Explore the drift
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                </button>
              )}
              <button
                onClick={() => setShowLogin(true)}
                className="rounded-full border border-white/40 bg-white/5 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/12"
              >
                Log in
              </button>
            </div>
          </div>

          {/* Fanned preview cards */}
          <div className="relative h-[320px] sm:h-[380px] lg:h-[420px]">
            {fan.length > 0 ? (
              <div className="absolute inset-0 origin-top-left scale-[0.72] sm:scale-90 lg:scale-100">
                {fan.map((it, i) => (
                  <button
                    key={it.itemId}
                    type="button"
                    onClick={() => setActive(it)}
                    className="dl-fan group absolute h-[280px] w-[188px] overflow-hidden rounded-[1.6rem] border border-white/15 bg-gradient-to-b from-[#0d1b34] to-[#070d1e] p-2.5 shadow-[0_26px_50px_-18px_rgba(3,8,28,0.85)] transition-all duration-500 hover:z-10 hover:-translate-y-2 hover:border-cyan-300/45 sm:h-[310px] sm:w-[210px]"
                    style={{ left: fanX[i], top: fanY[i], transform: `rotate(${fanRot[i]})` }}
                  >
                    <div className="relative h-full w-full overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#060b16]">
                      {it.thumb ? (
                        <img src={it.thumb} alt={it.name} className="h-full w-full object-contain p-[9%]" loading={i === 0 ? "eager" : "lazy"} />
                      ) : null}
                      <span className="absolute left-2.5 top-2.5 rounded-full border border-white/20 bg-black/30 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white/85 backdrop-blur-sm">
                        {it.source === "ROTATION3D" ? "R3D" : "Drift"}
                      </span>
                      <span className="absolute inset-x-2.5 bottom-2.5 truncate rounded-lg bg-black/40 px-2 py-1 text-center text-[11px] font-bold text-white/90 backdrop-blur-sm">
                        {it.name}
                      </span>
                    </div>
                  </button>
                ))}
                {hero && (
                  <button
                    type="button"
                    onClick={() => setActive(hero)}
                    aria-label="Explore the hero drift"
                    className="absolute left-1/2 top-[38%] flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border border-white/30 bg-white/20 shadow-[0_12px_30px_rgba(5,10,35,0.55)] backdrop-blur-xl transition hover:scale-105 hover:bg-white/30 sm:h-20 sm:w-20"
                  >
                    <div className="ml-1 h-0 w-0 border-y-[11px] border-l-[17px] border-y-transparent border-l-white" />
                  </button>
                )}
              </div>
            ) : (
              <div className="grid h-full place-items-center rounded-[1.6rem] border border-dashed border-white/12 text-sm text-slate-500">
                {loading ? "Loading…" : "Nothing showcased yet."}
              </div>
            )}
          </div>
        </section>

        {/* Showcase grid in a 3D-tilted panel */}
        {rest.length > 0 && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
            <div className="dl-panel relative rounded-[2rem] border border-cyan-300/20 bg-[#070d24]/85 p-4 shadow-[0_28px_80px_-30px_rgba(8,14,42,0.7)] backdrop-blur-sm sm:p-7">
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-br from-cyan-300/[0.06] via-transparent to-blue-500/[0.1]" />
              <div className="relative rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-[#080c22] to-[#06081a] p-4 sm:p-6">
                <div className="mb-5 flex items-baseline justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">Explore drifts</h2>
                  <span className="text-xs text-slate-500">{rest.length} interactive</span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {rest.map((it) => (
                    <Poster key={it.itemId} it={it} onOpen={() => setActive(it)} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="relative z-10 border-t border-white/8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:px-6">
          <div className="text-[15px] font-extrabold tracking-tight text-slate-300">
            Drift Link<span className="ml-1 bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Interactive</span>
          </div>
          <span className="tracking-[0.06em]">Interactive drift paths · {"©"} 2026</span>
        </div>
      </footer>

      {active && <PlayerModal item={active} onClose={() => setActive(null)} />}
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}

const CSS = `
.dl-modal{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:clamp(14px,3vw,40px);background:rgba(3,6,12,.82);backdrop-filter:blur(10px);animation:dlfade .25s ease}
@keyframes dlfade{from{opacity:0}to{opacity:1}}
.dl-modal-stage{position:relative;width:min(1080px,94vw);height:min(78vh,760px);border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 50px 120px -40px rgba(0,0,0,.8)}
.dl-modal-viewer{height:100%!important}
.dl-modal-close{position:absolute;top:18px;right:20px;z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(10,16,26,.6);color:#e9eef7;font-size:26px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
.dl-modal-close:hover{background:rgba(30,40,55,.7)}
.dl-modal-cap{position:absolute;bottom:max(18px,3vh);left:0;right:0;text-align:center;color:#9db0c8;font-size:13px;letter-spacing:.02em}
`;
