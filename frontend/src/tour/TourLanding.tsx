import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { TourShell } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";
import { PathArtH } from "./tourPageParts";
import { CREATOR_START } from "./tourSession";
import PerspectiveGrid from "../rotation3d/PerspectiveGrid";

/**
 * drift.li/tour — the Drift Tour landing, in the client's words (TOUR_V2_PLAN.md §6).
 * Same language as the drift.li home: the moving route rides a perspective grid under
 * a horizon glow, spaced kickers, pill CTAs, and cards / bands that pick up a soft glow
 * in the dark theme (light stays flat). Then the 3-second capture path, four panels,
 * one clear price, the Pro invitation and a closing call. Copy is the client's — restyle
 * only. Signed-in creators skip it and land on their page (TourIndex).
 */

const STYLES = `
/* overflow-x:clip — the horizon + grid run past the stage without letting the page scroll sideways */
.tl{position:relative;overflow-x:clip}
@media(max-width:959px){.tl-horizon,.tl-floor{left:0;right:0}}
.tl-kicker{display:inline-flex;align-items:center;gap:12px;font-size:12.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--accent)}
.tl-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.tl-section{margin-top:clamp(52px,9vw,104px)}
.tl-h2{margin:14px 0 0;font-size:clamp(30px,4.6vw,50px);line-height:1.04;letter-spacing:-.035em;font-weight:800;color:var(--text)}
.tl-p{margin:14px 0 0;font-size:clamp(16px,1.7vw,18px);line-height:1.6;color:var(--muted);max-width:46ch}

/* Pill CTAs (beat the shared .t-page button radius) */
.tl-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.tl .d-btn.tl-pill{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:15px 26px;border-radius:999px;font-size:15.5px;font-weight:700;text-decoration:none}
.tl .d-btn.tl-pill.outline{background:transparent;border:1px solid var(--accent-border);color:var(--accent);box-shadow:none}
.tl .d-btn.tl-pill.outline:hover{background:var(--accent-soft);transform:none}
.tl-pill svg{transition:transform .2s}
.tl-pill:hover svg{transform:translateX(3px)}

/* ── Hero ── */
.tl-hero{display:grid;gap:clamp(30px,5vw,48px);align-items:center;padding:clamp(18px,4vw,48px) 0 0}
@media(min-width:960px){.tl-hero{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:48px}}
.tl-h1{margin:20px 0 0;font-size:clamp(46px,7.6vw,92px);line-height:.94;letter-spacing:-.045em;font-weight:800;color:var(--text)}
@media(min-width:960px){.tl-h1{font-size:clamp(54px,5.2vw,72px)}}
.tl-lead{margin:22px 0 0;font-size:clamp(18px,2.1vw,22px);line-height:1.45;color:var(--muted);max-width:34ch}
.tl-badge{display:inline-flex;align-items:center;gap:10px;margin-top:24px;padding:9px 16px;border-radius:999px;border:1px solid var(--accent-border);background:var(--accent-soft);color:var(--text);font-size:14px;font-weight:750}
.drift-ui[data-theme="dark"] .tl-badge{box-shadow:0 0 26px -10px rgba(34,211,238,.55)}
.tl-badge svg{color:var(--accent)}
.tl-where{margin:18px 0 0;font-size:14.5px;font-weight:650;letter-spacing:.05em;color:var(--muted)}
.tl-where i{font-style:normal;color:var(--faint);margin:0 10px}

/* The moving route on the griddy surface */
.tl-stage{position:relative;min-width:0;height:clamp(250px,32vw,340px);isolation:isolate}
.tl-horizon{position:absolute;left:-12%;right:-12%;top:50%;height:1px;z-index:0;pointer-events:none;background:var(--accent-border)}
.drift-ui[data-theme="dark"] .tl-horizon{background:rgba(56,189,248,.55);box-shadow:0 0 16px 1px rgba(34,211,238,.55)}
.tl-floor{position:absolute;left:-16%;right:-16%;top:50%;bottom:-6%;z-index:0;pointer-events:none;overflow:hidden;color:var(--accent);opacity:.16;
  -webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 55%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,#000 55%,transparent 100%)}
.drift-ui[data-theme="dark"] .tl-floor{opacity:.26}
.tl-art{position:absolute;inset:0;z-index:1}

/* ── 3-second capture ── */
.tl-band{display:grid;gap:30px;align-items:center;padding:clamp(26px,4.4vw,48px);border-radius:28px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
@media(min-width:900px){.tl-band{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:44px}}
.drift-ui[data-theme="dark"] .tl-band{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.2);box-shadow:0 0 70px -34px rgba(34,211,238,.45)}
.tl-band .tl-pill{margin-top:24px}
.tl-steps{list-style:none;margin:0;padding:6px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));position:relative}
.tl-steps::before{content:"";position:absolute;left:16.67%;right:16.67%;top:35px;height:1px;background:var(--accent-border)}
.drift-ui[data-theme="dark"] .tl-steps::before{background:rgba(56,189,248,.55);box-shadow:0 0 14px 1px rgba(34,211,238,.5)}
.tl-steps li{position:relative;display:grid;justify-items:center;gap:14px;text-align:center}
.tl-steps b{position:relative;z-index:1;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1.5px solid var(--accent-border);color:var(--accent)}
.drift-ui[data-theme="dark"] .tl-steps b{background:var(--bg-soft);border-color:rgba(56,189,248,.6);box-shadow:0 0 26px -6px rgba(34,211,238,.6)}
.tl-steps span{font-size:15.5px;font-weight:750;color:var(--text)}
.tl-steps small{display:block;margin-top:2px;font-size:12px;font-weight:600;color:var(--muted)}

/* ── Four panels ── */
.tl-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
@media(min-width:1080px){.tl-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.tl-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:26px 24px;border-radius:22px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm);transition:border-color .2s,transform .2s,box-shadow .2s}
.tl-card:hover{border-color:var(--border-strong);transform:translateY(-2px)}
.drift-ui[data-theme="dark"] .tl-card{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.17)}
.drift-ui[data-theme="dark"] .tl-card:hover{border-color:rgba(56,189,248,.36);box-shadow:0 0 44px -22px rgba(34,211,238,.45)}
.tl-card h3{margin:8px 0 0;font-size:clamp(20px,1.8vw,23px);font-weight:750;letter-spacing:-.015em;line-height:1.15;color:var(--text)}
.tl-card p{margin:0;font-size:14.5px;line-height:1.55;color:var(--muted)}
.tl-card .tl-strong{color:var(--text);font-weight:700}
.tl-ico{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;flex:none;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent)}
.tl-list{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.tl-list li{display:flex;gap:9px;align-items:center;font-size:14.5px;font-weight:600;color:var(--text)}
.tl-list li::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
.tl-tags{display:flex;flex-wrap:wrap;gap:6px}
.tl-tags span{padding:5px 11px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:12.5px;font-weight:650;color:var(--text)}

/* ── Price ── */
.tl-price{display:grid;gap:26px;align-items:center}
@media(min-width:900px){.tl-price{grid-template-columns:minmax(0,1fr) minmax(320px,440px);gap:48px}}
.tl-checks{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:12px}
.tl-checks li{display:flex;gap:12px;align-items:center;font-size:17px;font-weight:650;color:var(--text)}
.tl-checks li::before{content:"✓";display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--ok-soft);border:1px solid var(--ok-border);color:var(--ok);font-size:13px;font-weight:800;flex:none}
.tl-price-card{display:grid;gap:10px;padding:clamp(26px,3.6vw,38px);border-radius:28px;border:1px solid var(--accent-border);background:var(--surface);box-shadow:var(--shadow)}
.drift-ui[data-theme="dark"] .tl-price-card{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.45);box-shadow:inset 0 0 0 1px rgba(34,211,238,.08),0 0 80px -26px rgba(34,211,238,.5)}
.tl-amount{font-size:clamp(54px,8vw,76px);font-weight:800;letter-spacing:-.045em;line-height:1;color:var(--text)}
.tl-amount small{font-size:17px;font-weight:650;letter-spacing:0;color:var(--muted);margin-left:10px}
.tl-price-card p{margin:0;font-size:15px;line-height:1.5;color:var(--muted)}
.tl-price-card .tl-pill{margin-top:14px}

/* ── Invite a Pro ── */
.tl-pro{display:grid;gap:26px;align-items:center}
@media(min-width:900px){.tl-pro{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px}}
.tl-pro-card{padding:clamp(26px,3.6vw,38px);border-radius:28px;border:1px solid var(--border);background:var(--surface-2)}
.drift-ui[data-theme="dark"] .tl-pro-card{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.2);box-shadow:0 0 70px -34px rgba(34,211,238,.4)}
.tl-pro-card h3{margin:0;font-size:clamp(21px,2.6vw,26px);font-weight:800;letter-spacing:-.015em;line-height:1.2;color:var(--text)}
.tl-pro-card p{margin:10px 0 0;font-size:15.5px;line-height:1.55;color:var(--muted)}

/* ── Closing call ── */
.tl-close{display:grid;justify-items:center;text-align:center;gap:4px;padding:clamp(44px,7vw,80px) 20px;border-radius:30px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
.drift-ui[data-theme="dark"] .tl-close{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.2);box-shadow:0 0 70px -34px rgba(34,211,238,.45)}
.tl-close .tl-cta{justify-content:center}

@media(prefers-reduced-motion:reduce){.tl-card:hover{transform:none}}
`;

const Icon = ({ d }: { d: string[] }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

const Arrow = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);

// drift.li's own page of featured tours (the Drift channel).
const DRIFT_TOURS = "/tour/drift";

// "Take a Tour" opens drift.li's demo tour (set in Admin → drift.li → Tour).
function useDemoPath() {
  const [path, setPath] = useState("/tour/demo");
  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftPublicFlow("tour", "demo")
      .then((r) => {
        const p = r.data?.flow?.publicPath;
        if (alive && p) setPath(p);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return path;
}

function Cta({ demoPath, pro }: { demoPath: string; pro?: boolean }) {
  return (
    <div className="tl-cta">
      <Link className="d-btn primary tl-pill" to={pro ? `${CREATOR_START}?type=pro` : CREATOR_START}>
        Try it Free
        <Arrow />
      </Link>
      <Link className="d-btn tl-pill outline" to={demoPath}>
        Take a Tour
      </Link>
    </div>
  );
}

export default function TourLanding() {
  const demoPath = useDemoPath();
  return (
    <TourShell>
      <style>{TOUR_PAGE_STYLES}</style>
      <style>{STYLES}</style>

      <div className="tl">
        <section className="tl-hero t-rise">
          <div style={{ minWidth: 0 }}>
            <div className="tl-kicker">Drift Tour</div>
            <h1 className="tl-h1">Show Any Space</h1>
            <p className="tl-lead">Turn a 3-second video into a Live Interactive. Connect them and create a Tour.</p>
            <div className="tl-badge">
              <Icon d={["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"]} />
              Natural 180° Views
            </div>
            <p className="tl-where">
              Real Estate<i>|</i>Venues<i>|</i>Any Location
            </p>
            <Cta demoPath={demoPath} />
          </div>
          <div className="tl-stage" aria-hidden>
            <div className="tl-horizon" />
            <div className="tl-floor">
              <PerspectiveGrid />
            </div>
            <div className="tl-art">
              <PathArtH />
            </div>
          </div>
        </section>

        <section className="tl-section tl-band t-rise t-rise-2">
          <div style={{ minWidth: 0 }}>
            <div className="tl-kicker">3-Second Capture</div>
            <h2 className="tl-h2">Take a pan or tilt video of each space</h2>
            <p className="tl-p">Upload it. We turn it into a Drift in minutes.</p>
            <Link className="d-btn primary tl-pill" to={CREATOR_START}>
              Try it Free
              <Arrow />
            </Link>
          </div>
          <ol className="tl-steps" aria-label="Capture, then upload, then explore">
            <li>
              <b>
                <Icon d={["M23 7l-7 5 7 5V7z", "M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"]} />
              </b>
              <span>
                Capture<small>3 seconds</small>
              </span>
            </li>
            <li>
              <b>
                <Icon d={["M12 16V4", "M6 10l6-6 6 6", "M4 20h16"]} />
              </b>
              <span>
                Upload<small>from your phone</small>
              </span>
            </li>
            <li>
              <b>
                <Icon d={["M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8", "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14"]} />
              </b>
              <span>
                Explore<small>drag to look around</small>
              </span>
            </li>
          </ol>
        </section>

        <section className="tl-section tl-grid">
          <article className="tl-card">
            <div className="tl-ico">
              <Icon d={["M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]} />
            </div>
            <h3>Phone or Camera</h3>
            <ul className="tl-list">
              <li>No 360 equipment.</li>
              <li>No scanning equipment.</li>
              <li>No complicated software.</li>
            </ul>
            <p>If you can take a video, you can create a Drift Tour in minutes.</p>
          </article>
          <article className="tl-card">
            <div className="tl-ico">
              <Icon d={["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"]} />
            </div>
            <h3>Real Views</h3>
            <p>Natural 180° motion that feels like looking from side to side.</p>
            <p className="tl-strong">Real rooms. Real details. Real spaces.</p>
            <p>No AI-generated rooms. Show the space as it really is.</p>
          </article>
          <article className="tl-card">
            <div className="tl-ico">
              <Icon d={["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"]} />
            </div>
            <h3>One Link</h3>
            <p>Share it anywhere.</p>
            <div className="tl-tags">
              {["Listing", "Website", "Text", "Email", "Social", "QR", "Ads"].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <p>Your Tour goes wherever your viewers are.</p>
          </article>
          <article className="tl-card">
            <div className="tl-ico">
              <Icon d={["M20.6 13.4 12 22l-8.6-8.6A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z", "M7.5 7.5h.01"]} />
            </div>
            <h3>Your Brand</h3>
            <p>Add your logo, property details, contact information and calls to action.</p>
          </article>
        </section>

        <section className="tl-section tl-price">
          <div style={{ minWidth: 0 }}>
            <div className="tl-kicker">Simple Pricing</div>
            <h2 className="tl-h2">Build a Tour of any size.</h2>
            <ul className="tl-checks">
              <li>No packages.</li>
              <li>No minimum.</li>
              <li>No subscription.</li>
            </ul>
          </div>
          <div className="tl-price-card">
            <div className="tl-amount">
              $6.50<small>per Drift</small>
            </div>
            <p>Conversion + 1 year of hosting included.</p>
            <p className="d-faint">Reactivate for another year if you need it.</p>
            <Link className="d-btn primary tl-pill" to={CREATOR_START}>
              Try it Free
              <Arrow />
            </Link>
          </div>
        </section>

        <section className="tl-section tl-pro">
          <div style={{ minWidth: 0 }}>
            <div className="tl-kicker">Invite a Pro</div>
            <h2 className="tl-h2">Professional Capture</h2>
            <p className="tl-p">
              Your photographer or videographer can create a Drift Tour using their existing equipment and skills.
            </p>
          </div>
          <div className="tl-pro-card">
            <h3>Are you a Photographer or Videographer?</h3>
            <p>Get set up in minutes and start offering Drift Tours to your clients.</p>
            <Cta demoPath={demoPath} pro />
          </div>
        </section>

        {/* The closing section used to repeat the two CTAs from the card above it. It now
            sends people to the Drift channel — the tours themselves are the best argument. */}
        <section className="tl-section tl-close">
          <h2 className="tl-h2">Ready for Tour?</h2>
          <div className="tl-cta">
            <Link className="d-btn primary tl-pill" to={DRIFT_TOURS}>
              View Drift Tours
              <Arrow />
            </Link>
          </div>
        </section>
      </div>
    </TourShell>
  );
}
