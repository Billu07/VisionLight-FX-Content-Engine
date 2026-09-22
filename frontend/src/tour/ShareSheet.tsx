import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import type { Flow, Page } from "./types";
import { apiEndpoints } from "../lib/api";
import { notify } from "../lib/notifications";
import { apiError, copyText, publicUrl } from "./tourUi";
import { PrintKit } from "./PrintKit";
import { ReelSheet } from "./ReelSheet";
import { PersonalLinks } from "./PersonalLinks";

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
export function ShareSheet({
  flow,
  celebrate,
  onClose,
  canManageLinks = false,
  page = null,
}: {
  flow: Flow;
  celebrate: boolean;
  onClose: () => void;
  /** Editors and Admins: personal links, the unbranded link and the print kit */
  canManageLinks?: boolean;
  /** the page (its name and logo go on printed pieces) */
  page?: Page | null;
}) {
  const link = publicUrl(flow.publicPath);
  const short = link.replace(/^https?:\/\//, "");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const [printOpen, setPrintOpen] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);
  const [ubPath, setUbPath] = useState<string | null>(flow.unbrandedPath ?? null);
  const [ubBusy, setUbBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !printOpen && !reelOpen && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, printOpen, reelOpen]);

  // The unbranded (MLS-safe) link: made the first time it's asked for, then kept.
  const ensureUnbranded = async (): Promise<string | null> => {
    if (ubPath) return ubPath;
    setUbBusy(true);
    try {
      const r = await apiEndpoints.driftCreateUnbrandedLink(flow.id);
      const made = typeof r.data?.path === "string" ? (r.data.path as string) : null;
      setUbPath(made);
      return made;
    } catch (e) {
      notify.error(apiError(e));
      return null;
    } finally {
      setUbBusy(false);
    }
  };
  const copyUnbranded = async () => {
    const made = await ensureUnbranded();
    if (!made) return;
    const ok = await copyText(publicUrl(made));
    notify[ok ? "success" : "error"](ok ? "Unbranded Link Copied" : "Couldn't Copy the Link");
  };

  const copy = async () => {
    const ok = await copyText(link);
    setCopied(ok);
    if (!ok) notify.error("Couldn't Copy the Link");
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
    <>
      <div className="t-sheet" onClick={onClose} role="dialog" aria-modal aria-label="Share this tour">
        <div className="t-sheet-card t-share-card" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
            ×
          </button>
          <div className="t-sheet-hero">
            <div className={`t-live-ring ${celebrate ? "pulse" : ""}`}>{flow.thumb ? <img src={flow.thumb} alt="" /> : <span />}</div>
            <div style={{ minWidth: 0 }}>
              <div className="d-eyebrow">{celebrate ? "It's Live" : "Share"}</div>
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
              <div className="d-label">Open It on a Phone</div>
              <div className="d-sub" style={{ fontSize: 12.5 }}>
                Point the camera at the code. Tours feel best held in a hand, dragging through each stop.
              </div>
              <div className="t-actions">
                <a className="d-btn" href={flow.publicPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  Open Tour
                </a>
                <button type="button" className="d-btn ghost" onClick={share}>
                  {canShare ? "Share…" : "Copy Link"}
                </button>
              </div>
            </div>
          </div>
          {canManageLinks && flow.status === "PUBLISHED" && (
            <div className="t-share-more">
              <div className="t-share-row">
                <span className="grow">
                  <b>Unbranded Link</b>
                  <small>For Listing Sites (MLS) That Don't Allow Names, Logos or Contact Buttons.</small>
                </span>
                <button type="button" className="d-btn sm" onClick={() => void copyUnbranded()} disabled={ubBusy}>
                  {ubBusy ? "Making…" : ubPath ? "Copy" : "Get Link"}
                </button>
              </div>
              <div className="t-share-row">
                <span className="grow">
                  <b>Print Kit</b>
                  <small>A flyer, a window sign and QR cards — print them or save a PDF.</small>
                </span>
                <button type="button" className="d-btn sm" onClick={() => setPrintOpen(true)}>
                  Open
                </button>
              </div>
              <div className="t-share-row">
                <span className="grow">
                  <b>Reel</b>
                  <small>A video of the tour: portrait for Reels, TikTok and Shorts, or landscape for YouTube and Facebook.</small>
                </span>
                <button type="button" className="d-btn sm" onClick={() => setReelOpen(true)}>
                  Open
                </button>
              </div>
            </div>
          )}
          {canManageLinks && flow.status === "PUBLISHED" && <PersonalLinks flow={flow} />}
        </div>
      </div>
      {printOpen && (
        <PrintKit flow={flow} page={page} unbrandedPath={ubPath} ensureUnbranded={ensureUnbranded} onClose={() => setPrintOpen(false)} />
      )}
      {reelOpen && <ReelSheet flow={flow} onClose={() => setReelOpen(false)} />}
    </>
  );
}
