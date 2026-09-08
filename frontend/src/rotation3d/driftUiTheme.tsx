import { useEffect, useState } from "react";

/**
 * Scoped design system for every Drift admin surface (the superadmin drift.li tab,
 * the brand dashboard it embeds, the creator suite). One quiet, studio-grade look:
 * flat paper/ink backgrounds (no gradients), hairline borders, soft shadows, roomy
 * spacing — themeable light/dark via a single [data-theme] on the .drift-ui root.
 * Components use the .d-* classes below so every panel themes together.
 */

const KEY = "drift-admin-theme";
const EVT = "drift-theme-change";
export type DriftTheme = "dark" | "light";

// Read the persisted theme synchronously — for modals that render outside the
// dashboard subtree and need to match the panel's current theme.
export function readDriftTheme(): DriftTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Theme state shared by every mounted hook: a toggle anywhere (the superadmin
 * panel, the brand dashboard it embeds) moves all of them at once. */
export function useDriftTheme(): [DriftTheme, () => void] {
  const [theme, setTheme] = useState<DriftTheme>(() => readDriftTheme());
  useEffect(() => {
    const onChange = () => setTheme(readDriftTheme());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const toggle = () => {
    const next: DriftTheme = readDriftTheme() === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
    window.dispatchEvent(new Event(EVT));
  };
  return [theme, toggle];
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
  --violet:#c4b5fd; --violet-soft:rgba(167,139,250,.14); --violet-border:rgba(167,139,250,.32);
  --radius:16px; --radius-sm:11px;
  --shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 30px -18px rgba(0,0,0,.65);
  --shadow-sm:0 1px 2px rgba(0,0,0,.3);
  --chev:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239aa7b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  color:var(--text);
  font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  min-width:0;
}
/* Light: studio paper. Flat neutrals, ink text, one teal accent — calm and clean. */
.drift-ui[data-theme="light"]{
  --bg:#f3f4f7; --bg-soft:#eaedf2; --surface:#ffffff; --surface-2:#f5f6f9; --surface-3:#eceef3;
  --border:rgba(17,24,39,.08); --border-strong:rgba(17,24,39,.15);
  --text:#131a24; --muted:#5a6473; --faint:#8a93a2;
  --accent:#0b8aa5; --accent-2:#0e7490; --accent-soft:rgba(11,138,165,.10); --accent-border:rgba(11,138,165,.30); --accent-ink:#ffffff;
  --ok:#059669; --ok-soft:rgba(5,150,105,.10); --ok-border:rgba(5,150,105,.28);
  --err:#e11d48; --err-soft:rgba(225,29,72,.08); --err-border:rgba(225,29,72,.26);
  --warn:#b45309; --warn-soft:rgba(180,83,9,.10); --warn-border:rgba(180,83,9,.26);
  --violet:#6d28d9; --violet-soft:rgba(124,58,237,.10); --violet-border:rgba(124,58,237,.28);
  --shadow:0 1px 2px rgba(15,23,42,.05), 0 14px 32px -20px rgba(15,23,42,.30);
  --shadow-sm:0 1px 2px rgba(15,23,42,.05);
  --chev:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235a6473' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
}
.drift-ui *,.drift-ui *::before,.drift-ui *::after{box-sizing:border-box}

/* Full-page shell (own dashboard). Embedded (superadmin) mode skips this. */
.drift-ui.d-page{ min-height:100dvh; background:var(--bg); }
/* Embedded inside another (dark, Tailwind) page: paint our own ground so a light
   theme reads as a clean panel, not a white box on a black page. */
.drift-ui.d-embed{ background:var(--bg); border:1px solid var(--border); border-radius:20px; padding:clamp(14px,2.6vw,22px); }

.d-topbar{ position:sticky; top:0; z-index:20; display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:14px clamp(16px,4vw,40px); background:color-mix(in srgb, var(--bg) 84%, transparent);
  backdrop-filter:blur(12px); border-bottom:1px solid var(--border); }
.d-wordmark{ font-size:20px; font-weight:800; letter-spacing:-.02em; color:var(--text); }
.d-wordmark i{ color:var(--accent); font-style:normal; }

.d-main{ max-width:1080px; margin:0 auto; padding:clamp(20px,4vw,36px) clamp(16px,4vw,40px) 64px; }

/* Cards / surfaces */
.d-card{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-sm); min-width:0; }
.d-card-pad{ padding:clamp(14px,2.4vw,20px); }
.d-hair{ border:1px solid var(--border); border-radius:var(--radius); background:color-mix(in srgb, var(--surface-2) 70%, transparent); min-width:0; }
.d-head{ display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 14px; min-width:0; }
.d-head > *{ min-width:0; }

/* Tabs — segmented control. Scrolls sideways on a phone instead of overflowing. */
.d-tabs{ display:inline-flex; gap:3px; padding:4px; max-width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:13px;
  overflow-x:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
.d-tabs::-webkit-scrollbar{ display:none; }
.d-tab{ appearance:none; flex:none; border:0; background:transparent; cursor:pointer; padding:7px 14px; border-radius:9px;
  font-size:12.5px; font-weight:650; color:var(--muted); transition:color .16s, background .16s, box-shadow .16s; white-space:nowrap; font-family:inherit; }
.d-tab:hover{ color:var(--text); }
.d-tab.active{ background:var(--surface); color:var(--text); box-shadow:var(--shadow-sm); }
.drift-ui[data-theme="light"] .d-tab.active{ background:#fff; }
.d-tabs.fill{ display:flex; }
.d-tabs.fill .d-tab{ flex:1; }

/* Buttons */
.d-btn{ appearance:none; cursor:pointer; display:inline-flex; align-items:center; gap:7px; justify-content:center;
  padding:8px 14px; border-radius:var(--radius-sm); font-size:12.5px; font-weight:650; line-height:1;
  color:var(--text); background:var(--surface-2); border:1px solid var(--border); transition:background .16s, border-color .16s, transform .12s, filter .16s;
  font-family:inherit; text-decoration:none; }
.d-btn:hover{ background:var(--surface-3); border-color:var(--border-strong); }
.d-btn:active{ transform:translateY(1px); }
.d-btn:disabled{ opacity:.45; cursor:not-allowed; transform:none; }
.d-btn.sm{ padding:6px 11px; font-size:11.5px; }
.d-btn.primary{ background:var(--accent); border-color:transparent; color:var(--accent-ink); font-weight:700; }
.d-btn.primary:hover{ filter:brightness(1.06); background:var(--accent); }
.d-btn.soft{ background:var(--accent-soft); border-color:var(--accent-border); color:var(--accent); }
.d-btn.soft:hover{ background:var(--accent-soft); filter:brightness(1.08); }
.d-btn.warn{ background:var(--warn-soft); border-color:var(--warn-border); color:var(--warn); }
.d-btn.danger{ color:var(--err); border-color:var(--err-border); background:transparent; }
.d-btn.danger:hover{ background:var(--err-soft); }
.d-btn.ghost{ background:transparent; border-color:transparent; color:var(--muted); }
.d-btn.ghost:hover{ background:var(--surface-2); color:var(--text); }
.d-btn:focus-visible,.d-tab:focus-visible,.d-icon-btn:focus-visible,.d-x:focus-visible,.d-item:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
/* Wrapping action row (never lets a row of buttons run off a phone screen). */
.d-actions{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; }
/* The small "×" (dismiss / delete) — quiet until hovered. */
.d-x{ appearance:none; cursor:pointer; width:30px; height:30px; display:grid; place-items:center; border-radius:9px; border:1px solid transparent;
  background:transparent; color:var(--faint); font-size:18px; line-height:1; transition:color .16s, background .16s; font-family:inherit; flex:none; }
.d-x:hover{ color:var(--err); background:var(--err-soft); }

/* Icon toggle (theme switch) */
.d-icon-btn{ appearance:none; cursor:pointer; width:36px; height:36px; display:grid; place-items:center; border-radius:10px; flex:none;
  background:var(--surface-2); border:1px solid var(--border); color:var(--text); transition:background .16s, border-color .16s; }
.d-icon-btn:hover{ background:var(--surface-3); border-color:var(--border-strong); }

/* Inputs */
.d-input,.d-select,.d-textarea{ width:100%; min-width:0; background:var(--surface-2); border:1px solid var(--border); color:var(--text);
  border-radius:var(--radius-sm); padding:10px 12px; font-size:14px; outline:none; transition:border-color .16s, box-shadow .16s;
  font-family:inherit; }
.d-input::placeholder,.d-textarea::placeholder{ color:var(--faint); }
.d-input:focus,.d-select:focus,.d-textarea:focus{ border-color:var(--accent-border); box-shadow:0 0 0 3px var(--accent-soft); }
.d-input:disabled,.d-select:disabled,.d-textarea:disabled{ opacity:.55; cursor:not-allowed; }
.d-textarea{ min-height:64px; resize:vertical; }
.d-select{ appearance:none; background-image:var(--chev); background-repeat:no-repeat; background-position:right 10px center; padding-right:32px; cursor:pointer; }
.d-select.sm{ width:auto; padding:7px 30px 7px 10px; font-size:12.5px; }
.d-select option{ color:#131a24; background:#fff; }
.d-label{ display:block; font-size:11px; font-weight:650; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
.d-field{ display:grid; gap:0; min-width:0; }
.d-note{ font-size:11.5px; line-height:1.5; color:var(--faint); }
.d-check{ display:inline-flex; align-items:center; gap:8px; font-size:12.5px; color:var(--muted); cursor:pointer; user-select:none; }
.d-check input[type="checkbox"]{ width:15px; height:15px; accent-color:var(--accent); margin:0; }
/* Native file input, dressed. */
.d-file{ width:100%; min-width:0; font-size:12.5px; color:var(--muted); font-family:inherit; }
.d-file::file-selector-button{ appearance:none; cursor:pointer; margin-right:10px; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border);
  background:var(--surface-2); color:var(--text); font-size:12px; font-weight:650; font-family:inherit; transition:background .16s; }
.d-file::file-selector-button:hover{ background:var(--surface-3); }
.d-progress{ height:6px; border-radius:3px; background:var(--surface-3); overflow:hidden; }
.d-progress i{ display:block; height:100%; background:var(--accent); border-radius:3px; transition:width .3s ease; }

/* Text helpers */
.d-h1{ font-size:19px; font-weight:750; letter-spacing:-.01em; color:var(--text); overflow-wrap:anywhere; }
.d-h2{ font-size:15px; font-weight:700; color:var(--text); }
.d-sub{ font-size:13.5px; color:var(--muted); line-height:1.5; }
.d-muted{ color:var(--muted); }
.d-faint{ color:var(--faint); }
.d-eyebrow{ font-size:11px; font-weight:650; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.d-name{ font-weight:650; font-size:14px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.d-meta{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; margin-top:5px; font-size:11.5px; color:var(--faint); }

/* List rows: a name block + a wrapping action row. On phones the actions drop
   under the name at full width, so nothing is ever clipped. */
.d-row{ display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 14px; min-width:0;
  background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:13px 16px;
  transition:border-color .16s; }
.d-row:hover{ border-color:var(--border-strong); }
.d-row-main{ flex:1 1 220px; min-width:0; }
@media(max-width:600px){ .d-row{ padding:12px 13px; } .d-row > .d-actions{ width:100%; } }

/* Compact selectable items (brand list, template list, candidates). */
.d-list{ display:grid; gap:8px; min-width:0; }
.d-item{ display:flex; align-items:center; gap:10px; width:100%; min-width:0; text-align:left; padding:10px 12px; border-radius:var(--radius-sm);
  border:1px solid var(--border); background:var(--surface-2); color:var(--text); cursor:pointer; font-family:inherit; font-size:13.5px;
  transition:border-color .16s, background .16s, transform .16s; }
.d-item:hover{ border-color:var(--border-strong); background:var(--surface-3); }
.d-item.active{ border-color:var(--accent-border); background:var(--accent-soft); }
.d-item.static{ cursor:default; }
.d-item.static:hover{ background:var(--surface-2); border-color:var(--border); }
.d-item .grow{ flex:1 1 auto; min-width:0; }
.d-item .sub{ display:block; font-size:11px; color:var(--faint); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.d-thumb{ width:52px; aspect-ratio:1; flex:none; border-radius:10px; overflow:hidden; background:var(--surface-3); border:1px solid var(--border);
  display:grid; place-items:center; color:var(--faint); font-size:9.5px; text-align:center; }
.d-thumb img{ width:100%; height:100%; object-fit:contain; display:block; }
.d-thumb.lg{ width:64px; }
.d-scroll{ overflow-y:auto; overscroll-behavior:contain; padding-right:2px; }

/* Master–detail split: side column + main. On a phone, picking an item shows the
   detail alone (with a back button) instead of a list squeezed above it. */
.d-split{ display:grid; gap:18px; min-width:0; align-items:start; }
.d-split > *{ min-width:0; }
@media(min-width:1024px){
  .d-split{ grid-template-columns:320px minmax(0,1fr); }
  .d-split.reverse{ grid-template-columns:minmax(0,1fr) 340px; }
  .d-split-side{ position:sticky; top:16px; }
}
.d-split.has-detail .d-split-side{ display:none; }
.d-mobile-back{ margin-bottom:12px; }
@media(min-width:1024px){ .d-split.has-detail .d-split-side{ display:block; } .d-mobile-back{ display:none; } }

/* Tiles (landing showcase) */
.d-tile{ border:1px solid var(--border); border-radius:var(--radius); background:var(--surface-2); padding:12px; min-width:0; transition:border-color .16s; }
.d-tile:hover{ border-color:var(--border-strong); }
.d-tile.is-hero{ border-color:var(--warn-border); background:var(--warn-soft); }
.d-tile-top{ display:flex; gap:12px; align-items:center; min-width:0; }
.d-grid-2{ display:grid; gap:12px; min-width:0; }
@media(min-width:640px){ .d-grid-2{ grid-template-columns:repeat(2, minmax(0,1fr)); } }

/* Pills / status */
.d-pill{ display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:10.5px; font-weight:700; white-space:nowrap;
  text-transform:uppercase; letter-spacing:.04em; border:1px solid var(--border-strong); color:var(--muted); background:var(--surface-2); }
.d-pill.ok{ color:var(--ok); border-color:var(--ok-border); background:var(--ok-soft); }
.d-pill.warn{ color:var(--warn); border-color:var(--warn-border); background:var(--warn-soft); }
.d-pill.err{ color:var(--err); border-color:var(--err-border); background:var(--err-soft); }
.d-pill.accent{ color:var(--accent); border-color:var(--accent-border); background:var(--accent-soft); }
.d-pill.violet{ color:var(--violet); border-color:var(--violet-border); background:var(--violet-soft); }

/* Banners */
.d-banner{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; min-width:0;
  border-radius:var(--radius); font-size:13.5px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); }
.d-banner > span{ min-width:0; overflow-wrap:anywhere; }
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
button.d-code{ cursor:pointer; color:var(--accent); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; transition:background .16s; }
button.d-code:hover{ background:var(--surface-3); }

/* Stat card */
.d-stat{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px; }
.d-stat .n{ font-size:26px; font-weight:750; color:var(--text); line-height:1.1; margin-top:4px; }

/* Gentle entrance for panels */
@keyframes d-rise{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
.d-rise{ animation:d-rise .35s ease-out both; }
@media(prefers-reduced-motion:reduce){ .d-rise{ animation:none; } }
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
