/**
 * Shell for the superadmin panel (SuperAdminDashboard): grouped section tabs, the
 * sticky top bar and the panel's scoped styles, on the shared drift design system
 * (rotation3d/driftUiTheme — flat, no gradients, one light/dark toggle for the whole
 * panel, synced with the drift.li tab).
 *
 * Tabs are moved onto the design system one at a time. Until a tab is migrated it
 * keeps its original dark Tailwind styling inside `.sa-legacy` (a dark panel in light
 * mode), so switching themes never makes an old tab unreadable.
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
  "demo-leads",
  "demo",
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
/* Modals are still the original dark dialogs — keep their inherited text light. */
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

@media(max-width:720px){.sa-nav{display:grid;gap:10px}.sa-brand .d-wordmark{font-size:16px}.sa-release-form{max-width:none}}
@media(prefers-reduced-motion:reduce){.sa-overlay,.sa-dialog{animation:none}}
@media(prefers-reduced-motion:reduce){.sa-spin{animation:none}}
`;
