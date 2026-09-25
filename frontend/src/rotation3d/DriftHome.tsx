import { useState } from "react";
import { Link } from "react-router-dom";
import { Arrow, DriftSiteShell, WaitlistDialog } from "./driftSite";
import { HomeScene, HOME_SCENE_STYLES } from "./DriftHomeScene";

/**
 * drift.li — the home, in the client's words (TOUR_V2_PLAN.md §6). "You Control the
 * Movement": the headline stands centred over one Drift on the shared grid floor, with all
 * four worlds passing through it as the playhead travels, and a picker under the rail for
 * anyone who would rather choose (DriftHomeScene; reworked 2026-09-26 from two columns, and
 * the "Take a Tour" chip over the scene went with it — the client asked for it gone, and the
 * page's own CTAs already lead into Tour). Below: Tour (available now) and View · Memory ·
 * Path (coming soon, each with a wait list), then one closing call. On the drift design
 * tokens — the glow is dark-theme only, light stays flat. Header, footer and the wait-list
 * dialog come from driftSite (shared with the /view, /memory and /path landings).
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
/* ── Hero ──
   One centred column: the copy over the scene, which now runs the full width beneath it
   (client, 2026-09-26). The scene is pulled up under the CTA so the two read as one block
   rather than a headline with a picture below it. */
.dh-hero{display:grid;justify-items:center;text-align:center;gap:0;padding:clamp(22px,3.4vw,44px) 0 clamp(18px,2.6vw,30px)}
.dh-copy{position:relative;z-index:2;max-width:min(100%,940px)}
/* Capped, and pulled up under the CTA: at full width the Drift dwarfs the words it belongs to,
   and the picker ends up a screen further down than the headline. */
.dh-hero .dh-visual{width:100%;max-width:min(100%,720px);margin-top:clamp(-16px,-1.1vw,-4px)}
@media(min-width:1440px){.dh-hero .dh-visual{max-width:780px}}
.dh-kicker{display:inline-flex;align-items:center;gap:14px;font-size:12.5px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent)}
.dh-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.dh-h1{margin:22px 0 0;font-size:clamp(44px,7.4vw,106px);line-height:.94;letter-spacing:-.045em;font-weight:800;color:var(--text)}
.dh-h1 .ln{display:block}
/* Desktop: exactly two lines — the size follows the column so neither line wraps. */
@media(min-width:1024px){.dh-h1{font-size:clamp(52px,5.1vw,80px)}.dh-h1 .ln{white-space:nowrap}}
.dh-h1 em{font-style:normal;color:var(--accent)}
.drift-ui[data-theme="dark"] .dh-h1 em{background:linear-gradient(90deg,#22d3ee 0%,#38bdf8 48%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.dh-lead{margin:24px auto 0;font-size:clamp(18px,2.1vw,24px);line-height:1.45;color:var(--muted);max-width:34ch}
.dh-kinds{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;margin-top:26px;font-size:15.5px;font-weight:650;letter-spacing:.05em;color:var(--muted)}
.dh-copy .dh-kinds{justify-content:center}
.dh-kinds i{font-style:normal;color:var(--faint)}
.dh-go{display:inline-flex;align-items:center;gap:12px;margin-top:32px;padding:17px 30px;border-radius:999px;font-size:16px;font-weight:700;text-decoration:none}
/* A short screen (a 768px laptop, a phone turned sideways): the hero gives back the room the
   copy was taking, so the scene AND its picker are in the first view rather than below it. */
@media(min-width:1024px) and (max-height:900px){
  .dh-hero{padding-top:18px}
  .dh-h1{font-size:clamp(42px,3.9vw,60px);margin-top:16px}
  .dh-lead{margin-top:16px;font-size:clamp(17px,1.5vw,20px)}
  .dh-copy .dh-kinds{margin-top:16px}
  .dh-go{margin-top:20px;padding:14px 26px;font-size:15px}
  .dh-hero .dh-visual{max-width:min(100%,600px)}
}
.dh-go svg,.dh-pill svg{transition:transform .2s}
.dh-go:hover svg,.dh-pill:hover svg{transform:translateX(3px)}

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

@media(prefers-reduced-motion:reduce){.dh-card:hover{transform:none}}
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

export default function DriftHome() {
  const [waitFor, setWaitFor] = useState<Product | null>(null);

  return (
    <DriftSiteShell className="dh">
      <style>{HOME_SCENE_STYLES}</style>
      <style>{STYLES}</style>

        <section className="dh-hero t-rise">
          <div className="dh-copy">
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
          <HomeScene />
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
