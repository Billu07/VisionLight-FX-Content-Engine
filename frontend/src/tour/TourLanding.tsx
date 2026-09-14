import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { TourShell } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";
import { PathArtH } from "./tourPageParts";
import { CREATOR_START } from "./tourSession";

/**
 * drift.li/tour — the Drift Tour landing, in the client's words (TOUR_V2_PLAN.md §6).
 * Calm, flat and studio-like: the hero with the moving route, the 3-second capture
 * path, four quiet panels, one clear price, the Pro invitation and a closing call.
 * Signed-in creators skip it and land on their page (TourIndex).
 */

const STYLES = `
.tl-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:750;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.tl-section{margin-top:clamp(44px,8vw,88px)}
.tl-h2{margin:10px 0 0;font-size:clamp(28px,4.4vw,42px);line-height:1.06;letter-spacing:-.03em;font-weight:800;color:var(--text)}
.tl-p{margin:12px 0 0;font-size:16.5px;line-height:1.6;color:var(--muted);max-width:46ch}
.tl-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.tl-cta .d-btn{padding:14px 22px;font-size:15px;text-decoration:none}

.tl-hero{display:grid;gap:30px;align-items:center;padding:clamp(8px,3vw,28px) 0 0}
@media(min-width:900px){.tl-hero{grid-template-columns:minmax(0,1fr) minmax(340px,.92fr);gap:52px}}
.tl-h1{margin:14px 0 0;font-size:clamp(44px,8vw,82px);line-height:.96;letter-spacing:-.045em;font-weight:800;color:var(--text)}
.tl-lead{margin:18px 0 0;font-size:clamp(17px,2.3vw,21px);line-height:1.5;color:var(--muted);max-width:38ch}
.tl-badge{display:inline-flex;align-items:center;gap:10px;margin-top:22px;padding:9px 15px;border-radius:999px;border:1px solid var(--accent-border);background:var(--accent-soft);color:var(--text);font-size:14px;font-weight:750}
.tl-badge svg{color:var(--accent)}
.tl-where{margin:14px 0 0;font-size:14.5px;font-weight:650;color:var(--muted)}
.tl-where i{font-style:normal;color:var(--faint);margin:0 9px}
.tl-hero-art{height:240px}
@media(min-width:900px){.tl-hero-art{height:280px}}

.tl-band{display:grid;gap:28px;align-items:center;padding:clamp(24px,4vw,44px);border-radius:28px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
@media(min-width:900px){.tl-band{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px}}
.tl-band .d-btn{margin-top:20px;padding:13px 20px;font-size:14.5px;text-decoration:none}
.tl-steps{list-style:none;margin:0;padding:6px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));position:relative}
.tl-steps::before{content:"";position:absolute;left:16.67%;right:16.67%;top:34px;height:2px;border-radius:2px;background:var(--accent);opacity:.45}
.tl-steps li{position:relative;display:grid;justify-items:center;gap:12px;text-align:center}
.tl-steps b{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:2px solid var(--accent);color:var(--accent);box-shadow:0 0 0 7px var(--surface)}
.tl-steps span{font-size:15.5px;font-weight:750;color:var(--text)}
.tl-steps small{display:block;font-size:12px;font-weight:600;color:var(--muted)}

.tl-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.tl-card{padding:24px;border-radius:24px;border:1px solid var(--border);background:var(--surface);display:grid;gap:10px;align-content:start;box-shadow:var(--shadow-sm)}
.tl-card h3{margin:6px 0 0;font-size:20px;font-weight:800;letter-spacing:-.015em;color:var(--text)}
.tl-card p{margin:0;font-size:14.5px;line-height:1.6;color:var(--muted)}
.tl-card .tl-strong{color:var(--text);font-weight:700}
.tl-ico{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent)}
.tl-list{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.tl-list li{display:flex;gap:9px;align-items:center;font-size:14.5px;font-weight:600;color:var(--text)}
.tl-list li::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
.tl-tags{display:flex;flex-wrap:wrap;gap:6px}
.tl-tags span{padding:5px 11px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:12.5px;font-weight:650;color:var(--text)}

.tl-price{display:grid;gap:24px;align-items:center}
@media(min-width:900px){.tl-price{grid-template-columns:minmax(0,1fr) minmax(320px,430px);gap:44px}}
.tl-checks{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:10px}
.tl-checks li{display:flex;gap:11px;align-items:center;font-size:16.5px;font-weight:650;color:var(--text)}
.tl-checks li::before{content:"✓";display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:var(--ok-soft);border:1px solid var(--ok-border);color:var(--ok);font-size:13px;font-weight:800;flex:none}
.tl-price-card{padding:30px;border-radius:28px;border:1px solid var(--accent-border);background:var(--surface);display:grid;gap:10px;box-shadow:var(--shadow)}
.tl-amount{font-size:clamp(52px,8vw,72px);font-weight:800;letter-spacing:-.045em;line-height:1;color:var(--text)}
.tl-amount small{font-size:17px;font-weight:650;letter-spacing:0;color:var(--muted);margin-left:10px}
.tl-price-card p{margin:0;font-size:15px;line-height:1.5;color:var(--muted)}
.tl-price-card .d-btn{margin-top:10px;padding:14px 20px;font-size:15px;text-decoration:none}

.tl-pro{display:grid;gap:24px;align-items:center}
@media(min-width:900px){.tl-pro{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:44px}}
.tl-pro-card{padding:clamp(24px,3.5vw,34px);border-radius:28px;border:1px solid var(--border);background:var(--surface-2)}
.tl-pro-card h3{margin:0;font-size:clamp(20px,2.6vw,24px);font-weight:800;letter-spacing:-.015em;line-height:1.2;color:var(--text)}
.tl-pro-card p{margin:10px 0 0;font-size:15.5px;line-height:1.55;color:var(--muted)}

.tl-close{display:grid;justify-items:center;text-align:center;gap:4px;padding:clamp(36px,6vw,68px) 20px;border-radius:32px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
.tl-close .tl-cta{justify-content:center}
`;

const Icon = ({ d }: { d: string[] }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

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
      <Link className="d-btn primary" to={pro ? `${CREATOR_START}?type=pro` : CREATOR_START}>
        Try it Free
      </Link>
      <Link className="d-btn" to={demoPath}>
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

      <section className="tl-hero t-rise">
        <div style={{ minWidth: 0 }}>
          <div className="tl-kicker">
            <span className="t-eyebrow-dot" />
            Drift Tour
          </div>
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
        <div className="tl-hero-art" aria-hidden>
          <PathArtH />
        </div>
      </section>

      <section className="tl-section tl-band t-rise t-rise-2">
        <div style={{ minWidth: 0 }}>
          <div className="tl-kicker">3-Second Capture</div>
          <h2 className="tl-h2">Take a pan or tilt video of each space</h2>
          <p className="tl-p">Upload it. We turn it into a Drift in minutes.</p>
          <Link className="d-btn primary" to={CREATOR_START} style={{ display: "inline-flex" }}>
            Try it Free
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
          <Link className="d-btn primary" to={CREATOR_START}>
            Try it Free
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

      <section className="tl-section tl-close">
        <h2 className="tl-h2">Ready for Tour?</h2>
        <Cta demoPath={demoPath} />
      </section>
    </TourShell>
  );
}
