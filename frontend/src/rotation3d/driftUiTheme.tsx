import { useEffect, useState } from "react";

/**
 * Scoped design system for the Drift brand admin panel. A calm, professional
 * surface: soft ink/paper backgrounds, hairline borders, gentle shadows, roomy
 * spacing — themeable light/dark via a single [data-theme] on the .drift-ui root.
 * Components use the .d-* utility classes below so the whole panel themes together.
 */

const KEY = "drift-admin-theme";
export type DriftTheme = "dark" | "light";

// Read the persisted theme synchronously — for modals that render outside the
// dashboard subtree and need to match the panel's current theme.
export function readDriftTheme(): DriftTheme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(KEY);
  return saved === "light" ? "light" : "dark";
}

export function useDriftTheme(): [DriftTheme, () => void] {
  const [theme, setTheme] = useState<DriftTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function DriftThemeStyles() {
  return (
    <style>{`
.drift-ui{
  --bg:#0d1119; --bg-soft:#111725; --surface:#151c29; --surface-2:#1b2434; --surface-3:#212c3f;
  --border:rgba(255,255,255,.07); --border-strong:rgba(255,255,255,.13);
  --text:#e8edf4; --muted:#9aa7b8; --faint:#66738a;
  --accent:#22d3ee; --accent-2:#38bdf8; --accent-soft:rgba(34,211,238,.14); --accent-border:rgba(34,211,238,.38); --accent-ink:#04121a;
  --ok:#34d399; --ok-soft:rgba(52,211,153,.12); --ok-border:rgba(52,211,153,.28);
  --err:#fb7185; --err-soft:rgba(251,113,133,.12); --err-border:rgba(251,113,133,.28);
  --warn:#fbbf24; --warn-soft:rgba(251,191,36,.12); --warn-border:rgba(251,191,36,.28);
  --radius:16px; --radius-sm:11px;
  --shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 30px -18px rgba(0,0,0,.65);
  --shadow-sm:0 1px 2px rgba(0,0,0,.3);
  color:var(--text);
  font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.drift-ui[data-theme="light"]{
  --bg:#f5f7fb; --bg-soft:#eef2f8; --surface:#ffffff; --surface-2:#f4f7fb; --surface-3:#eaeff6;
  --border:rgba(15,23,42,.09); --border-strong:rgba(15,23,42,.16);
  --text:#1c2635; --muted:#5c6779; --faint:#8a94a5;
  --accent:#0891b2; --accent-2:#0e7490; --accent-soft:rgba(8,145,178,.10); --accent-border:rgba(8,145,178,.32); --accent-ink:#ffffff;
  --ok:#059669; --ok-soft:rgba(5,150,105,.10); --ok-border:rgba(5,150,105,.28);
  --err:#e11d48; --err-soft:rgba(225,29,72,.08); --err-border:rgba(225,29,72,.26);
  --warn:#b45309; --warn-soft:rgba(180,83,9,.10); --warn-border:rgba(180,83,9,.26);
  --shadow:0 1px 2px rgba(15,23,42,.05), 0 14px 32px -20px rgba(15,23,42,.30);
  --shadow-sm:0 1px 2px rgba(15,23,42,.05);
}

/* Full-page shell (own dashboard). Embedded (superadmin) mode skips this. */
.drift-ui.d-page{ min-height:100dvh; background:
  radial-gradient(120% 90% at 100% -10%, var(--bg-soft) 0%, transparent 55%),
  radial-gradient(120% 90% at 0% 0%, var(--bg-soft) 0%, transparent 50%),
  var(--bg); }

.d-topbar{ position:sticky; top:0; z-index:20; display:flex; align-items:center; justify-content:space-between;
  padding:14px clamp(16px,4vw,40px); background:color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter:blur(12px); border-bottom:1px solid var(--border); }
.d-wordmark{ font-size:20px; font-weight:800; letter-spacing:-.02em; color:var(--text); }
.d-wordmark i{ color:var(--accent); font-style:normal; }

.d-main{ max-width:1080px; margin:0 auto; padding:clamp(20px,4vw,36px) clamp(16px,4vw,40px) 64px; }

/* Cards / surfaces */
.d-card{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-sm); }
.d-card-pad{ padding:clamp(14px,2.4vw,20px); }
.d-hair{ border:1px solid var(--border); border-radius:var(--radius); background:color-mix(in srgb, var(--surface) 60%, transparent); }

/* Tabs — segmented control */
.d-tabs{ display:inline-flex; gap:3px; padding:4px; background:var(--surface-2); border:1px solid var(--border); border-radius:13px; }
.d-tab{ appearance:none; border:0; background:transparent; cursor:pointer; padding:7px 14px; border-radius:9px;
  font-size:12.5px; font-weight:650; color:var(--muted); transition:all .16s ease; white-space:nowrap; }
.d-tab:hover{ color:var(--text); }
.d-tab.active{ background:var(--surface); color:var(--text); box-shadow:var(--shadow-sm); }
.drift-ui[data-theme="light"] .d-tab.active{ background:#fff; }

/* Buttons */
.d-btn{ appearance:none; cursor:pointer; display:inline-flex; align-items:center; gap:7px; justify-content:center;
  padding:8px 14px; border-radius:var(--radius-sm); font-size:12.5px; font-weight:650; line-height:1;
  color:var(--text); background:var(--surface-2); border:1px solid var(--border); transition:all .16s ease; }
.d-btn:hover{ background:var(--surface-3); border-color:var(--border-strong); }
.d-btn:disabled{ opacity:.45; cursor:not-allowed; }
.d-btn.sm{ padding:6px 11px; font-size:11.5px; }
.d-btn.primary{ background:var(--accent); border-color:transparent; color:var(--accent-ink); font-weight:700; }
.d-btn.primary:hover{ filter:brightness(1.06); background:var(--accent); }
.d-btn.soft{ background:var(--accent-soft); border-color:var(--accent-border); color:var(--accent); }
.d-btn.soft:hover{ background:var(--accent-soft); filter:brightness(1.08); }
.d-btn.danger{ color:var(--err); border-color:var(--err-border); background:transparent; }
.d-btn.danger:hover{ background:var(--err-soft); }
.d-btn.ghost{ background:transparent; border-color:transparent; color:var(--muted); }
.d-btn.ghost:hover{ background:var(--surface-2); color:var(--text); }

/* Icon toggle (theme switch) */
.d-icon-btn{ appearance:none; cursor:pointer; width:36px; height:36px; display:grid; place-items:center; border-radius:10px;
  background:var(--surface-2); border:1px solid var(--border); color:var(--text); transition:all .16s ease; }
.d-icon-btn:hover{ background:var(--surface-3); border-color:var(--border-strong); }

/* Inputs */
.d-input,.d-select,.d-textarea{ width:100%; background:var(--surface-2); border:1px solid var(--border); color:var(--text);
  border-radius:var(--radius-sm); padding:10px 12px; font-size:14px; outline:none; transition:border-color .16s, box-shadow .16s;
  font-family:inherit; }
.d-input::placeholder,.d-textarea::placeholder{ color:var(--faint); }
.d-input:focus,.d-select:focus,.d-textarea:focus{ border-color:var(--accent-border); box-shadow:0 0 0 3px var(--accent-soft); }
.d-textarea{ min-height:64px; resize:vertical; }
.d-label{ display:block; font-size:11px; font-weight:650; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }

/* Text helpers */
.d-h1{ font-size:19px; font-weight:750; letter-spacing:-.01em; color:var(--text); }
.d-h2{ font-size:15px; font-weight:700; color:var(--text); }
.d-sub{ font-size:13.5px; color:var(--muted); }
.d-muted{ color:var(--muted); }
.d-faint{ color:var(--faint); }
.d-eyebrow{ font-size:11px; font-weight:650; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }

/* List rows */
.d-row{ display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;
  background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px;
  transition:border-color .16s, transform .16s; }
.d-row:hover{ border-color:var(--border-strong); }

/* Pills / status */
.d-pill{ display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.04em; border:1px solid var(--border-strong); color:var(--muted); background:var(--surface-2); }
.d-pill.ok{ color:var(--ok); border-color:var(--ok-border); background:var(--ok-soft); }
.d-pill.warn{ color:var(--warn); border-color:var(--warn-border); background:var(--warn-soft); }
.d-pill.err{ color:var(--err); border-color:var(--err-border); background:var(--err-soft); }
.d-pill.accent{ color:var(--accent); border-color:var(--accent-border); background:var(--accent-soft); }

/* Banners */
.d-banner{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px;
  border-radius:var(--radius); font-size:13.5px; border:1px solid var(--border); }
.d-banner.ok{ color:var(--ok); border-color:var(--ok-border); background:var(--ok-soft); }
.d-banner.err{ color:var(--err); border-color:var(--err-border); background:var(--err-soft); }
.d-banner.warn{ color:var(--warn); border-color:var(--warn-border); background:var(--warn-soft); }

/* Empty state */
.d-empty{ border:1px dashed var(--border-strong); border-radius:var(--radius); background:color-mix(in srgb, var(--surface) 50%, transparent);
  padding:56px 20px; text-align:center; color:var(--muted); font-size:14px; }

/* Table */
.d-table{ width:100%; border-collapse:collapse; font-size:14px; }
.d-table th{ text-align:left; font-size:11px; font-weight:650; letter-spacing:.05em; text-transform:uppercase; color:var(--muted);
  padding:10px 14px; border-bottom:1px solid var(--border); }
.d-table td{ padding:11px 14px; border-bottom:1px solid var(--border); color:var(--text); }
.d-table tr:last-child td{ border-bottom:0; }
.d-code{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; color:var(--text);
  background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:3px 7px; }

/* Stat card */
.d-stat{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px; }
.d-stat .n{ font-size:26px; font-weight:750; color:var(--text); line-height:1.1; margin-top:4px; }
`}</style>
  );
}

export function ThemeToggle({ theme, onToggle }: { theme: DriftTheme; onToggle: () => void }) {
  return (
    <button className="d-icon-btn" onClick={onToggle} title={theme === "dark" ? "Switch to light" : "Switch to dark"} aria-label="Toggle theme">
      {theme === "dark" ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
