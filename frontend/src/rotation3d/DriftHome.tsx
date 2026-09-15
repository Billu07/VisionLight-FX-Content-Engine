import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { prefetchDriftPath } from "./driftNav";
import { loadDriftPlayer } from "../routeChunks";
import PerspectiveGrid from "./PerspectiveGrid";
import { Arrow, DriftSiteShell, WaitlistDialog, useReducedMotion } from "./driftSite";

/**
 * drift.li — the home, in the client's words (TOUR_V2_PLAN.md §6). "You Control the
 * Movement": beside the headline, drift.li's demo tour stands on a perspective grid —
 * its stops as free-standing cards, the centre one forward (out of the screen) stepping
 * through the tour over an orbit (visual only; "Take a Tour" starts it). Below: Tour
 * (available now) and View · Memory · Path (coming soon, each with a wait list), then
 * one closing call. On the drift design tokens — the glow is dark-theme only, light
 * stays flat. Header, footer and the wait-list dialog come from driftSite (shared with
 * the /view, /memory and /path landings).
 */

type Product = {
  key: "TOUR" | "VIEW" | "MEMORY" | "PATH";
  name: string;
  title: string;
  body: string[];
  tags?: string;
  note?: string;
  live?: boolean;
  icon: string[];
};

const PRODUCTS: Product[] = [
  {
    key: "TOUR",
    name: "Tour",
    title: "Show Any Space",
    body: ["Turn a 3-second video into a Live Interactive Tour.", "No 360 equipment. No complicated software."],
    tags: "Real Estate · Venues · Any Location",
    live: true,
    icon: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M16.2 7.8l-6.1 2.4 2.6 1.1 1.1 2.6z"],
  },
  {
    key: "VIEW",
    name: "View",
    title: "Share What You See",
    body: ["Turn a few seconds of a real place or moment into an Interactive View."],
    tags: "Sunsets · Cities · Cafés · Nature · Events",
    note: "See the world through someone else's eyes.",
    icon: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  },
  {
    key: "MEMORY",
    name: "Memory",
    title: "Keep the Moments That Matter",
    body: ["Turn a few seconds of life into something you can return to and explore."],
    tags: "Family · Friends · Places · Milestones · Everyday Life",
    note: "Private. Yours to remember.",
    icon: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"],
  },
  {
    key: "PATH",
    name: "Path",
    title: "Connect the Experience",
    body: ["Connect Drifts, images, video, information and links into an Interactive Path."],
    note: "Tell a story. Explain a process. Guide someone step by step.",
    icon: [
      "M6 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
      "M18 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
      "M6 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
      "M6 8.5v7",
      "M18 8.5c0 4-4 5-9.8 7.4",
    ],
  },
];

const STYLES = `
/* ── Hero ── */
.dh-hero{display:grid;gap:clamp(34px,6vw,56px);align-items:center;padding:clamp(34px,6vw,80px) 0 clamp(28px,4vw,52px)}
@media(min-width:1024px){.dh-hero{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:44px}}
.dh-kicker{display:inline-flex;align-items:center;gap:14px;font-size:12.5px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent)}
.dh-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.dh-h1{margin:22px 0 0;font-size:clamp(44px,7.4vw,106px);line-height:.94;letter-spacing:-.045em;font-weight:800;color:var(--text)}
.dh-h1 .ln{display:block}
/* Desktop: exactly two lines — the size follows the column so neither line wraps. */
@media(min-width:1024px){.dh-h1{font-size:clamp(52px,5.1vw,80px)}.dh-h1 .ln{white-space:nowrap}}
.dh-h1 em{font-style:normal;color:var(--accent)}
.drift-ui[data-theme="dark"] .dh-h1 em{background:linear-gradient(90deg,#22d3ee 0%,#38bdf8 48%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.dh-lead{margin:24px 0 0;font-size:clamp(18px,2.1vw,24px);line-height:1.45;color:var(--muted);max-width:30ch}
.dh-kinds{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;margin-top:26px;font-size:15.5px;font-weight:650;letter-spacing:.05em;color:var(--muted)}
.dh-kinds i{font-style:normal;color:var(--faint)}
.dh-go{display:inline-flex;align-items:center;gap:12px;margin-top:32px;padding:17px 30px;border-radius:999px;font-size:16px;font-weight:700;text-decoration:none}
.dh-go svg,.dh-pill svg{transition:transform .2s}
.dh-go:hover svg,.dh-pill:hover svg{transform:translateX(3px)}

/* ── Live view: the tour's cards standing on the grid surface ── */
.dh-visual{position:relative;min-width:0;aspect-ratio:16/11;isolation:isolate}
.dh-horizon{position:absolute;left:-10%;right:-10%;top:63%;height:1px;z-index:0;pointer-events:none;background:var(--accent-border)}
.drift-ui[data-theme="dark"] .dh-horizon{background:rgba(56,189,248,.55);box-shadow:0 0 18px 1px rgba(34,211,238,.55)}
.dh-grid{position:absolute;left:-14%;right:-14%;top:63%;bottom:-6%;z-index:0;pointer-events:none;overflow:hidden;color:var(--accent);opacity:.16;
  -webkit-mask-image:radial-gradient(ellipse 70% 120% at 50% 0%,#000 45%,transparent 100%);mask-image:radial-gradient(ellipse 70% 120% at 50% 0%,#000 45%,transparent 100%)}
.drift-ui[data-theme="dark"] .dh-grid{opacity:.28}
/* dark only: a soft pool of light on the floor under the centre card */
.drift-ui[data-theme="dark"] .dh-visual::before{content:"";position:absolute;left:16%;right:16%;top:56%;height:34%;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse at 50% 40%,rgba(34,211,238,.18),transparent 70%)}

.dh-scene{position:absolute;inset:0;z-index:2;perspective:1100px;perspective-origin:50% 60%}
.dh-card3d{position:absolute}
.dh-card3d-in{position:relative;width:100%;height:100%;overflow:hidden;border-radius:10px;background:var(--surface-3);
  border:1px solid var(--border-strong);box-shadow:var(--shadow);animation:dh-bob 7s ease-in-out infinite;will-change:transform;
  -webkit-box-reflect:below 3px linear-gradient(transparent 64%,rgba(255,255,255,.12))}
.drift-ui[data-theme="dark"] .dh-card3d-in{border-color:rgba(125,211,252,.3);
  box-shadow:0 0 0 1px rgba(34,211,238,.10),0 34px 60px -30px rgba(0,0,0,.9),0 0 46px -18px rgba(34,211,238,.45)}
.dh-card3d-in img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}
.dh-card3d.empty .dh-card3d-in{background:var(--surface-2)}
@keyframes dh-bob{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-8px,0)}}

/* Upright cards, no tilt: depth comes from distance alone — the back row smaller,
   fainter and closer to the horizon; the centre card stands forward, out of the screen. */
.dh-card3d.l2{left:-2%;width:16%;aspect-ratio:3/4.4;bottom:34%;transform:translateZ(-90px);opacity:.55}
.dh-card3d.l1{left:9%;width:21%;aspect-ratio:3/4.2;bottom:29%;transform:translateZ(-30px);opacity:.86}
.dh-card3d.r1{left:70%;width:21%;aspect-ratio:3/4.2;bottom:29%;transform:translateZ(-30px);opacity:.86}
.dh-card3d.r2{left:86%;width:16%;aspect-ratio:3/4.4;bottom:34%;transform:translateZ(-90px);opacity:.55}
.dh-card3d.c{left:23%;width:54%;aspect-ratio:16/10.4;bottom:20%;z-index:3;transform:translateZ(70px)}
.dh-card3d.l1 .dh-card3d-in,.dh-card3d.r1 .dh-card3d-in{animation-delay:-2.3s}
.dh-card3d.l2 .dh-card3d-in,.dh-card3d.r2 .dh-card3d-in{animation-delay:-4.6s}
.dh-card3d.c .dh-card3d-in{border-radius:14px}
.dh-card3d.c img{opacity:0;transition:opacity 1.1s ease;animation:dh-drift 18s ease-in-out infinite alternate;will-change:transform,opacity}
.dh-card3d.c img.on{opacity:1}
@keyframes dh-drift{from{transform:scale(1.04) translate3d(-2%,0,0)}to{transform:scale(1.14) translate3d(2.5%,-1%,0)}}

/* The centre card's shadow on the floor breathes with its float. */
.dh-shadow{position:absolute;left:30%;width:40%;bottom:14%;height:6%;z-index:1;border-radius:50%;background:rgba(0,0,0,.45);filter:blur(16px);
  pointer-events:none;animation:dh-shadow 7s ease-in-out infinite}
.drift-ui[data-theme="light"] .dh-shadow{background:rgba(15,23,42,.22)}
@keyframes dh-shadow{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.88);opacity:.7}}

/* An orbit ring around the centre card's base — its far half passes behind the card. */
.dh-orbit{position:absolute;left:18%;width:64%;bottom:9%;height:22%;z-index:1;overflow:visible;pointer-events:none}
.dh-orbit ellipse{fill:none;stroke:var(--accent);stroke-width:1.6;opacity:.8}
.dh-orbit .dot{fill:var(--accent)}
.dh-orbit .halo{fill:var(--accent);opacity:.22}
.drift-ui[data-theme="dark"] .dh-orbit{filter:drop-shadow(0 0 6px rgba(34,211,238,.75))}

.dh-chip{position:absolute;z-index:6;display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:12px;
  font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;line-height:1;color:var(--text);
  background:color-mix(in srgb,var(--surface) 80%,transparent);border:1px solid var(--border);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.dh-chip-live{top:3%;left:0}
.dh-chip-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.dh-chip-explore{top:3%;right:0;border-radius:999px;color:var(--accent);border-color:var(--accent-border);text-decoration:none;transition:background .16s}
a.dh-chip-explore:hover{background:var(--accent-soft)}
.dh-chip-meta{left:0;bottom:1%;display:grid;gap:4px;border-radius:10px;padding:9px 12px;
  font-size:11.5px;font-weight:600;letter-spacing:.02em;text-transform:none;color:var(--muted);max-width:44%}
.dh-chip-meta b{color:var(--text);font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dh-chip-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

@media(max-width:560px){
  .dh-visual{aspect-ratio:16/12}
  .dh-chip{font-size:9.5px;letter-spacing:.12em;padding:6px 10px}
  .dh-chip-meta{display:none}
  .dh-card3d.l2,.dh-card3d.r2{display:none}
  .dh-card3d.l1{left:0;width:24%}
  .dh-card3d.r1{left:76%;width:24%}
  .dh-card3d.c{left:17%;width:66%}
}

/* ── Products ── */
.dh-section{margin-top:clamp(28px,5vw,56px)}
.dh-products{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
@media(min-width:1140px){.dh-products{grid-template-columns:repeat(4,minmax(0,1fr))}}
.dh-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:26px 24px 24px;border-radius:22px;
  border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm);transition:border-color .2s,transform .2s,box-shadow .2s}
.dh-card:hover{border-color:var(--border-strong);transform:translateY(-2px)}
.drift-ui[data-theme="dark"] .dh-card{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.17)}
.drift-ui[data-theme="dark"] .dh-card:hover{border-color:rgba(56,189,248,.36);box-shadow:0 0 44px -22px rgba(34,211,238,.45)}
.dh-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
.dh-ico{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;flex:none;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border)}
.dh-name{font-size:13px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.dh-card h3{margin:0;font-size:clamp(21px,1.9vw,25px);line-height:1.15;letter-spacing:-.015em;font-weight:750;color:var(--text)}
.dh-card p{margin:0;font-size:14.5px;line-height:1.5;color:var(--muted)}
.dh-card .dh-meta{font-size:12.5px;line-height:1.45;color:var(--faint)}
.dh-status{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;white-space:nowrap;
  font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border)}
.dh-status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.dh-status.on{color:var(--ok);background:var(--ok-soft);border-color:var(--ok-border)}
.dh-card-cta{margin-top:auto;padding-top:14px;display:flex;flex-wrap:wrap;gap:8px}
.dh-pill{display:inline-flex;align-items:center;gap:10px;padding:12px 20px;border-radius:999px;font-size:14.5px;font-weight:700;text-decoration:none}
.dh-pill.outline{background:transparent;border:1px solid var(--accent-border);color:var(--accent)}
.dh-pill.outline:hover{background:var(--accent-soft);border-color:var(--accent-border)}

/* ── Closing call ── */
.dh-close{display:grid;justify-items:center;text-align:center;gap:8px;margin-top:clamp(44px,8vw,96px);padding:clamp(44px,7vw,80px) 20px;
  border-radius:30px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
.drift-ui[data-theme="dark"] .dh-close{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.2);box-shadow:0 0 70px -34px rgba(34,211,238,.45)}
.dh-close .dh-kinds{justify-content:center;margin-top:14px}
.dh-h2{margin:0;font-size:clamp(30px,4.6vw,48px);line-height:1.05;letter-spacing:-.035em;font-weight:800;color:var(--text)}

@media(prefers-reduced-motion:reduce){.dh-card3d-in,.dh-card3d.c img,.dh-shadow{animation:none}.dh-card:hover{transform:none}}
`;

const Icon = ({ d }: { d: string[] }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

const Kinds = () => (
  <div className="dh-kinds" aria-label="Tour, View, Memory, Path">
    <span>Tour</span>
    <i>·</i>
    <span>View</span>
    <i>·</i>
    <span>Memory</span>
    <i>·</i>
    <span>Path</span>
  </div>
);

// The centre panel steps through the tour's first few stops (images the side panels
// already load, so the cycle costs no extra downloads).
const CYCLE_STOPS = 3;
const CYCLE_MS = 3800;

type Stop = { name: string; thumb: string };

/** The hero's "live view": drift.li's demo tour standing on the grid surface — its stops
 *  as free-standing cards, the centre one forward (out of the screen), floating over its
 *  shadow and stepping through the tour, with an orbit at its base. A picture of the
 *  product, not the player (visual only); "Take a Tour" starts it. */
function LiveView({ tour }: { tour: any }) {
  const reduceMotion = useReducedMotion();
  const stops = useMemo<Stop[]>(
    () =>
      (Array.isArray(tour?.steps) ? tour.steps : [])
        .filter((s: any) => s && s.thumb)
        .map((s: any) => ({ name: String(s.name || ""), thumb: String(s.thumb) })),
    [tour],
  );
  const n = stops.length;
  const cycle = Math.min(n, CYCLE_STOPS);
  const [at, setAt] = useState(0);

  useEffect(() => {
    setAt(0);
    if (reduceMotion || cycle < 2) return;
    const t = window.setInterval(() => {
      if (!document.hidden) setAt((i) => (i + 1) % cycle);
    }, CYCLE_MS);
    return () => window.clearInterval(t);
  }, [reduceMotion, cycle]);

  // Side cards: the next stops on the right, the last stops on the left (a tour loops).
  const sideStop = (offset: number): Stop | null => (n ? stops[((offset % n) + n) % n] : null);
  const sides = [
    { cls: "l2", stop: sideStop(-2) },
    { cls: "l1", stop: sideStop(-1) },
    { cls: "r1", stop: sideStop(1) },
    { cls: "r2", stop: sideStop(2) },
  ];
  const current = n ? stops[Math.min(at, n - 1)] : null;
  const startPath: string | null = tour?.entryPath || tour?.publicPath || null;
  // Opening the tour should be instant: fetch drift #1 and the player's code on intent.
  const warm = () => {
    if (!startPath) return;
    prefetchDriftPath(startPath);
    loadDriftPlayer().catch(() => undefined);
  };

  return (
    <div className="dh-visual">
      <div className="dh-horizon" aria-hidden />
      <div className="dh-grid" aria-hidden>
        <PerspectiveGrid />
      </div>
      <div className="dh-shadow" aria-hidden />
      <svg className="dh-orbit" viewBox="0 0 400 100" aria-hidden>
        <ellipse cx="200" cy="50" rx="185" ry="30" />
        {reduceMotion ? (
          <g transform="translate(15 50)">
            <circle className="halo" r="13" />
            <circle className="dot" r="5.5" />
          </g>
        ) : (
          <g>
            <circle className="halo" r="13" />
            <circle className="dot" r="5.5" />
            <animateMotion dur="7s" repeatCount="indefinite" path="M15,50 a185,30 0 1,0 370,0 a185,30 0 1,0 -370,0" />
          </g>
        )}
      </svg>

      <div className="dh-scene" aria-hidden>
        {sides.map((p) => (
          <div key={p.cls} className={`dh-card3d ${p.cls} ${p.stop ? "" : "empty"}`}>
            <div className="dh-card3d-in">
              {p.stop ? <img src={p.stop.thumb} alt="" decoding="async" loading="lazy" fetchPriority="low" /> : null}
            </div>
          </div>
        ))}
        <div className={`dh-card3d c ${n ? "" : "empty"}`}>
          <div className="dh-card3d-in">
            {stops.slice(0, Math.max(cycle, 0)).map((s, i) => (
              <img
                key={`${i}-${s.thumb}`}
                src={s.thumb}
                alt=""
                decoding="async"
                fetchPriority={i === 0 ? "high" : "low"}
                className={i === at ? "on" : ""}
              />
            ))}
          </div>
        </div>
      </div>

      <span className="dh-chip dh-chip-live">Drift / Live View</span>
      {startPath ? (
        <Link className="dh-chip dh-chip-explore" to={startPath} onPointerEnter={warm} onTouchStart={warm} onFocus={warm}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          </svg>
          Take a Tour
        </Link>
      ) : null}
      {tour && current ? (
        <span className="dh-chip dh-chip-meta" aria-hidden>
          <b>{tour.title || tour.name}</b>
          <span>{current.name}</span>
        </span>
      ) : null}
    </div>
  );
}

export default function DriftHome() {
  const [waitFor, setWaitFor] = useState<Product | null>(null);
  const [tour, setTour] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    // drift.li's demo tour (Admin → drift.li → Tour → Demo tour) fills the live view.
    apiEndpoints
      .driftPublicFlow("tour", "demo")
      .then((r) => alive && setTour(r.data?.flow || null))
      .catch(() => alive && setTour(null));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <DriftSiteShell className="dh">
      <style>{STYLES}</style>

        <section className="dh-hero t-rise">
          <div style={{ minWidth: 0 }}>
            <div className="dh-kicker">Drift Live Interactive</div>
            <h1 className="dh-h1">
              <span className="ln">You Control</span>{" "}
              <span className="ln">
                the <em>Movement.</em>
              </span>
            </h1>
            <p className="dh-lead">Turn a few seconds of video into a Live Interactive you can explore.</p>
            <Kinds />
            <Link className="d-btn primary dh-go" to="/tour">
              Explore Drift Tour
              <Arrow />
            </Link>
          </div>
          <LiveView tour={tour} />
        </section>

        <section className="dh-section" aria-label="Tour, View, Memory and Path">
          <div className="dh-products">
            {PRODUCTS.map((p) => (
              <article key={p.key} className={`dh-card ${p.live ? "live" : ""}`}>
                <div className="dh-card-top">
                  <div className="dh-ico">
                    <Icon d={p.icon} />
                  </div>
                  <span className={`dh-status ${p.live ? "on" : ""}`}>{p.live ? "Available Now" : "Coming Soon"}</span>
                </div>
                <div className="dh-name">{p.name}</div>
                <h3>{p.title}</h3>
                {p.body.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {p.tags && <p className="dh-meta">{p.tags}</p>}
                {p.note && <p className="dh-meta">{p.note}</p>}
                <div className="dh-card-cta">
                  {p.live ? (
                    <>
                      <Link className="d-btn primary dh-pill" to="/tour/start">
                        Try it Free
                        <Arrow size={16} />
                      </Link>
                      <Link className="d-btn dh-pill outline" to="/tour">
                        Learn More
                      </Link>
                    </>
                  ) : (
                    <button type="button" className="d-btn dh-pill outline" onClick={() => setWaitFor(p)}>
                      Join Wait List
                      <Arrow size={16} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="dh-close">
          <h2 className="dh-h2">A New Way to Explore</h2>
          <Kinds />
          <Link className="d-btn primary dh-go" to="/tour/start">
            Try Drift Tour
            <Arrow />
          </Link>
        </section>

      {waitFor && <WaitlistDialog product={waitFor} source="home" onClose={() => setWaitFor(null)} />}
    </DriftSiteShell>
  );
}
