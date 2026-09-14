import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { LoginModal } from "../components/LoginModal";
import { DriftThemeStyles, ThemeToggle, useDriftTheme } from "./driftUiTheme";
import { TOUR_STYLES } from "../tour/tourUi";
import { combinedFrameSets } from "./driftNav";

/**
 * drift.li — the home, in the client's words (TOUR_V2_PLAN.md §6). "You Control the
 * Movement": beside the headline sits a glass "live view" of the superadmin's landing
 * drift — a few of its frames laid out in perspective, drifting slowly, with an orbit
 * and a horizon (visual only; "Drag to explore" opens the live drift). Below: Tour
 * (available now) and View · Memory · Path (coming soon, each with a wait list), then
 * one closing call. On the drift design tokens — the glow is dark-theme only, light
 * stays flat. Login top right; signed in, it becomes Dashboard.
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
.dh{position:relative;isolation:isolate;background:var(--bg);color:var(--text);overflow-x:hidden}
/* Dark only: a faint glow behind the hero (light mode stays flat paper). */
.drift-ui[data-theme="dark"].dh::before{content:"";position:absolute;inset:0 0 auto 0;height:900px;z-index:-1;pointer-events:none;background:
  radial-gradient(40% 50% at 78% 30%, rgba(34,211,238,.10), transparent 70%),
  radial-gradient(34% 40% at 12% 12%, rgba(139,92,246,.07), transparent 70%)}

.dh-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,4vw,48px);background:color-mix(in srgb,var(--bg) 84%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.dh-logo{display:flex;align-items:center;gap:18px;text-decoration:none;min-width:0}
.dh-logo .d-wordmark{font-size:24px}
.dh-logo-sub{font-size:11.5px;font-weight:650;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
@media(max-width:520px){.dh-logo-sub{display:none}}
.dh-top-actions{display:flex;align-items:center;gap:10px}
.dh-top-actions .d-icon-btn{border-radius:12px}
.dh-top-actions .d-btn{border-radius:999px;padding:9px 18px;font-size:13px}
.dh-main{max-width:1280px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}

/* ── Hero ── */
.dh-hero{display:grid;gap:clamp(34px,6vw,56px);align-items:center;padding:clamp(34px,6vw,80px) 0 clamp(28px,4vw,52px)}
@media(min-width:1024px){.dh-hero{grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:44px}}
.dh-kicker{display:inline-flex;align-items:center;gap:14px;font-size:12.5px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent)}
.dh-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.dh-h1{margin:22px 0 0;font-size:clamp(50px,7.4vw,106px);line-height:.94;letter-spacing:-.045em;font-weight:800;color:var(--text)}
.dh-h1 em{font-style:normal;color:var(--accent)}
.drift-ui[data-theme="dark"] .dh-h1 em{background:linear-gradient(90deg,#22d3ee 0%,#38bdf8 48%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.dh-lead{margin:24px 0 0;font-size:clamp(18px,2.1vw,24px);line-height:1.45;color:var(--muted);max-width:30ch}
.dh-kinds{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;margin-top:26px;font-size:15.5px;font-weight:650;letter-spacing:.05em;color:var(--muted)}
.dh-kinds i{font-style:normal;color:var(--faint)}
.dh-go{display:inline-flex;align-items:center;gap:12px;margin-top:32px;padding:17px 30px;border-radius:999px;font-size:16px;font-weight:700;text-decoration:none}
.dh-go svg,.dh-pill svg{transition:transform .2s}
.dh-go:hover svg,.dh-pill:hover svg{transform:translateX(3px)}

/* ── Live view visual ── */
.dh-visual{position:relative;min-width:0;padding:6px 0 34px}
.dh-horizon{position:absolute;left:-14%;right:-8%;top:57%;height:1px;z-index:0;pointer-events:none;background:var(--accent-border)}
.drift-ui[data-theme="dark"] .dh-horizon{background:rgba(56,189,248,.55);box-shadow:0 0 16px 1px rgba(34,211,238,.55)}
.dh-grid{position:absolute;left:-12%;right:-12%;bottom:0;height:44%;z-index:0;pointer-events:none;overflow:hidden;color:var(--accent);opacity:.14;
  -webkit-mask-image:linear-gradient(to bottom,transparent,#000 45%);mask-image:linear-gradient(to bottom,transparent,#000 45%)}
.drift-ui[data-theme="dark"] .dh-grid{opacity:.22}
.dh-grid svg{display:block;width:100%;height:100%}
.dh-grid line{stroke:currentColor;stroke-width:1;vector-effect:non-scaling-stroke}

.dh-frame{position:relative;z-index:1;margin:0;aspect-ratio:16/10.6;border-radius:28px;overflow:hidden;isolation:isolate;
  border:1px solid var(--border-strong);background:var(--surface);box-shadow:var(--shadow);animation:dh-float 11s ease-in-out infinite}
.drift-ui[data-theme="dark"] .dh-frame{border-color:rgba(56,189,248,.5);background:rgba(8,14,27,.62);
  box-shadow:inset 0 0 0 1px rgba(34,211,238,.10),0 0 80px -22px rgba(34,211,238,.55),0 40px 90px -40px rgba(0,0,0,.85)}
@keyframes dh-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-7px,0)}}

.dh-chip{position:absolute;z-index:6;display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:12px;
  font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;line-height:1;color:var(--text);
  background:color-mix(in srgb,var(--surface) 80%,transparent);border:1px solid var(--border);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.dh-chip-live{top:18px;left:18px}
.dh-chip-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.dh-chip-explore{top:18px;right:18px;border-radius:999px;color:var(--accent);border-color:var(--accent-border);text-decoration:none;transition:background .16s}
a.dh-chip-explore:hover{background:var(--accent-soft)}
.dh-chip-meta{left:18px;bottom:18px;display:grid;gap:4px;border-radius:10px;padding:9px 12px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:none;color:var(--muted)}

.dh-strip{position:absolute;inset:0;z-index:1;perspective:1100px;perspective-origin:50% 46%}
.dh-panel{position:absolute;top:52%;overflow:hidden;border-radius:6px;background:var(--surface-3);
  border:1px solid color-mix(in srgb,var(--text) 14%,transparent);box-shadow:0 22px 44px -22px rgba(0,0,0,.55)}
.dh-panel img{display:block;width:100%;height:100%;object-fit:cover}
.dh-panel.l2{left:3%;width:13%;height:56%;transform:translateY(-50%) rotateY(56deg);opacity:.5}
.dh-panel.l1{left:11%;width:15%;height:66%;transform:translateY(-50%) rotateY(46deg);opacity:.8}
.dh-panel.c{left:24%;width:52%;height:74%;z-index:2;transform:translateY(-50%) rotateY(-9deg)}
.dh-panel.r1{left:74%;width:15%;height:66%;transform:translateY(-50%) rotateY(-46deg);opacity:.8}
.dh-panel.r2{left:84%;width:13%;height:56%;transform:translateY(-50%) rotateY(-56deg);opacity:.5}
.dh-panel.c img{animation:dh-drift 18s ease-in-out infinite alternate;will-change:transform}
@keyframes dh-drift{from{transform:scale(1.04) translate3d(-2%,0,0)}to{transform:scale(1.14) translate3d(2.5%,-1%,0)}}
.dh-panel.empty{background:var(--surface-2)}

.dh-orbit{position:absolute;left:31%;width:52%;top:55%;height:18%;z-index:3;overflow:visible;pointer-events:none}
.dh-orbit ellipse{fill:none;stroke:var(--accent);stroke-width:1.6;opacity:.75}
.dh-orbit .dot{fill:var(--accent)}
.dh-orbit .halo{fill:var(--accent);opacity:.22}
.drift-ui[data-theme="dark"] .dh-orbit{filter:drop-shadow(0 0 6px rgba(34,211,238,.75))}

@media(max-width:560px){
  .dh-chip{font-size:9.5px;letter-spacing:.12em;padding:6px 10px}
  .dh-chip-live{top:12px;left:12px}.dh-chip-explore{top:12px;right:12px}
  .dh-chip-meta{display:none}
  .dh-frame{border-radius:20px}
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

.dh-foot{display:grid;justify-items:center;gap:10px;margin-top:clamp(40px,7vw,80px);padding:30px 16px calc(34px + env(safe-area-inset-bottom));border-top:1px solid var(--border);text-align:center}
.dh-foot-brand{display:flex;align-items:baseline;gap:10px}
.dh-foot-brand span{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.dh-foot nav{display:flex;gap:10px;font-size:13px;color:var(--faint)}
.dh-foot nav a{color:var(--muted);text-decoration:none}
.dh-foot nav a:hover{color:var(--accent)}
.dh-foot p{margin:0;font-size:12.5px;color:var(--faint)}

.dh-modal{position:fixed;inset:0;z-index:60;display:grid;place-items:end center;background:rgba(4,8,16,.6);backdrop-filter:blur(6px)}
@media(min-width:640px){.dh-modal{place-items:center;padding:20px}}
.dh-modal-card{position:relative;width:100%;max-width:440px;display:grid;gap:12px;padding:26px 22px calc(24px + env(safe-area-inset-bottom));background:var(--surface);border:1px solid var(--border-strong);border-radius:26px 26px 0 0;box-shadow:0 40px 80px -30px rgba(0,0,0,.7)}
@media(min-width:640px){.dh-modal-card{border-radius:26px;padding:28px}}
.dh-modal-card h3{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
.dh-modal-x{position:absolute;right:12px;top:12px}

@media(prefers-reduced-motion:reduce){.dh-frame,.dh-panel.c img{animation:none}.dh-card:hover{transform:none}}
`;

const Icon = ({ d }: { d: string[] }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

const Arrow = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
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

const useReducedMotion = () => {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduce;
};

const DIRECTION_LABEL: Record<string, string> = {
  LTR: "Left → right",
  RTL: "Right → left",
  TTB: "Top → bottom",
  BTT: "Bottom → top",
};

// Where along the drift each panel's frame comes from: two left, centre, two right.
const PANELS = [
  { cls: "l2", at: 0.08 },
  { cls: "l1", at: 0.27 },
  { cls: "c", at: 0.5 },
  { cls: "r1", at: 0.73 },
  { cls: "r2", at: 0.92 },
] as const;

// A perspective floor under the frame: rungs get closer toward the horizon.
const GRID_ROWS = [16, 42, 78, 128, 196];
const GRID_COLS = Array.from({ length: 17 }, (_, i) => -400 + i * 100);

/** The hero's "live view": five frames of the landing drift in perspective, drifting
 *  slowly under an orbit — a picture of the product, not the player (visual only). */
function LiveView({ hero }: { hero: any }) {
  const reduceMotion = useReducedMotion();
  const { panels, frameCount } = useMemo(() => {
    if (!hero) return { panels: [] as string[], frameCount: 0 };
    const { frames, framesMobile } = combinedFrameSets(hero);
    // The lighter set is plenty for panels this size.
    const list = framesMobile?.length ? framesMobile : frames;
    if (!list.length) return { panels: [] as string[], frameCount: 0 };
    return {
      panels: PANELS.map((p) => list[Math.min(list.length - 1, Math.round(p.at * (list.length - 1)))]),
      frameCount: frames.length,
    };
  }, [hero]);

  return (
    <div className="dh-visual">
      <div className="dh-horizon" aria-hidden />
      <div className="dh-grid" aria-hidden>
        <svg viewBox="0 0 800 200" preserveAspectRatio="none">
          {GRID_ROWS.map((y) => (
            <line key={`r${y}`} x1="0" y1={y} x2="800" y2={y} />
          ))}
          {GRID_COLS.map((x) => (
            <line key={`c${x}`} x1="400" y1="-170" x2={x} y2="200" />
          ))}
        </svg>
      </div>

      <figure className="dh-frame" aria-label="A drift, live">
        <span className="dh-chip dh-chip-live">Drift / Live View</span>
        {hero?.id ? (
          <Link className="dh-chip dh-chip-explore" to={`/p/${hero.id}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="7.5" />
              <circle cx="12" cy="12" r="2" />
              <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
            </svg>
            Drag to explore
          </Link>
        ) : null}

        <div className="dh-strip" aria-hidden>
          {PANELS.map((p, i) => (
            <div key={p.cls} className={`dh-panel ${p.cls} ${panels[i] ? "" : "empty"}`}>
              {panels[i] ? (
                <img
                  src={panels[i]}
                  alt=""
                  decoding="async"
                  loading={p.cls === "c" ? "eager" : "lazy"}
                  fetchPriority={p.cls === "c" ? "high" : "low"}
                />
              ) : null}
            </div>
          ))}
        </div>

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

        {frameCount > 0 && (
          <span className="dh-chip dh-chip-meta" aria-hidden>
            <span>{frameCount} frames</span>
            <span>{DIRECTION_LABEL[String(hero?.driftDirection || "LTR")] || DIRECTION_LABEL.LTR}</span>
          </span>
        )}
      </figure>
    </div>
  );
}

function WaitlistDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    setState("busy");
    setError("");
    try {
      await apiEndpoints.driftJoinWaitlist(to, product.key, "home");
      setState("done");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setState("idle");
    }
  };
  return (
    <div className="dh-modal" onClick={onClose} role="dialog" aria-modal aria-label={`Join the ${product.name} wait list`}>
      <div className="dh-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="d-x dh-modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        {state === "done" ? (
          <>
            <div className="d-eyebrow">{product.name}</div>
            <h3>You're on the list</h3>
            <p className="d-sub">We'll email {email.trim()} as soon as {product.name} opens.</p>
            <button className="d-btn primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <div className="d-eyebrow">{product.name} · Coming Soon</div>
            <h3>Join the Wait List</h3>
            <p className="d-sub">Be the first to know when {product.name} opens.</p>
            <input
              className="d-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {error && <div className="d-banner err">{error}</div>}
            <button className="d-btn primary" type="submit" disabled={state === "busy"} style={{ padding: "13px 18px", fontSize: 14.5 }}>
              {state === "busy" ? "Joining…" : "Join Wait List"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function DriftHome() {
  const [theme, toggleTheme] = useDriftTheme();
  const { user, profiles, profileSelectionRequired, checkAuth } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [waitFor, setWaitFor] = useState<Product | null>(null);
  const [hero, setHero] = useState<any>(null);

  useEffect(() => {
    checkAuth();
    let alive = true;
    // The superadmin's landing drift supplies the live view's frames.
    apiEndpoints
      .driftPublicLandingHero(null)
      .then((r) => alive && setHero(r.data?.product || null))
      .catch(() => alive && setHero(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = !!user || profileSelectionRequired;
  const hasTour = user?.view === "TOUR" || profiles.some((p) => p.view === "TOUR");
  const dashboardPath = hasTour ? "/tour" : profileSelectionRequired ? "/studios" : "/app";

  return (
    <div className="drift-ui d-page dh" data-theme={theme}>
      <DriftThemeStyles />
      <style>{TOUR_STYLES}</style>
      <style>{STYLES}</style>

      <header className="dh-top">
        <Link to="/" className="dh-logo">
          <span className="d-wordmark">
            drift<i>.li</i>
          </span>
          <span className="dh-logo-sub">Drift Live Interactive</span>
        </Link>
        <div className="dh-top-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {signedIn ? (
            <Link className="d-btn primary" to={dashboardPath} style={{ textDecoration: "none" }}>
              Dashboard
            </Link>
          ) : (
            <button className="d-btn" onClick={() => setShowLogin(true)}>
              Login
            </button>
          )}
        </div>
      </header>

      <main className="dh-main">
        <section className="dh-hero t-rise">
          <div style={{ minWidth: 0 }}>
            <div className="dh-kicker">Drift Live Interactive</div>
            <h1 className="dh-h1">
              You Control
              <br />
              the <em>Movement.</em>
            </h1>
            <p className="dh-lead">Turn a few seconds of video into a Live Interactive you can explore.</p>
            <Kinds />
            <Link className="d-btn primary dh-go" to="/tour">
              Explore Drift Tour
              <Arrow />
            </Link>
          </div>
          <LiveView hero={hero} />
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
      </main>

      <footer className="dh-foot">
        <div className="dh-foot-brand">
          <span className="d-wordmark">
            drift<i>.li</i>
          </span>
          <span>Drift Live Interactive</span>
        </div>
        <nav aria-label="Legal">
          <a href="/terms">Terms</a>
          <span aria-hidden>·</span>
          <a href="/privacy">Privacy</a>
        </nav>
        <p>Drift.li is a division of PicDrift</p>
      </footer>

      {waitFor && <WaitlistDialog product={waitFor} onClose={() => setWaitFor(null)} />}
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
