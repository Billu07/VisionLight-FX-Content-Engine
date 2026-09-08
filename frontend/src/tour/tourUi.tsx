import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { DriftThemeStyles, ThemeToggle, useDriftTheme } from "../rotation3d/driftUiTheme";
import { CREATOR_HOME, CREATOR_START } from "./tourSession";

/**
 * Shared chrome + small pieces for the creator suite pages. Everything sits on
 * the scoped .d-* system (driftUiTheme) — light/dark, mobile-first — with a few
 * .t-* layout classes of its own below.
 */

export const TOUR_STYLES = `
.t-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:22px}
.t-title{font-size:clamp(24px,4vw,32px);font-weight:800;letter-spacing:-.02em;line-height:1.1;color:var(--text)}
.t-kind{margin-left:8px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);vertical-align:middle}
.t-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.t-card{display:grid;grid-template-rows:auto 1fr;overflow:hidden;cursor:pointer;transition:border-color .16s,transform .16s}
.t-card:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.t-thumb{position:relative;aspect-ratio:16/10;background:var(--surface-3);overflow:hidden}
.t-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.t-thumb .ph{position:absolute;inset:0;display:grid;place-items:center;color:var(--faint);font-size:12px;padding:12px;text-align:center}
.t-thumb .pill{position:absolute;top:10px;left:10px}
.t-card-body{padding:12px 14px 14px;display:grid;gap:8px;align-content:start}
.t-card-name{font-weight:700;font-size:15px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t-card-actions{display:flex;flex-wrap:wrap;gap:6px}
.t-usage{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.t-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:12px;color:var(--muted)}
.t-chip b{color:var(--text)}
.t-upgrade{border:1px solid var(--accent-border);background:linear-gradient(135deg,var(--accent-soft),transparent 62%),var(--surface)}
.t-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.t-steps{display:grid;gap:12px}
.t-step{display:grid;gap:14px;padding:14px;grid-template-columns:1fr}
@media(min-width:640px){.t-step{grid-template-columns:150px minmax(0,1fr)}}
.t-step-thumb{position:relative;aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:var(--surface-3);display:grid;place-items:center;color:var(--faint);font-size:12px;text-align:center;padding:10px}
.t-step-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.t-num{position:absolute;top:8px;left:8px;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:700;backdrop-filter:blur(6px);z-index:1}
.t-step-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.t-fields{display:grid;gap:10px}
@media(min-width:900px){.t-fields.two{grid-template-columns:1fr 1fr}}
.t-drop{border:1.5px dashed var(--border-strong);border-radius:var(--radius);padding:28px 16px;text-align:center;background:color-mix(in srgb,var(--surface) 55%,transparent);cursor:pointer;transition:border-color .16s,background .16s;display:grid;gap:6px;justify-items:center}
.t-drop:hover,.t-drop.over{border-color:var(--accent-border);background:var(--accent-soft)}
.t-drop .big{font-size:15px;font-weight:700;color:var(--text)}
.t-progress{height:6px;border-radius:999px;background:var(--surface-3);overflow:hidden;width:100%}
.t-progress i{display:block;height:100%;background:var(--accent);transition:width .2s}
.t-builder{display:grid;gap:20px;align-items:start}
@media(min-width:1000px){.t-builder{grid-template-columns:minmax(0,1fr) 330px}}
.t-preview{position:sticky;top:78px;display:none}
@media(min-width:1000px){.t-preview{display:grid;gap:12px}}
.t-frame{aspect-ratio:9/16;width:100%;border-radius:20px;overflow:hidden;background:#000;border:1px solid var(--border);display:grid;place-items:center;color:var(--faint);font-size:12px;text-align:center;padding:0}
.t-frame iframe{width:100%;height:100%;border:0;display:block}
.t-link{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);font-size:12.5px;max-width:100%;min-width:0}
.t-link code{font-family:ui-monospace,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;color:var(--text)}
.t-chain{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--muted)}
.t-chain b{color:var(--text);font-weight:650}
.t-chain .arr{color:var(--faint)}
.t-spin{width:18px;height:18px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent);animation:t-rot .8s linear infinite}
@keyframes t-rot{to{transform:rotate(360deg)}}
.t-arrows{display:inline-flex;gap:3px}
.t-arrows .d-btn{padding:5px 8px}
.t-color{display:flex;align-items:center;gap:8px}
.t-color input[type=color]{width:38px;height:32px;padding:0;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);cursor:pointer}
.t-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.t-empty{display:grid;gap:16px;justify-items:center;text-align:center;padding:48px 20px}
.t-empty .steps{display:grid;gap:8px;text-align:left;max-width:420px;width:100%}
.t-empty .step{display:flex;gap:10px;align-items:center;font-size:14px;color:var(--text)}
.t-empty .step b{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--accent-soft);color:var(--accent);font-size:11px;flex:none;border:1px solid var(--accent-border)}
.t-empty .step span{color:var(--muted)}
.t-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);text-decoration:none}
.t-back:hover{color:var(--text)}
.t-name-input{font-size:20px;font-weight:800;letter-spacing:-.01em;padding:8px 10px}
.t-muted-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12.5px;color:var(--muted)}

/* ── Tour surface: calmer, warmer and deeper than the admin panel ──
   A soft aurora wash behind everything, rounder cards with real depth, gradient
   primary actions, a numbered route rail in the builder, and gentle entrances. */
.t-page{position:relative;isolation:isolate}
.t-page::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:
  radial-gradient(52% 44% at 10% 0%, rgba(34,211,238,.13), transparent 70%),
  radial-gradient(48% 40% at 100% 6%, rgba(59,130,246,.15), transparent 70%),
  radial-gradient(60% 50% at 50% 112%, rgba(37,99,235,.10), transparent 70%)}
.drift-ui[data-theme="light"].t-page::before{background:
  radial-gradient(52% 44% at 10% 0%, rgba(8,145,178,.10), transparent 70%),
  radial-gradient(48% 40% at 100% 6%, rgba(59,130,246,.10), transparent 70%)}
.t-page .d-topbar{background:color-mix(in srgb, var(--bg) 68%, transparent)}
.t-page .d-main{max-width:1120px}
.t-page .d-card{border-radius:20px;box-shadow:0 1px 2px rgba(0,0,0,.18),0 18px 40px -28px rgba(0,0,0,.55)}
.drift-ui[data-theme="light"].t-page .d-card{box-shadow:0 1px 2px rgba(15,23,42,.05),0 20px 44px -30px rgba(15,23,42,.25)}
.t-page .d-btn{border-radius:12px}
.t-page .d-btn.primary{background:linear-gradient(120deg,#22d3ee,#3b82f6);color:#fff;border:0;box-shadow:0 12px 30px -14px rgba(34,211,238,.6);transition:transform .16s,filter .16s,box-shadow .16s}
.t-page .d-btn.primary:hover{filter:brightness(1.05);transform:translateY(-1px);background:linear-gradient(120deg,#22d3ee,#3b82f6)}
.t-page .d-btn.primary:disabled{transform:none;filter:none}
.t-page .d-input,.t-page .d-select,.t-page .d-textarea{border-radius:12px}
.t-page .d-eyebrow{letter-spacing:.12em}
.t-eyebrow-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);margin-right:8px;vertical-align:middle}
.t-title{font-size:clamp(28px,4.4vw,38px);letter-spacing:-.025em}
.t-head .d-sub{font-size:14.5px;max-width:52ch}
@keyframes t-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.t-rise{animation:t-rise .5s cubic-bezier(.2,.7,.2,1) both}
.t-rise-2{animation-delay:.07s}
.t-rise-3{animation-delay:.14s}
@media(prefers-reduced-motion:reduce){.t-rise{animation:none}}
.t-chip{border-radius:999px;padding:7px 12px;background:color-mix(in srgb, var(--surface) 70%, transparent);backdrop-filter:blur(8px)}
.t-card{border-radius:20px;transition:border-color .2s,transform .25s cubic-bezier(.2,.7,.2,1),box-shadow .25s}
.t-card:hover{transform:translateY(-3px);box-shadow:0 26px 50px -30px rgba(0,0,0,.6);border-color:var(--accent-border)}
.t-thumb{aspect-ratio:16/11}
.t-thumb::after{content:"";position:absolute;inset:auto 0 0 0;height:48%;background:linear-gradient(to top,rgba(5,9,18,.55),transparent);pointer-events:none}
.t-thumb .pill{z-index:1}
.t-thumb .ph{background:linear-gradient(135deg,var(--accent-soft),transparent 60%)}
.t-card-body{padding:14px 16px 16px;gap:9px}
.t-card-name{font-size:16px;letter-spacing:-.01em}
/* Route rail: the stops read as a path (desktop and up) */
.t-route{position:relative}
@media(min-width:640px){
  .t-route{padding-left:36px}
  .t-route::before{content:"";position:absolute;left:12px;top:26px;bottom:26px;width:2px;border-radius:2px;background:linear-gradient(to bottom,var(--accent),var(--border-strong));opacity:.55}
  .t-route-item{position:relative}
  .t-route-item::before{content:attr(data-n);position:absolute;left:-36px;top:20px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;color:var(--accent-ink);background:var(--accent);box-shadow:0 0 0 4px var(--bg),0 6px 16px -6px rgba(34,211,238,.6);z-index:1}
  .t-route-item.is-drop::before{content:"+";background:var(--surface-3);color:var(--muted);border:1px dashed var(--border-strong);box-shadow:0 0 0 4px var(--bg)}
}
.t-step{border-radius:20px;padding:16px;transition:border-color .2s,box-shadow .2s}
.t-step-thumb{border-radius:14px}
.t-drop{border-radius:20px;padding:34px 18px;gap:8px;background:linear-gradient(135deg,var(--accent-soft),transparent 62%),color-mix(in srgb,var(--surface) 55%,transparent)}
.t-drop:hover,.t-drop.over{background:linear-gradient(135deg,var(--accent-soft),transparent 40%),color-mix(in srgb,var(--surface) 70%,transparent)}
.t-drop .ico{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);margin-bottom:2px}
.t-drop .big{font-size:16px}
.t-bubbles{display:flex;gap:10px;justify-content:center;align-items:flex-end;margin-bottom:4px}
.t-bubble{width:54px;height:74px;border-radius:16px;background:linear-gradient(160deg,var(--surface-3),var(--surface-2));border:1px solid var(--border);position:relative;overflow:hidden}
.t-bubble::before{content:"";position:absolute;inset:10px 10px 22px;border-radius:9px;background:linear-gradient(135deg,var(--accent-soft),transparent 70%)}
.t-bubble::after{content:"";position:absolute;inset:auto 10px 9px 10px;height:6px;border-radius:3px;background:var(--accent);opacity:.75}
.t-bubble:nth-child(2){transform:translateY(-10px)}
.t-bubble:nth-child(3){transform:translateY(-3px)}
.t-frame{border-radius:24px;box-shadow:0 30px 60px -30px rgba(0,0,0,.6);border-color:var(--border-strong)}
.t-empty{padding:52px 22px}
.t-upgrade{border-radius:20px}
`;

/** Page chrome: wordmark → home, theme toggle, log out. */
export function TourShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [theme, toggleTheme] = useDriftTheme();
  const navigate = useNavigate();
  const out = async () => {
    await logout();
    navigate(CREATOR_START, { replace: true });
  };
  return (
    <div className="drift-ui d-page t-page" data-theme={theme}>
      <DriftThemeStyles />
      <style>{TOUR_STYLES}</style>
      <header className="d-topbar">
        <Link to={CREATOR_HOME} className="d-wordmark" style={{ textDecoration: "none" }}>
          drift<i>.li</i>
          <span className="t-kind">tour</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="d-faint hidden text-xs sm:inline">{user?.email}</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={out} className="d-btn sm">
            Log out
          </button>
        </div>
      </header>
      <main className="d-main">{children}</main>
    </div>
  );
}

export function StatusPill({ status, flow }: { status?: string | null; flow?: boolean }) {
  const s = status || "";
  const map: Record<string, { cls: string; label: string }> = {
    PUBLISHED: { cls: "ok", label: "Live" },
    READY: { cls: "accent", label: flow ? "Ready" : "Ready" },
    PROCESSING: { cls: "warn", label: "Building" },
    FAILED: { cls: "err", label: "Failed" },
    DRAFT: { cls: "", label: "Draft" },
    ARCHIVED: { cls: "", label: "Archived" },
  };
  const m = map[s] || { cls: "", label: s.toLowerCase() };
  return <span className={`d-pill ${m.cls}`}>{m.label}</span>;
}

/** Plan gate — flips to Stripe later; today it asks people to say hi. */
export function UpgradeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="d-card d-card-pad t-upgrade" style={{ display: "grid", gap: 8 }}>
      <div className="d-eyebrow">Upgrade</div>
      <div className="d-h2" style={{ fontSize: 17 }}>{title}</div>
      <p className="d-sub">{body}</p>
      <div className="t-actions" style={{ marginTop: 4 }}>
        <a
          className="d-btn primary"
          href="mailto:web@drift.li?subject=Upgrade%20my%20drift.li%20plan"
          style={{ textDecoration: "none" }}
        >
          Talk to us about a plan
        </a>
        <span className="d-faint" style={{ fontSize: 12 }}>Paid plans are rolling out — early creators get first access.</span>
      </div>
    </div>
  );
}

export function Spinner() {
  return <span className="t-spin" aria-hidden="true" />;
}

/** Reads a video file's duration in the browser (0 = unknown → the server decides). */
export const readClipDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    let done = false;
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const finish = (d: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => finish(0);
    v.src = url;
    setTimeout(() => finish(0), 8000);
  });

export const copyText = async (t: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
};

export const publicUrl = (path: string) =>
  typeof window === "undefined" ? path : `${window.location.origin}${path}`;

export const timeAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

export const apiError = (e: any, fallback = "Something went wrong. Please try again.") =>
  e?.response?.data?.error || e?.message || fallback;
