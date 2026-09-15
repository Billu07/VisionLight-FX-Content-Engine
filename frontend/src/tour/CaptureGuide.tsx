import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { TourShell } from "./tourUi";
import { CAPTURE_GUIDE, CREATOR_HOME, CREATOR_START } from "./tourSession";

/**
 * The Drift Capture Guide — the client's own words (verbatim), in the landing's card
 * language. Shown inline in the builder while a tour has no drifts, as a sheet the first
 * time a creator starts a tour (and from the builder's "Capture Guide" button), and as a
 * shareable page at /tour/capture-guide.
 */

export const CAPTURE_GUIDE_SEEN_KEY = "drift_capture_guide_seen";

const TIPS = [
  {
    title: "Go Wide",
    body: "Use a wide-angle lens. On phones, use the full Ultra Wide setting.",
    icon: ["M3 8V5a2 2 0 0 1 2-2h3", "M16 3h3a2 2 0 0 1 2 2v3", "M21 16v3a2 2 0 0 1-2 2h-3", "M8 21H5a2 2 0 0 1-2-2v-3", "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0"],
    diagram: null,
  },
  {
    title: "Shoot at 60 fps",
    body: "Set your phone or camera to 60 fps for smooth motion.",
    icon: ["M4 18a8 8 0 1 1 16 0", "M12 14l3.5-4", "M12 14h.01"],
    diagram: null,
  },
  {
    title: "Still → Pan → Still",
    body: "Start still. Pan slowly and smoothly for about 3 seconds. Keep the camera level. End still.",
    icon: ["M2 12h20", "M6 8l-4 4 4 4", "M18 8l4 4-4 4"],
    diagram: "pan",
  },
  {
    title: "Trim Before Uploading",
    body: "On your device, trim away the extra footage, leaving only a minimal still moment at each end.",
    icon: ["M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M20 4L8.1 15.9", "M14.5 14.5L20 20", "M8.1 8.1L12 12"],
    diagram: "trim",
  },
] as const;

const CG_STYLES = `
.cg{display:grid;gap:18px;min-width:0}
.cg-head{display:grid;gap:4px}
.cg-kicker{display:inline-flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:var(--accent)}
.cg-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.cg-title{margin:8px 0 0;font-size:clamp(30px,4.6vw,48px);line-height:1.04;letter-spacing:-.035em;font-weight:800;color:var(--text)}
.cg.compact .cg-title{font-size:clamp(22px,2.6vw,28px)}
.cg-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.cg-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:22px 20px;border-radius:20px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm);min-width:0}
.drift-ui[data-theme="dark"] .cg-card{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:rgba(56,189,248,.18)}
.cg.compact .cg-card{padding:18px 16px;border-radius:16px;box-shadow:none;background:var(--surface-2)}
.cg-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.cg-ico{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;flex:none;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent)}
.cg.compact .cg-ico{width:40px;height:40px;border-radius:12px}
.cg-n{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--faint)}
.cg-card h3{margin:4px 0 0;font-size:19px;font-weight:750;letter-spacing:-.01em;line-height:1.2;color:var(--text)}
.cg.compact .cg-card h3{font-size:16.5px}
.cg-card p{margin:0;font-size:14.5px;line-height:1.55;color:var(--muted)}
.cg.compact .cg-card p{font-size:13.5px}
.cg-diagram{display:flex;align-items:center;gap:4px;height:10px;margin-top:auto;padding-top:8px}
.cg-diagram i{display:block;height:10px;border-radius:999px}
.cg-diagram .still{flex:0 0 16%;background:var(--surface-3);border:1px solid var(--border-strong)}
.cg-diagram .pan{flex:1 1 auto;background:var(--accent)}
.cg-diagram .cut{flex:0 0 18%;background:transparent;border:1px dashed var(--border-strong);opacity:.8}
.cg-diagram .edge{flex:0 0 6%;background:var(--surface-3);border:1px solid var(--border-strong)}
.cg-page{max-width:1040px;margin:0 auto;padding:clamp(12px,3vw,32px) 0}
.t-sheet-card.cg-sheet{max-width:900px;max-height:90vh;overflow:auto}
`;

const Icon = ({ d }: { d: readonly string[] }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

export function CaptureGuide({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`cg ${compact ? "compact" : ""}`} aria-label="Drift Capture Guide">
      <style>{CG_STYLES}</style>
      <div className="cg-head">
        <div className="cg-kicker">Drift Capture Guide</div>
        <h2 className="cg-title">For Best Results</h2>
      </div>
      <div className="cg-grid">
        {TIPS.map((t, i) => (
          <article key={t.title} className="cg-card">
            <div className="cg-top">
              <div className="cg-ico">
                <Icon d={t.icon} />
              </div>
              <span className="cg-n">0{i + 1}</span>
            </div>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
            {t.diagram === "pan" && (
              <div className="cg-diagram" aria-hidden>
                <i className="still" />
                <i className="pan" />
                <i className="still" />
              </div>
            )}
            {t.diagram === "trim" && (
              <div className="cg-diagram" aria-hidden>
                <i className="cut" />
                <i className="edge" />
                <i className="pan" />
                <i className="edge" />
                <i className="cut" />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/** The guide as a sheet (first tour, or the builder's "Capture Guide" button). */
export function CaptureGuideSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="t-sheet" onClick={onClose} role="dialog" aria-modal aria-label="Drift Capture Guide">
      <div className="t-sheet-card cg-sheet" onClick={(e) => e.stopPropagation()}>
        <style>{CG_STYLES}</style>
        <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <CaptureGuide compact />
        <div className="t-actions">
          <button type="button" className="d-btn primary" onClick={onClose}>
            Got it
          </button>
          <Link className="d-btn ghost" to={CAPTURE_GUIDE} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            Open as a page
          </Link>
        </div>
      </div>
    </div>
  );
}

/** drift.li/tour/capture-guide — the guide on its own page (shareable with a photographer). */
export function CaptureGuidePage() {
  const { user, profiles, checkAuth } = useAuth();
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const creator = user?.view === "TOUR" || profiles.some((p) => p.view === "TOUR");
  return (
    <TourShell>
      <div className="cg-page t-rise">
        <CaptureGuide />
        <div className="t-actions" style={{ marginTop: 26 }}>
          {creator ? (
            <Link className="d-btn primary" to={CREATOR_HOME} style={{ textDecoration: "none" }}>
              Dashboard
            </Link>
          ) : (
            <Link className="d-btn primary" to={CREATOR_START} style={{ textDecoration: "none" }}>
              Try it Free
            </Link>
          )}
        </div>
      </div>
    </TourShell>
  );
}
