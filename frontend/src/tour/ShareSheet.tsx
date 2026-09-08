import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import type { Flow } from "./types";
import { notify } from "../lib/notifications";
import { copyText, publicUrl } from "./tourUi";

/** A QR code as an inline SVG (theme-coloured via currentColor). */
function QrSvg({ text, size }: { text: string; size: number }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { path: d, n: count };
  }, [text]);
  return (
    <svg className="t-qr" viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="QR code for this tour">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/**
 * The publish moment (and the "Share" button afterwards): the cover in a live
 * ring, the link with copy, a QR code to open the tour on a phone, and the
 * system share sheet where the browser has one.
 */
export function ShareSheet({ flow, celebrate, onClose }: { flow: Flow; celebrate: boolean; onClose: () => void }) {
  const link = publicUrl(flow.publicPath);
  const short = link.replace(/^https?:\/\//, "");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    const ok = await copyText(link);
    setCopied(ok);
    if (!ok) notify.error("Couldn't copy the link");
  };
  const share = async () => {
    if (!canShare) return copy();
    try {
      await navigator.share({ title: flow.title || flow.name, url: link });
    } catch {
      /* the person closed the share sheet */
    }
  };

  return (
    <div className="t-sheet" onClick={onClose} role="dialog" aria-modal aria-label="Share this tour">
      <div className="t-sheet-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="t-sheet-hero">
          <div className={`t-live-ring ${celebrate ? "pulse" : ""}`}>{flow.thumb ? <img src={flow.thumb} alt="" /> : <span />}</div>
          <div style={{ minWidth: 0 }}>
            <div className="d-eyebrow">{celebrate ? "It's live" : "Share"}</div>
            <div className="t-sheet-title">{flow.title || flow.name}</div>
            <div className="d-sub" style={{ fontSize: 12.5 }}>
              Anyone with the link can walk through it{celebrate ? " now" : ""}. Changes you save show up right away.
            </div>
          </div>
        </div>
        <div className="t-sheet-link">
          <code title={link}>{short}</code>
          <button type="button" className={`d-btn sm ${copied ? "" : "primary"}`} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="t-sheet-grid">
          <div className="t-sheet-qr">
            <QrSvg text={link} size={148} />
          </div>
          <div className="t-sheet-side">
            <div className="d-label">Open it on a phone</div>
            <div className="d-sub" style={{ fontSize: 12.5 }}>
              Point the camera at the code. Tours feel best held in a hand, dragging through each stop.
            </div>
            <div className="t-actions">
              <a className="d-btn" href={flow.publicPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                Open tour
              </a>
              <button type="button" className="d-btn ghost" onClick={share}>
                {canShare ? "Share…" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
