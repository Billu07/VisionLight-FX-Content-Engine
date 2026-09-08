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
.t-page .d-btn.primary{background:var(--accent);color:var(--accent-ink);border:0;box-shadow:0 10px 26px -14px rgba(34,211,238,.5);transition:transform .16s,filter .16s,box-shadow .16s}
.t-page .d-btn.primary:hover{filter:brightness(1.05);transform:translateY(-1px);background:var(--accent)}
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
/* ── Stop card (builder): a proper workstation card ── */
.t-step{grid-template-columns:1fr;gap:16px;padding:16px;position:relative;transition:border-color .2s,box-shadow .25s,transform .25s}
@media(min-width:680px){.t-step{grid-template-columns:168px minmax(0,1fr)}}
.t-step.is-selected{border-color:var(--accent-border);box-shadow:0 0 0 3px var(--accent-soft),0 24px 48px -30px rgba(0,0,0,.6)}
.t-step-media{display:grid;gap:10px;align-content:start}
.t-step-thumb{aspect-ratio:4/5;border-radius:16px}
.t-building{display:grid;gap:8px;justify-items:center}
.t-previewing{position:absolute;left:8px;bottom:8px;z-index:1;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:var(--accent);color:var(--accent-ink)}
.t-step-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}
.t-tip{font-size:11.5px;line-height:1.4}
.t-step-body{display:grid;gap:14px;min-width:0}
.t-step-head{margin-bottom:0}
.t-step-title{display:grid;gap:4px;flex:1 1 240px;min-width:0}
.t-title-input{width:100%;background:transparent;border:0;border-bottom:1px solid var(--border);padding:6px 0;font:inherit;font-size:20px;font-weight:800;letter-spacing:-.01em;color:var(--text);outline:none;transition:border-color .16s}
.t-title-input:focus{border-bottom-color:var(--accent)}
.t-title-input::placeholder{color:var(--faint);font-weight:700}
.t-fields.fluid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 14px}
.t-field{min-width:0}
.t-seg{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);max-width:100%}
.t-seg-btn{appearance:none;border:0;background:transparent;color:var(--muted);cursor:pointer;display:grid;place-items:center;gap:1px;min-width:52px;padding:6px 8px;border-radius:9px;font:inherit;font-size:16px;line-height:1;transition:all .16s}
.t-seg-btn small{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.t-seg-btn:hover{color:var(--text)}
.t-seg-btn.on{background:var(--surface);color:var(--accent);box-shadow:var(--shadow-sm)}
.t-chips{display:flex;flex-wrap:wrap;gap:6px}
.t-chip-btn{appearance:none;cursor:pointer;font:inherit;font-size:12px;font-weight:650;padding:7px 11px;border-radius:999px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);transition:all .16s}
.t-chip-btn:hover{color:var(--text);border-color:var(--border-strong)}
.t-chip-btn.on{background:var(--accent-soft);border-color:var(--accent-border);color:var(--accent)}
.t-switch{position:relative;display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px;color:var(--text)}
.t-switch input{position:absolute;opacity:0;width:0;height:0}
.t-switch i{width:40px;height:22px;border-radius:999px;background:var(--surface-3);border:1px solid var(--border-strong);position:relative;transition:background .18s,border-color .18s;flex:none}
.t-switch i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .18s cubic-bezier(.2,.7,.2,1);box-shadow:0 1px 3px rgba(0,0,0,.35)}
.t-switch input:checked+i{background:var(--accent);border-color:transparent}
.t-switch input:checked+i::after{transform:translateX(18px)}
.t-switch small{display:block;font-size:11.5px;color:var(--muted)}
.t-field-row{display:flex;align-items:end;padding-bottom:4px}
.t-step-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;border-top:1px solid var(--border)}
.t-unsaved{font-size:12px;color:var(--faint);transition:color .16s}
.t-unsaved.on{color:var(--warn)}
/* Path view (builder): compact rows, expand one at a time, drag or arrow to reorder */
.t-path-item{display:grid;gap:8px}
.t-path-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px;border-radius:16px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:border-color .16s,box-shadow .2s,transform .2s,opacity .16s;box-shadow:var(--shadow-sm)}
.t-path-row:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.t-path-row.is-selected{border-color:var(--accent-border)}
.t-path-item.is-open>.t-path-row{border-color:var(--accent-border);box-shadow:0 0 0 3px var(--accent-soft)}
.t-path-row.dragging{opacity:.45}
.t-path-row.over{outline:2px dashed var(--accent-border);outline-offset:2px}
.t-path-thumb{width:48px;aspect-ratio:3/4;border-radius:10px;overflow:hidden;background:var(--surface-3);display:grid;place-items:center;color:var(--faint);font-size:12px}
.t-path-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.t-path-main{display:grid;gap:4px;min-width:0}
.t-path-name{font-weight:700;font-size:15px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t-path-side{display:flex;align-items:center;gap:8px}
.t-chevron{display:inline-block;color:var(--faint);transition:transform .2s;font-size:14px}
.t-chevron.open{transform:rotate(180deg);color:var(--accent)}
.t-path-expand{margin:0 0 6px}
.t-path-expand .t-route-item::before{display:none}
@media(max-width:560px){.t-path-row{grid-template-columns:44px minmax(0,1fr) auto;padding:10px}.t-path-side .t-arrows{display:none}}
/* Cover picker (tour settings) */
.t-cover{display:grid;gap:14px;grid-template-columns:1fr;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)}
@media(min-width:640px){.t-cover{grid-template-columns:120px minmax(0,1fr)}}
.t-cover-current{aspect-ratio:4/5;border-radius:14px;overflow:hidden;background:var(--surface-3);display:grid;place-items:center;color:var(--faint);font-size:12px}
.t-cover-current img{width:100%;height:100%;object-fit:cover;display:block}
.t-cover-controls{display:grid;gap:10px;align-content:start}
.t-cover-picks{display:flex;flex-wrap:wrap;gap:8px}
.t-cover-pick{position:relative;width:48px;aspect-ratio:3/4;border-radius:10px;overflow:hidden;border:2px solid transparent;padding:0;background:var(--surface-3);cursor:pointer;transition:border-color .16s,transform .16s}
.t-cover-pick img{width:100%;height:100%;object-fit:cover;display:block}
.t-cover-pick span{position:absolute;left:4px;top:4px;font-size:10px;font-weight:800;color:#fff;background:rgba(0,0,0,.55);border-radius:6px;padding:1px 5px}
.t-cover-pick.on{border-color:var(--accent)}
.t-cover-pick:hover{transform:translateY(-1px)}
/* ── Creator studio home ── */
.th-hero{display:grid;gap:22px;align-items:center;margin-bottom:26px}
@media(min-width:900px){.th-hero{grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:36px}}
.th-title{margin:10px 0 12px;font-size:clamp(30px,5vw,46px);line-height:1.02;letter-spacing:-.03em;font-weight:800;color:var(--text)}
.th-title span{display:block;margin-top:8px;font-size:clamp(17px,2.3vw,23px);font-weight:600;letter-spacing:-.01em;color:var(--muted)}
.th-cta{padding:13px 20px;font-size:14.5px}
.th-ghost{padding:13px 18px;font-size:14px}
.th-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.th-art{position:relative;height:300px;display:none}
@media(min-width:900px){.th-art{display:block}}
.th-phone{position:absolute;width:150px;aspect-ratio:9/16;border-radius:24px;border:1px solid var(--border-strong);background:linear-gradient(165deg,var(--surface-3),var(--surface));box-shadow:0 40px 70px -40px rgba(0,0,0,.7);overflow:hidden;animation:th-float 7s ease-in-out infinite}
.th-phone i{position:absolute;inset:10px;border-radius:18px;background:radial-gradient(70% 60% at 30% 25%,var(--accent-soft),transparent 70%),linear-gradient(180deg,transparent,var(--surface-2))}
.th-phone::after{content:"";position:absolute;left:50%;bottom:16px;width:44%;height:6px;border-radius:3px;background:var(--accent);opacity:.8;transform:translateX(-50%)}
.th-phone-1{left:6%;top:40px;rotate:-8deg}
.th-phone-2{left:36%;top:0;animation-delay:-2.3s;z-index:1}
.th-phone-3{left:64%;top:56px;rotate:9deg;animation-delay:-4.6s}
@keyframes th-float{0%,100%{translate:0 0}50%{translate:0 -10px}}
@media(prefers-reduced-motion:reduce){.th-phone{animation:none}}
.th-create{margin-bottom:22px;display:grid;gap:10px}
.th-first{display:grid;gap:18px;padding:clamp(22px,4vw,34px);margin-bottom:24px}
@media(min-width:900px){.th-first{grid-template-columns:1fr 1.2fr auto;align-items:center}}
.th-first h2{margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
.th-steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.th-steps li{display:flex;gap:12px;align-items:flex-start;font-size:14px;color:var(--text)}
.th-steps li b{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;flex:none;background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-border);font-size:12px}
.th-steps li span{display:block;font-size:12.5px;color:var(--muted)}
.th-shelf-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}
.th-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.th-item{border:1px solid var(--border);border-radius:22px;background:var(--surface);overflow:hidden;cursor:pointer;transition:transform .25s cubic-bezier(.2,.7,.2,1),border-color .2s,box-shadow .25s;box-shadow:0 1px 2px rgba(0,0,0,.18),0 18px 40px -28px rgba(0,0,0,.55)}
.th-item:hover{transform:translateY(-4px);border-color:var(--accent-border);box-shadow:0 30px 60px -32px rgba(0,0,0,.65)}
.th-thumb{position:relative;aspect-ratio:4/5;background:var(--surface-3);overflow:hidden}
.th-thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.th-item:hover .th-thumb img{transform:scale(1.04)}
.th-thumb .ph{position:absolute;inset:0;display:grid;place-items:center;color:var(--faint);font-size:12px;padding:14px;text-align:center;background:linear-gradient(135deg,var(--accent-soft),transparent 60%)}
.th-glass{position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(6,10,20,.55);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.1)}
.drift-ui[data-theme="light"] .th-glass{background:rgba(255,255,255,.74);border-color:rgba(15,23,42,.1)}
.th-name{font-weight:700;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drift-ui[data-theme="light"] .th-name{color:#14203a}
.th-body{padding:12px 14px 14px;display:grid;gap:9px}
.th-play{position:absolute;left:50%;top:50%;width:54px;height:54px;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center;background:rgba(6,10,20,.55);border:1px solid rgba(255,255,255,.2);color:#fff;backdrop-filter:blur(8px)}
.th-new{border:1.5px dashed var(--border-strong);border-radius:22px;background:color-mix(in srgb,var(--surface) 50%,transparent);min-height:260px;display:grid;place-items:center;align-content:center;gap:8px;color:var(--muted);font:inherit;font-weight:700;cursor:pointer;transition:border-color .16s,background .16s}
.th-new:hover{border-color:var(--accent-border);background:var(--accent-soft);color:var(--text)}
.th-new span{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);font-size:22px}
`;

/** Page chrome: wordmark → home, theme toggle, log out. */
export function TourShell({ children }: { children: React.ReactNode }) {
  const { user, profiles, logout } = useAuth();
  const [theme, toggleTheme] = useDriftTheme();
  const navigate = useNavigate();
  const canSwitch = profiles.length > 1;
  const isSuperAdmin = user?.role === "SUPERADMIN";
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
          {isSuperAdmin && (
            <Link to="/admin" className="d-btn sm" style={{ textDecoration: "none" }} title="Open the admin panel">
              Admin
            </Link>
          )}
          {canSwitch && (
            <button onClick={() => navigate("/studios")} className="d-btn sm" title="Choose another workspace">
              Switch studio
            </button>
          )}
          <button onClick={out} className="d-btn ghost sm">
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
