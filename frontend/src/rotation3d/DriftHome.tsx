import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { LoginModal } from "../components/LoginModal";
import { DriftThemeStyles, ThemeToggle, useDriftTheme } from "./driftUiTheme";
import { TOUR_STYLES } from "../tour/tourUi";
import { TOUR_PAGE_STYLES } from "../tour/tourPageStyles";
import { PathArtH } from "../tour/tourPageParts";

/**
 * drift.li — the home, in the client's words (TOUR_V2_PLAN.md §6). "You Control the
 * Movement": the hero holds a live drift you can drag right there (the superadmin's
 * landing drift), then Tour (available now) and View · Memory · Path (coming soon, each
 * with a wait list) and one closing call. Flat studio surfaces on the drift design
 * tokens, light and dark. Login top right; signed in, it becomes Dashboard.
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
    icon: ["M3 11l9-8 9 8", "M5 10v10h14V10", "M10 20v-6h4v6"],
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
    icon: ["M12 21s-7-4.6-7-10a7 7 0 0 1 14 0c0 5.4-7 10-7 10z", "M12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  },
  {
    key: "PATH",
    name: "Path",
    title: "Connect the Experience",
    body: ["Connect Drifts, images, video, information and links into an Interactive Path."],
    note: "Tell a story. Explain a process. Guide someone step by step.",
    icon: ["M4 6h6v6H4z", "M14 12h6v6h-6z", "M10 9h4v3", "M7 12v5h7"],
  },
];

const STYLES = `
.dh{background:var(--bg);color:var(--text)}
.dh-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,4vw,40px);background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.dh-logo{display:flex;align-items:baseline;gap:10px;text-decoration:none;min-width:0}
.dh-logo-sub{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
@media(max-width:420px){.dh-logo-sub{display:none}}
.dh-top-actions{display:flex;align-items:center;gap:8px}
.dh-main{max-width:1160px;margin:0 auto;padding:0 clamp(16px,4vw,40px)}

.dh-hero{display:grid;gap:32px;align-items:center;padding:clamp(30px,6vw,72px) 0 clamp(20px,4vw,40px)}
@media(min-width:960px){.dh-hero{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:56px}}
.dh-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:750;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.dh-h1{margin:16px 0 0;font-size:clamp(46px,8.4vw,92px);line-height:.95;letter-spacing:-.05em;font-weight:800;color:var(--text)}
.dh-lead{margin:20px 0 0;font-size:clamp(17px,2.3vw,21px);line-height:1.5;color:var(--muted);max-width:38ch}
.dh-kinds{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:22px;font-size:15px;font-weight:750;color:var(--text)}
.dh-kinds i{font-style:normal;color:var(--faint)}
.dh-go{margin-top:26px;padding:15px 24px;font-size:15.5px;text-decoration:none}
.dh-stage{position:relative;aspect-ratio:4/3;border-radius:30px;overflow:hidden;border:1px solid var(--border-strong);background:#05070d;box-shadow:var(--shadow)}
.dh-stage-fill{position:absolute;inset:0}
.dh-stage-cap{position:absolute;left:14px;bottom:14px;z-index:8;display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(5,7,13,.62);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:12px;font-weight:700;pointer-events:none;backdrop-filter:blur(8px)}
.dh-stage-art{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:var(--surface)}
.dh-stage-art svg{width:100%;height:auto;max-height:100%}

.dh-section{margin-top:clamp(44px,8vw,92px)}
.dh-h2{margin:0;font-size:clamp(28px,4.4vw,44px);line-height:1.05;letter-spacing:-.035em;font-weight:800;color:var(--text)}
.dh-products{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-top:22px}
.dh-card{position:relative;display:grid;gap:10px;align-content:start;padding:26px;border-radius:26px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
.dh-card.live{border-color:var(--accent-border)}
@media(min-width:1100px){.dh-card.live{grid-column:span 2}}
.dh-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dh-ico{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent)}
.dh-card .dh-name{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.dh-card h3{margin:2px 0 0;font-size:clamp(22px,2.6vw,27px);line-height:1.12;letter-spacing:-.02em;font-weight:800;color:var(--text)}
.dh-card p{margin:0;font-size:15px;line-height:1.55;color:var(--muted)}
.dh-card .dh-tags{font-size:13.5px;font-weight:700;color:var(--text)}
.dh-card .dh-note{color:var(--text);font-weight:600}
.dh-status{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--border-strong);color:var(--muted);background:var(--surface-2)}
.dh-status.on{color:var(--ok);border-color:var(--ok-border);background:var(--ok-soft)}
.dh-status.on::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ok)}
.dh-card-cta{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.dh-card-cta .d-btn{padding:12px 18px;font-size:14px;text-decoration:none}

.dh-close{display:grid;justify-items:center;text-align:center;gap:6px;padding:clamp(40px,7vw,76px) 20px;border-radius:34px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
.dh-close .dh-kinds{justify-content:center}

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
`;

const Icon = ({ d }: { d: string[] }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
    // The superadmin's landing drift becomes the live, draggable hero.
    apiEndpoints
      .driftPublicLandingHero(null)
      .then((r) => alive && setHero(r.data?.product || null))
      .catch(() => alive && setHero(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heroManifest = useMemo(() => {
    if (!hero) return null;
    const a: string[] = Array.isArray(hero.manifest?.frames) ? hero.manifest.frames : [];
    const b: string[] = Array.isArray(hero.secondManifest?.frames) ? hero.secondManifest.frames : [];
    const frames = b.length ? [...a, ...b] : a;
    return frames.length ? { frameCount: frames.length, frames, defaultFrame: hero.defaultFrame ?? 0 } : null;
  }, [hero]);

  const signedIn = !!user || profileSelectionRequired;
  const hasTour = user?.view === "TOUR" || profiles.some((p) => p.view === "TOUR");
  const dashboardPath = hasTour ? "/tour" : profileSelectionRequired ? "/studios" : "/app";

  return (
    <div className="drift-ui d-page dh" data-theme={theme}>
      <DriftThemeStyles />
      <style>{TOUR_STYLES}</style>
      <style>{TOUR_PAGE_STYLES}</style>
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
            <Link className="d-btn primary sm" to={dashboardPath} style={{ textDecoration: "none" }}>
              Dashboard
            </Link>
          ) : (
            <button className="d-btn sm" onClick={() => setShowLogin(true)}>
              Login
            </button>
          )}
        </div>
      </header>

      <main className="dh-main">
        <section className="dh-hero t-rise">
          <div style={{ minWidth: 0 }}>
            <div className="dh-kicker">
              <span className="t-eyebrow-dot" />
              Drift Live Interactive
            </div>
            <h1 className="dh-h1">You Control the Movement.</h1>
            <p className="dh-lead">Turn a few seconds of video into a Live Interactive you can explore.</p>
            <Kinds />
            <Link className="d-btn primary dh-go" to="/tour" style={{ display: "inline-flex" }}>
              Explore Drift Tour
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          <div className="dh-stage">
            {hero && heroManifest ? (
              <>
                <div className="dh-stage-fill">
                  <SpinViewer
                    manifest={heroManifest}
                    variant="hero"
                    driftMode
                    loopScrub={hero.loopEnabled ?? false}
                    driftDirection={hero.driftDirection}
                    background={hero.background || undefined}
                    introHint
                  />
                </div>
                <span className="dh-stage-cap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
                    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" />
                  </svg>
                  Drag to explore
                </span>
              </>
            ) : (
              <div className="dh-stage-art" aria-hidden>
                <PathArtH labels={["Tour", "View", "Memory", "Path"]} />
              </div>
            )}
          </div>
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
                {p.tags && <p className="dh-tags">{p.tags}</p>}
                {p.note && <p className="dh-note">{p.note}</p>}
                <div className="dh-card-cta">
                  {p.live ? (
                    <>
                      <Link className="d-btn primary" to="/tour/start">
                        Try it Free
                      </Link>
                      <Link className="d-btn" to="/tour">
                        Learn More
                      </Link>
                    </>
                  ) : (
                    <button className="d-btn" onClick={() => setWaitFor(p)}>
                      Join Wait List
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="dh-section dh-close">
          <h2 className="dh-h2">A New Way to Explore</h2>
          <Kinds />
          <Link className="d-btn primary dh-go" to="/tour/start">
            Try Drift Tour
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
