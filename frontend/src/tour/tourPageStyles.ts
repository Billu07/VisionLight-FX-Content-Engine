/**
 * Tour v2 surfaces: the page (drift.li/tour/{page}), the pathway (…/{tour}) and the
 * simplified builder. Flat and calm — no gradients — on the .drift-ui tokens.
 * Rendered next to TOUR_STYLES by the page, the pathway and the builder.
 */
export const TOUR_PAGE_STYLES = `
/* Flat surfaces (the client's brief: no gradients). */
.drift-ui[data-theme="light"].t-page::before{display:none}
.t-drop{background:color-mix(in srgb,var(--surface) 60%,transparent)}
.t-drop:hover,.t-drop.over{background:var(--accent-soft)}
.t-upgrade{background:var(--surface)}
.th-thumb .ph{background:var(--surface-3)}
.t-thumb::after,.th-thumb::after{display:none}
@media(min-width:640px){.t-route::before{background:var(--accent);opacity:.35}}

/* ── Page hero ── */
.tpg-hero{display:grid;gap:22px;align-items:center;margin-bottom:30px}
@media(min-width:900px){.tpg-hero{grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:44px}}
.tpg-brand{display:flex;align-items:center;gap:14px;min-width:0}
.tpg-logo{width:58px;height:58px;border-radius:16px;object-fit:contain;background:var(--surface);border:1px solid var(--border);padding:6px;flex:none}
.tpg-mark{width:58px;height:58px;border-radius:16px;display:grid;place-items:center;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);font-weight:800;font-size:23px;flex:none;text-transform:uppercase}
.tpg-title{margin:0;font-size:clamp(28px,4.8vw,44px);line-height:1.04;letter-spacing:-.03em;font-weight:800;color:var(--text);overflow-wrap:anywhere}
.tpg-sub{margin:12px 0 0;font-size:15px;line-height:1.55;color:var(--muted);max-width:50ch}
.tpg-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.tpg-cta .d-btn{padding:12px 18px;font-size:14px}
.tpg-linkrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.tpg-art{height:220px;display:none}
@media(min-width:900px){.tpg-art{display:block}}
.tpg-note{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);font-size:13px;color:var(--muted);margin-bottom:18px}
.tpg-note b{color:var(--text)}
.tpg-section{margin-top:30px}
.tpg-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.tpg-bar h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.01em;color:var(--text)}
.tpg-bar .d-faint{font-size:12.5px}
.tpg-empty{border:1.5px dashed var(--border-strong);border-radius:20px;padding:36px 20px;text-align:center;color:var(--muted);display:grid;gap:12px;justify-items:center}
.tpg-empty h3{margin:0;font-size:18px;font-weight:800;color:var(--text)}

/* ── Featured Tours · Path view: a straight rail, each tour one step laid out horizontally ── */
.tpg-rail{list-style:none;margin:0;padding:0;display:grid;gap:14px;position:relative}
@media(min-width:640px){
  .tpg-rail{padding-left:42px}
  .tpg-rail::before{content:"";position:absolute;left:14px;top:34px;bottom:34px;width:2px;border-radius:2px;background:var(--accent);opacity:.35}
  .tpg-row::before{content:attr(data-n);position:absolute;left:-42px;top:26px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--accent-ink);background:var(--accent);box-shadow:0 0 0 5px var(--bg)}
}
.tpg-row{position:relative;display:grid;gap:12px;grid-template-columns:minmax(0,1fr);align-items:center;padding:12px 14px;border-radius:18px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm);transition:border-color .16s}
.tpg-row:hover{border-color:var(--border-strong)}
@media(min-width:960px){.tpg-row{grid-template-columns:250px minmax(0,1fr) auto}}
.tpg-tour{display:flex;align-items:center;gap:12px;min-width:0;cursor:pointer;border-radius:12px}
.tpg-tour:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.tpg-cover{width:62px;aspect-ratio:4/5;border-radius:12px;overflow:hidden;background:var(--surface-3);flex:none}
.tpg-cover img{width:100%;height:100%;object-fit:cover;display:block}
.tpg-meta{min-width:0;display:grid;gap:5px}
.tpg-name{font-weight:800;font-size:16px;letter-spacing:-.01em;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpg-line{position:relative;display:flex;align-items:flex-start;gap:12px;overflow-x:auto;padding:4px 2px 6px;min-width:0;scrollbar-width:thin}
.tpg-line::before{content:"";position:absolute;left:24px;right:24px;top:32px;height:2px;border-radius:2px;background:var(--border-strong)}
.tpg-drift{position:relative;display:grid;justify-items:center;gap:6px;width:66px;flex:none;text-decoration:none;color:var(--muted);font-size:11px;font-weight:600}
.tpg-drift-img{position:relative;width:46px;height:58px;border-radius:11px;overflow:hidden;background:var(--surface-3);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--border-strong);transition:transform .18s,box-shadow .18s}
.tpg-drift-img img{width:100%;height:100%;object-fit:cover;display:block}
.tpg-drift-img b{position:absolute;left:3px;top:3px;font-size:9.5px;font-weight:800;color:#fff;background:rgba(0,0,0,.55);border-radius:5px;padding:0 4px;line-height:15px}
.tpg-drift:hover{color:var(--text)}
.tpg-drift:hover .tpg-drift-img{transform:translateY(-2px);box-shadow:0 0 0 2px var(--accent)}
.tpg-drift-name{max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpg-actions{display:flex;flex-wrap:wrap;gap:6px}
@media(min-width:960px){.tpg-actions{justify-content:flex-end}}

/* ── Horizontal hero route ── */
.th-route-h{width:100%;height:100%;display:block;overflow:visible;font-family:inherit}
.th-stem{stroke:var(--border-strong);stroke-width:1.5}

/* ── Pathway: one tour's menu (public view) ── */
.tpw{max-width:720px;margin:0 auto}
.tpw-brand{display:flex;align-items:center;gap:10px;margin:14px 0 6px;min-width:0;text-decoration:none;color:var(--muted);font-weight:700;font-size:14px}
.tpw-brand img{width:34px;height:34px;border-radius:10px;object-fit:contain;background:var(--surface);border:1px solid var(--border);padding:4px}
.tpw-title{margin:4px 0 0;font-size:clamp(28px,5.4vw,44px);line-height:1.04;letter-spacing:-.03em;font-weight:800;color:var(--text);overflow-wrap:anywhere}
.tpw-desc{margin:10px 0 0;color:var(--muted);font-size:15px;line-height:1.55}
.tpw-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.tpw-rail{list-style:none;margin:24px 0 0;padding:0 0 0 50px;position:relative;display:grid;gap:12px}
.tpw-rail::before{content:"";position:absolute;left:18px;top:28px;bottom:36px;width:2px;border-radius:2px;background:var(--accent);opacity:.4}
.tpw-item{position:relative}
.tpw-pin{position:absolute;left:-50px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;color:var(--accent-ink);background:var(--accent);box-shadow:0 0 0 5px var(--bg)}
.tpw-start .tpw-pin{background:var(--text);color:var(--bg)}
.tpw-startbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px 18px;border-radius:16px;font-size:15px;font-weight:750;text-decoration:none}
.tpw-strip{display:grid;grid-template-columns:78px minmax(0,1fr) auto;align-items:center;gap:14px;padding:10px 16px 10px 10px;border-radius:18px;border:1px solid var(--border);background:var(--surface);text-decoration:none;color:var(--text);box-shadow:var(--shadow-sm);transition:border-color .16s,transform .2s}
.tpw-strip:hover{border-color:var(--accent-border);transform:translateX(3px)}
.tpw-thumb{width:78px;aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:var(--surface-3)}
.tpw-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.tpw-name{font-weight:750;font-size:17px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpw-go{color:var(--faint);font-size:22px;line-height:1}
.tpw-strip:hover .tpw-go{color:var(--accent)}
.tpw-foot{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
@media(max-width:560px){
  .tpw-rail{padding-left:42px}
  .tpw-rail::before{left:15px}
  .tpw-pin{left:-42px;width:32px;height:32px;font-size:12px}
  .tpw-strip{grid-template-columns:64px minmax(0,1fr) auto;gap:12px}
  .tpw-thumb{width:64px}
}

/* ── Builder (ref4 / ref5) ── */
.t-name-row{display:flex;align-items:center;gap:6px;min-width:0}
.t-name-row .t-title-input{flex:1;min-width:0}
.t-pencil{appearance:none;border:0;background:transparent;color:var(--muted);cursor:pointer;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none;transition:color .16s,background .16s}
.t-pencil:hover{color:var(--accent);background:var(--accent-soft)}
.t-cover-pick span.lbl{position:absolute;left:0;right:0;bottom:0;top:auto;border-radius:0;font-size:9px;letter-spacing:.04em;text-transform:uppercase;text-align:center;padding:2px 0;background:rgba(0,0,0,.6)}
.t-cover-pick{width:58px}
.tpw-admin-foot{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
/* Pay per drift: the checkout bar (sticky on phones) and the upload note */
.t-checkout{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding:14px 16px;margin-bottom:16px;border-radius:18px;border:1px solid var(--warn-border);background:var(--surface);box-shadow:var(--shadow-sm)}
.t-checkout .d-h2{font-size:16px}
.t-checkout .d-sub{margin:4px 0 0}
.t-checkout .d-btn{padding:12px 18px;font-size:14px}
@media(max-width:640px){.t-checkout{position:sticky;bottom:calc(10px + env(safe-area-inset-bottom));z-index:15;box-shadow:0 18px 40px -18px rgba(0,0,0,.55)}.t-checkout .d-btn{width:100%}}
.t-drop-note{margin-top:4px;font-size:12px;font-weight:650;color:var(--accent)}
.t-chain .loop{color:var(--accent);font-weight:700}
/* ── Pro client pages + Invite a Pro ── */
.tpg-clients{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.tpg-client{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;border:1px solid var(--border);background:var(--surface);text-decoration:none;color:var(--text);box-shadow:var(--shadow-sm);transition:border-color .16s,transform .16s}
.tpg-client:hover{border-color:var(--accent-border);transform:translateY(-1px)}
.tpg-client b{display:block;font-size:15px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpg-client small{font-size:12px;color:var(--muted)}
.tpg-mark.sm{width:40px;height:40px;border-radius:12px;font-size:16px}
.tpg-invite{margin-top:18px;padding-top:16px;border-top:1px solid var(--border)}
`;
