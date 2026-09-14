/**
 * Shell for the superadmin panel (SuperAdminDashboard): grouped section tabs, the
 * sticky top bar and the panel's scoped styles, on the shared drift design system
 * (rotation3d/driftUiTheme — flat, no gradients, one light/dark toggle for the whole
 * panel, synced with the drift.li tab).
 *
 * Every tab and dialog is on the design system (migrated tab by tab, 2026-09-14 — visual
 * only). `.sa-legacy` (dark panel in light mode) is kept for a tab added later before it
 * is restyled — leave it out of MIGRATED — and for Rotation3D's embedded brand-facing
 * dashboard, which keeps its own look.
 */

export type SuperAdminTab =
  | "platform"
  | "byok"
  | "my-agency"
  | "demo-leads"
  | "demo"
  | "global-settings"
  | "global-presets"
  | "editor-presets"
  | "lab"
  | "rotation3d"
  | "drift";

export const SA_GROUPS: { label: string; tabs: { id: SuperAdminTab; label: string }[] }[] = [
  {
    label: "Studio",
    tabs: [
      { id: "platform", label: "Platform" },
      { id: "byok", label: "BYOK" },
      { id: "my-agency", label: "My agency" },
      { id: "demo-leads", label: "Demo leads" },
      { id: "demo", label: "Demo preview" },
    ],
  },
  {
    label: "Settings",
    tabs: [
      { id: "global-settings", label: "Global settings" },
      { id: "global-presets", label: "Global presets" },
      { id: "editor-presets", label: "Editor presets" },
      { id: "lab", label: "Lab" },
    ],
  },
  {
    label: "Products",
    tabs: [
      { id: "rotation3d", label: "Rotation3D" },
      { id: "drift", label: "drift.li" },
    ],
  },
];

// Tabs already on the design system; everything else renders inside `.sa-legacy`.
const MIGRATED = new Set<SuperAdminTab>([
  "platform",
  "byok",
  "my-agency",
  "demo-leads",
  "demo",
  "global-settings",
  "global-presets",
  "editor-presets",
  "lab",
  "rotation3d",
  "drift",
]);
export const isLegacyTab = (tab: SuperAdminTab) => !MIGRATED.has(tab);

export const SA_STYLES = `
.sa-page{min-height:100dvh;background:var(--bg)}
.sa-loading{min-height:100dvh;display:grid;place-items:center;background:var(--bg)}
.sa-top{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;
  padding:12px clamp(16px,3vw,32px);background:color-mix(in srgb,var(--bg) 86%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.sa-brand{display:grid;gap:2px;min-width:0}
.sa-brand .d-wordmark{font-size:18px;line-height:1.2}
.sa-who{font-size:11.5px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-top-actions{justify-content:flex-end}
.sa-top-actions b{font-weight:750}
.sa-main{max-width:1320px;margin:0 auto;padding:clamp(16px,2.6vw,28px) clamp(16px,3vw,32px) 96px;min-width:0}
@media(min-width:1024px){.sa-main .d-split-side{top:84px}}

/* Grouped section tabs */
.sa-nav{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 20px;margin-bottom:18px;min-width:0}
.sa-group{display:grid;gap:6px;min-width:0;max-width:100%}
.sa-group-label{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);padding-left:4px}

/* Release email — one compact row */
.sa-release{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 18px;padding:12px 16px;margin-bottom:18px}
.sa-release-copy{flex:1 1 320px;min-width:0}
.sa-release-copy .d-note{margin-top:2px}
.sa-release-form{display:flex;gap:8px;flex:1 1 300px;max-width:440px;min-width:0}
.sa-release-form .d-input{padding:8px 12px;font-size:13px}

/* Not-yet-migrated tabs: their original dark look, on a dark panel in light mode. */
.sa-legacy{background:#0a0e1a;color:#e5e7eb;border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:clamp(12px,2.4vw,22px);min-width:0}
.drift-ui[data-theme="dark"] .sa-legacy{background:transparent;border-color:transparent;padding:0}
/* Modal layer wrapper. Dialogs paint their own colours (.sa-dialog); this only keeps
   inherited text light for any legacy dialog added later. */
.sa-ink{color:#e5e7eb}

/* Demo leads */
.sa-stack{display:grid;gap:16px;min-width:0}
.sa-cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))}
.sa-lead{display:grid;gap:14px;padding:16px;transition:border-color .16s}
.sa-lead:hover{border-color:var(--border-strong)}
.sa-lead-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
.sa-lead-top > div{min-width:0}
.sa-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}
.sa-lead-stats{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border);padding-top:12px}
.sa-lead-stats > div{display:grid;gap:3px;min-width:0}
.sa-lead-stats > div + div{border-left:1px solid var(--border);padding-left:14px}
.sa-lead-stats b{font-size:18px;font-weight:750;color:var(--text)}
.sa-spin{width:11px;height:11px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:sa-spin .8s linear infinite}
@keyframes sa-spin{to{transform:rotate(360deg)}}

/* Shared bits for migrated tabs */
.sa-small{font-size:11.5px}
.sa-tight{margin:4px 0 0}
.sa-gap{margin-top:12px}
.sa-center{display:grid;place-items:center;padding:56px 16px}
.sa-count{color:var(--ok)}
.sa-sec-title{margin-bottom:12px}
.sa-title-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-width:0}
.sa-title-row .d-name{white-space:normal;overflow-wrap:anywhere}
.sa-clamp{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}

/* Demo preview picker */
.sa-pick-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}
.sa-pick{position:relative;display:block;aspect-ratio:1;padding:0;overflow:hidden;border-radius:10px;border:2px solid var(--border);background:var(--surface-3);cursor:pointer;transition:border-color .16s,box-shadow .16s}
.sa-pick:hover{border-color:var(--border-strong)}
.sa-pick.on{border-color:var(--ok);box-shadow:0 0 0 3px var(--ok-soft)}
.sa-pick-ph{display:grid;place-items:center;width:100%;height:100%;font-size:22px;color:var(--faint)}
.sa-more{margin-top:12px}

/* Lab */
.sa-lab{display:grid;gap:16px;align-items:start;min-width:0}
@media(min-width:1200px){.sa-lab{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}}
.sa-upload{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:12px 14px;border-radius:var(--radius-sm);border:1px dashed var(--accent-border);background:var(--accent-soft);cursor:pointer;transition:filter .16s}
.sa-upload:hover{filter:brightness(1.05)}
.sa-video{position:relative;margin-top:12px;aspect-ratio:16/9;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border);background:#000}
.sa-video video{display:block;width:100%;height:100%}
.sa-video-empty{display:grid;place-items:center;background:var(--surface-2);color:var(--faint);font-size:12.5px;text-align:center;padding:12px}
.sa-video-wait{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(5,8,14,.7);color:#e8edf4;font-size:12.5px}

/* Dialogs (migrated modals) */
.sa-overlay{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:rgba(5,8,14,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:sa-fade .18s ease-out}
.sa-dialog{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:20px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);animation:d-rise .22s ease-out}
.sa-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 22px 14px;border-bottom:1px solid var(--border)}
.sa-dialog-body{display:grid;gap:16px;padding:18px 22px 22px}
.sa-dialog-foot{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding-top:4px}
.sa-prompt{min-height:140px}
@keyframes sa-fade{from{opacity:0}to{opacity:1}}
.sa-dialog.sm{max-width:460px}
.sa-grid-2{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
.sa-plan{display:grid;gap:12px;padding:14px}
.sa-plan.sa-tight-gap{gap:4px}
.sa-flat{margin:0}
.sa-stack-sm{display:grid;gap:10px}
.sa-divide{border-top:1px solid var(--border);padding-top:12px}
.sa-inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sa-grow{flex:1 1 auto}
.sa-days{display:inline-flex;align-items:center;overflow:hidden;border-radius:var(--radius-sm);border:1px solid var(--warn-border);background:var(--warn-soft)}
.sa-days input{width:52px;padding:6px 0 6px 8px;background:transparent;border:0;outline:none;text-align:center;font:inherit;font-size:13px;font-weight:700;color:var(--warn)}
.sa-days .d-btn{border:0;border-left:1px solid var(--warn-border);border-radius:0}
.sa-warn-note{color:var(--warn)}
.d-banner.sa-info{color:var(--accent);border-color:var(--accent-border);background:var(--accent-soft)}
.d-btn.sa-on-ok{color:var(--ok);border-color:var(--ok-border);background:var(--ok-soft)}
.d-btn.sa-on-err{color:var(--err);border-color:var(--err-border);background:var(--err-soft)}

/* Platform · BYOK · My agency */
.sa-card-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 14px;padding:14px 16px;border-bottom:1px solid var(--border)}
.sa-card-body{padding:12px 16px 16px;min-width:0}
.sa-card-note{margin:0;padding:12px 16px 4px;border-top:1px solid var(--border)}
.sa-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sa-strong{font-size:13px;font-weight:650;color:var(--text)}
.sa-cell-label{display:block;margin-bottom:3px;font-size:10.5px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
.sa-grid-row{display:grid;gap:10px 16px;align-items:center;min-width:0;padding:13px 16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);transition:border-color .16s}
.sa-grid-row:hover{border-color:var(--border-strong)}
.sa-grid-row > *{min-width:0}
.sa-card-body .sa-grid-row{background:var(--surface-2)}
@media(min-width:1024px){
  .sa-request{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto}
  .sa-tenant{grid-template-columns:minmax(0,1.5fr) 120px minmax(170px,1fr) auto}
  .sa-user{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 120px 120px auto}
  .sa-byok{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,.8fr) 100px 90px auto}
  .sa-grid-row > .d-actions{justify-content:flex-end}
}
.sa-bar{height:6px;max-width:220px;margin-top:6px;border-radius:3px;background:var(--surface-3);overflow:hidden}
.sa-bar i{display:block;height:100%;border-radius:3px;background:var(--accent)}
.sa-bar.warn i{background:var(--warn)}
.sa-bar.err i{background:var(--err)}
.sa-stats{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}
.d-stat .n.err{color:var(--err)}
.d-stat .n.warn{color:var(--warn)}
.d-stat .n.accent{color:var(--accent)}
.d-stat .n.violet{color:var(--violet)}
.sa-table-wrap{overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.sa-table-wrap .d-table{min-width:640px}
.sa-table-wrap .d-table.wide{min-width:1080px}
.d-table th.num,.d-table td.num{text-align:right}
.d-table th.mid,.d-table td.mid{text-align:center}
.sa-mono-cell{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--faint);overflow-wrap:anywhere}
.sa-num{width:64px;padding:6px 8px;font-size:12.5px;text-align:center}
.sa-num.wide{width:96px;text-align:right}
.sa-num-row{display:flex;justify-content:center;gap:6px}
.sa-accent{color:var(--accent);font-weight:700}
.sa-err-text{color:var(--err)}
.sa-end{justify-content:flex-end}

/* Global settings */
.sa-pricing{display:grid;gap:16px;align-items:start;min-width:0}
@media(min-width:1200px){.sa-pricing{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}}
.sa-price-group{padding:10px 14px 6px;margin-top:12px}
.sa-price-group .d-label{margin-bottom:4px}
.sa-price-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)}
.sa-price-row:last-child{border-bottom:0}
.sa-price-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--muted)}

@media(max-width:720px){.sa-nav{display:grid;gap:10px}.sa-brand .d-wordmark{font-size:16px}.sa-release-form{max-width:none}}
@media(prefers-reduced-motion:reduce){.sa-overlay,.sa-dialog{animation:none}}
@media(prefers-reduced-motion:reduce){.sa-spin{animation:none}}
`;
