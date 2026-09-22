import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { LoginModal } from "../components/LoginModal";
import { DriftThemeStyles } from "./driftUiTheme";
import { TOUR_STYLES } from "../tour/tourUi";
import PerspectiveGrid from "./PerspectiveGrid";

/**
 * drift.li's public site kit: the shell shared by the home (DriftHome) and the product
 * landings (/view, /memory, /path) — one header (wordmark, theme, Login / Dashboard), one
 * footer, the wait-list dialog — plus the "ds-" landing blocks: kicker + Coming Soon,
 * the big headline, pill CTAs, the horizon + perspective-grid stage each product draws
 * its own scene on, glowing step nodes, cards and glass bands.
 *
 * Accent comes from the page (--accent; `ds-violet` / `ds-emerald` retint a landing),
 * glow is dark-theme only and light stays flat, like the rest of the drift UI.
 */

const SITE_STYLES = `
.ds{position:relative;isolation:isolate;background:var(--bg);color:var(--text);overflow-x:hidden}
/* Dark only: a faint glow behind the hero (light mode stays flat paper). */
.drift-ui[data-theme="dark"].ds::before{content:"";position:absolute;inset:0 0 auto 0;height:900px;z-index:-1;pointer-events:none;background:
  radial-gradient(40% 50% at 78% 30%, color-mix(in srgb,var(--accent) 10%,transparent), transparent 70%),
  radial-gradient(34% 40% at 12% 12%, rgba(139,92,246,.07), transparent 70%)}

/* Product accents — View keeps drift cyan. */
.drift-ui.ds-violet{--accent:#a78bfa;--accent-2:#c4b5fd;--accent-soft:rgba(167,139,250,.14);--accent-border:rgba(167,139,250,.4);--accent-ink:#130b24}
.drift-ui[data-theme="light"].ds-violet{--accent:#7c3aed;--accent-2:#6d28d9;--accent-soft:rgba(124,58,237,.10);--accent-border:rgba(124,58,237,.30);--accent-ink:#ffffff}
.drift-ui.ds-emerald{--accent:#34d399;--accent-2:#6ee7b7;--accent-soft:rgba(52,211,153,.14);--accent-border:rgba(52,211,153,.4);--accent-ink:#03140d}
.drift-ui[data-theme="light"].ds-emerald{--accent:#047857;--accent-2:#065f46;--accent-soft:rgba(4,120,87,.10);--accent-border:rgba(4,120,87,.30);--accent-ink:#ffffff}

.dh-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,4vw,48px);background:color-mix(in srgb,var(--bg) 84%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.dh-logo{display:flex;align-items:center;gap:18px;text-decoration:none;min-width:0}
.dh-logo .d-wordmark{font-size:24px}
.dh-logo-sub{font-size:11.5px;font-weight:650;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
@media(max-width:520px){.dh-logo-sub{display:none}}
.dh-top-actions{display:flex;align-items:center;gap:10px}
.dh-top-actions .d-icon-btn{border-radius:12px}
.dh-top-actions .d-btn{border-radius:999px;padding:9px 18px;font-size:13px}
.dh-main{max-width:1280px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}

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

/* ── Landing blocks ── */
.ds-hero{display:grid;gap:clamp(34px,6vw,56px);align-items:center;padding:clamp(34px,6vw,80px) 0 clamp(20px,3vw,40px)}
.ds-hero-text{min-width:0}
@media(min-width:1024px){
  .ds-hero.split,.ds-hero.flip{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px}
  .ds-hero.flip .ds-hero-text{order:2}
}
.ds-hero.stack{justify-items:center;text-align:center}
.ds-hero.stack .ds-hero-text{display:grid;justify-items:center;max-width:900px}
.ds-hero.stack .ds-lead{max-width:44ch}
.ds-hero.stack .ds-kicker-row,.ds-hero.stack .ds-tags,.ds-hero.stack .ds-cta{justify-content:center}
.ds-hero.stack .ds-stage{width:100%;aspect-ratio:16/7}

.ds-kicker-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.ds-kicker{display:inline-flex;align-items:center;gap:12px;font-size:12.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--accent)}
.ds-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.ds-soon{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;white-space:nowrap;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border)}
.ds-soon::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.ds-h1{margin:22px 0 0;font-size:clamp(44px,7.2vw,96px);line-height:.95;letter-spacing:-.045em;font-weight:800;color:var(--text)}
@media(min-width:1024px){.ds-h1{font-size:clamp(52px,5vw,76px)}}
.ds-h1 em,.ds-h2 em{font-style:normal;color:var(--accent)}
.ds-lead{margin:22px 0 0;font-size:clamp(18px,2.1vw,23px);line-height:1.45;color:var(--muted);max-width:32ch}
.ds-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:22px 0 0;font-size:15px;font-weight:650;letter-spacing:.04em;color:var(--muted)}
.ds-tags i{font-style:normal;color:var(--faint)}
.ds-note{margin:18px 0 0;font-size:16px;font-weight:650;color:var(--text)}
.ds-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.ds .d-btn.ds-pill{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:15px 26px;border-radius:999px;font-size:15.5px;font-weight:700;text-decoration:none}
.ds .d-btn.ds-pill.outline{background:transparent;border:1px solid var(--accent-border);color:var(--accent)}
.ds .d-btn.ds-pill.outline:hover{background:var(--accent-soft)}
.ds-pill svg{transition:transform .2s}
.ds-pill:hover svg{transform:translateX(3px)}

/* Hero stage: a horizon and the perspective grid; each product draws its scene above. */
.ds-stage{position:relative;min-width:0;width:100%;aspect-ratio:16/11;isolation:isolate}
.ds-horizon{position:absolute;left:-10%;right:-10%;top:var(--horizon,62%);height:1px;z-index:0;pointer-events:none;background:var(--accent-border)}
.drift-ui[data-theme="dark"] .ds-horizon{background:color-mix(in srgb,var(--accent) 55%,transparent);box-shadow:0 0 18px 1px color-mix(in srgb,var(--accent) 55%,transparent)}
.ds-floor{position:absolute;left:-14%;right:-14%;top:var(--horizon,62%);bottom:-6%;z-index:0;pointer-events:none;overflow:hidden;color:var(--accent);opacity:.16;
  -webkit-mask-image:radial-gradient(ellipse 70% 120% at 50% 0%,#000 45%,transparent 100%);mask-image:radial-gradient(ellipse 70% 120% at 50% 0%,#000 45%,transparent 100%)}
.drift-ui[data-theme="dark"] .ds-floor{opacity:.28}
@media(max-width:1023px){.ds-horizon,.ds-floor{left:0;right:0}}
.ds-scene{position:absolute;inset:0;z-index:1}
.ds-scene svg{display:block;width:100%;height:100%;overflow:visible;font-family:inherit}

.ds-section{margin-top:clamp(52px,9vw,104px)}
.ds-center{display:grid;justify-items:center;text-align:center;margin-bottom:28px}
.ds-h2{margin:14px 0 0;font-size:clamp(30px,4.6vw,50px);line-height:1.04;letter-spacing:-.035em;font-weight:800;color:var(--text)}
.ds-p{margin:14px 0 0;font-size:clamp(16px,1.7vw,18px);line-height:1.6;color:var(--muted);max-width:46ch}
.ds-glass{padding:clamp(26px,4.4vw,48px);border-radius:28px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm)}
.drift-ui[data-theme="dark"] .ds-glass{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:color-mix(in srgb,var(--accent) 22%,transparent);box-shadow:0 0 70px -34px color-mix(in srgb,var(--accent) 45%,transparent)}
.ds-band{display:grid;gap:30px;align-items:center}
@media(min-width:900px){.ds-band{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:44px}}
.ds-band .ds-ico{margin-bottom:6px}

.ds-steps{list-style:none;margin:0;padding:6px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));position:relative}
.ds-steps::before{content:"";position:absolute;left:16.67%;right:16.67%;top:35px;height:1px;background:var(--accent-border)}
.drift-ui[data-theme="dark"] .ds-steps::before{background:color-mix(in srgb,var(--accent) 55%,transparent);box-shadow:0 0 14px 1px color-mix(in srgb,var(--accent) 50%,transparent)}
.ds-steps li{position:relative;display:grid;justify-items:center;gap:14px;text-align:center}
.ds-steps b{position:relative;z-index:1;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1.5px solid var(--accent-border);color:var(--accent)}
.drift-ui[data-theme="dark"] .ds-steps b{background:var(--bg-soft);border-color:color-mix(in srgb,var(--accent) 60%,transparent);box-shadow:0 0 26px -6px color-mix(in srgb,var(--accent) 60%,transparent)}
.ds-steps span{font-size:15.5px;font-weight:750;color:var(--text)}
.ds-steps small{display:block;margin-top:2px;font-size:12px;font-weight:600;color:var(--muted)}

.ds-cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.ds-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:26px 24px;border-radius:22px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm);transition:border-color .2s,transform .2s,box-shadow .2s}
.ds-card:hover{border-color:var(--border-strong);transform:translateY(-2px)}
.drift-ui[data-theme="dark"] .ds-card{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:color-mix(in srgb,var(--accent) 17%,transparent)}
.drift-ui[data-theme="dark"] .ds-card:hover{border-color:color-mix(in srgb,var(--accent) 36%,transparent);box-shadow:0 0 44px -22px color-mix(in srgb,var(--accent) 45%,transparent)}
.ds-card h3{margin:8px 0 0;font-size:clamp(20px,1.8vw,23px);font-weight:750;letter-spacing:-.015em;line-height:1.15;color:var(--text)}
.ds-card p{margin:0;font-size:14.5px;line-height:1.55;color:var(--muted)}
.ds-ico{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;flex:none;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent)}

.ds-quote{margin:0 auto;max-width:18ch;font-size:clamp(32px,5.2vw,62px);line-height:1.05;letter-spacing:-.04em;font-weight:800;color:var(--text);text-align:center}
.ds-quote em{font-style:normal;color:var(--accent)}

.ds-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.ds-chip{display:inline-flex;align-items:center;gap:10px;padding:11px 18px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-size:14.5px;font-weight:700;color:var(--text)}
.ds-chip svg{color:var(--accent)}
.drift-ui[data-theme="dark"] .ds-chip{background:color-mix(in srgb,var(--surface) 70%,transparent);border-color:color-mix(in srgb,var(--accent) 24%,transparent)}

.ds-close{display:grid;justify-items:center;text-align:center;gap:6px;padding:clamp(44px,7vw,80px) 20px}
.ds-close .ds-cta{justify-content:center}

@media(prefers-reduced-motion:reduce){.ds-card:hover{transform:none}}
`;

export const Arrow = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);

export const SiteIcon = ({ d, size = 24 }: { d: readonly string[]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

export const useReducedMotion = () => {
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

/** Header (wordmark, theme, Login → Dashboard), main and footer for drift.li's public pages. */
export function DriftSiteShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { user, profiles, profileSelectionRequired, checkAuth } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = !!user || profileSelectionRequired;
  const hasTour = user?.view === "TOUR" || profiles.some((p) => p.view === "TOUR");
  const dashboardPath = hasTour ? "/tour/dashboard" : profileSelectionRequired ? "/studios" : "/app";

  return (
    <div className={`drift-ui d-page ds ${className}`} data-theme="dark">
      <DriftThemeStyles />
      <style>{TOUR_STYLES}</style>
      <style>{SITE_STYLES}</style>

      <header className="dh-top">
        <Link to="/" className="dh-logo">
          <span className="d-wordmark">
            drift<i>.li</i>
          </span>
          <span className="dh-logo-sub">Drift Live Interactive</span>
        </Link>
        <div className="dh-top-actions">
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

      <main className="dh-main">{children}</main>

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
        <p>Drift.li Is a Division of PicDrift</p>
      </footer>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}

export function WaitlistDialog({
  product,
  source,
  onClose,
}: {
  product: { key: string; name: string };
  source: string;
  onClose: () => void;
}) {
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
      await apiEndpoints.driftJoinWaitlist(to, product.key, source);
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
            <h3>You're on the List</h3>
            <p className="d-sub">We'll Email {email.trim()} as Soon as {product.name} Opens.</p>
            <button className="d-btn primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <div className="d-eyebrow">{product.name} · Coming Soon</div>
            <h3>Join the Wait List</h3>
            <p className="d-sub">Be the First to Know When {product.name} Opens.</p>
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

/** The horizon + perspective grid a product scene sits on. `horizon` is a % of the height. */
export function DriftStage({ horizon = "62%", children }: { horizon?: string; children: ReactNode }) {
  return (
    <div className="ds-stage" style={{ "--horizon": horizon } as CSSProperties} aria-hidden>
      <div className="ds-horizon" />
      <div className="ds-floor">
        <PerspectiveGrid />
      </div>
      <div className="ds-scene">{children}</div>
    </div>
  );
}

export function JoinCta({ onJoin }: { onJoin: () => void }) {
  return (
    <div className="ds-cta">
      <button type="button" className="d-btn primary ds-pill" onClick={onJoin}>
        Join Wait List
        <Arrow />
      </button>
      <Link className="d-btn ds-pill outline" to="/tour">
        Try Drift Tour
      </Link>
    </div>
  );
}

/** A coming-soon product hero: kicker + Coming Soon, headline, lead, tags / note, CTAs,
 *  and the product's own scene — split (scene right), flip (scene left) or stack (below). */
export function ProductHero({
  kicker,
  title,
  lead,
  tags,
  note,
  layout = "split",
  scene,
  onJoin,
}: {
  kicker: string;
  title: ReactNode;
  lead: string;
  tags?: string[];
  note?: string;
  layout?: "split" | "flip" | "stack";
  scene: ReactNode;
  onJoin: () => void;
}) {
  return (
    <section className={`ds-hero ${layout} t-rise`}>
      <div className="ds-hero-text">
        <div className="ds-kicker-row">
          <span className="ds-kicker">{kicker}</span>
          <span className="ds-soon">Coming Soon</span>
        </div>
        <h1 className="ds-h1">{title}</h1>
        <p className="ds-lead">{lead}</p>
        {tags?.length ? (
          <p className="ds-tags">
            {tags.map((t, i) => (
              <Fragment key={t}>
                {i > 0 && <i aria-hidden>·</i>}
                <span>{t}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
        {note ? <p className="ds-note">{note}</p> : null}
        <JoinCta onJoin={onJoin} />
      </div>
      {scene}
    </section>
  );
}

export function Steps({ label, steps }: { label: string; steps: { icon: readonly string[]; title: string; sub: string }[] }) {
  return (
    <ol className="ds-steps" aria-label={label}>
      {steps.map((s) => (
        <li key={s.title}>
          <b>
            <SiteIcon d={s.icon} />
          </b>
          <span>
            {s.title}
            <small>{s.sub}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Card({ icon, title, children }: { icon: readonly string[]; title: string; children: ReactNode }) {
  return (
    <article className="ds-card">
      <div className="ds-ico">
        <SiteIcon d={icon} />
      </div>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export function ClosingCall({ title, onJoin }: { title: ReactNode; onJoin: () => void }) {
  return (
    <section className="ds-section ds-glass ds-close">
      <span className="ds-soon">Coming Soon</span>
      <h2 className="ds-h2">{title}</h2>
      <JoinCta onJoin={onJoin} />
    </section>
  );
}

// Shared line icons (24px grid).
export const ICONS = {
  eye: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  link: ["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"],
  camera: ["M23 7l-7 5 7 5V7z", "M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"],
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"],
  lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  replay: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
  pan: ["M2 12h20", "M6 8l-4 4 4 4", "M18 8l4 4-4 4"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  sun: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  users: ["M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M3 20a6 6 0 0 1 12 0", "M16 11a3 3 0 1 0 0-6", "M21 20a6 6 0 0 0-5-5.9"],
  pin: ["M12 21s-7-4.6-7-10a7 7 0 0 1 14 0c0 5.4-7 10-7 10z", "M12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  cup: ["M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z", "M16 10h2a2 2 0 0 1 0 4h-2", "M8 3v2", "M12 3v2"],
  drift: ["M4 12a8 8 0 0 1 14-5.3", "M20 12a8 8 0 0 1-14 5.3", "M18 3v4h-4", "M6 21v-4h4"],
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 3-3 4 4", "M15.5 7.5a1.5 1.5 0 1 0 .01 0"],
  video: ["M4 6h11v12H4z", "M15 10l5-3v10l-5-3z"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 7.5h.01"],
  book: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 19V5"],
  steps: ["M4 20h4v-4h4v-4h4V8h4"],
  compass: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M16.2 7.8l-6.1 2.4 2.6 1.1 1.1 2.6z"],
  plus: ["M12 5v14", "M5 12h14"],
} as const;
