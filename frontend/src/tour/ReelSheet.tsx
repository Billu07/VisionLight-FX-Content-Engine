import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { notify } from "../lib/notifications";
import type { Flow, ReelLayout, TourReel } from "./types";
import { Spinner, apiError } from "./tourUi";
import { timeAgo } from "./timeAgo";

/**
 * The tour as a vertical video (Instagram Reels, TikTok, YouTube Shorts), in two layouts:
 * Full screen (every drift fills the phone, sweeping across the space) or Framed (the whole
 * shot over a soft blurred background). Make it, watch it, download it or share it straight to
 * an app. The server renders it (about a minute, longer while clips are building); this sheet
 * checks back while it's open, and closing it doesn't stop the render.
 */

const POLL_MS = 4000;

const LAYOUTS: { value: ReelLayout; label: string; hint: string }[] = [
  { value: "full", label: "Full screen", hint: "Every drift fills the phone screen, sweeping across the space the way the camera moves." },
  { value: "framed", label: "Framed", hint: "The whole shot stays in view, over a soft blurred copy of itself." },
];

const REEL_CSS = `
.rs-overlay{z-index:80}
.t-sheet-card.rs-card{max-width:560px;max-height:94dvh;overflow:auto}
.rs-head{padding-right:36px}
.rs-layouts{display:grid;gap:6px}
.rs-layouts .d-tabs{justify-self:start;max-width:100%}
.rs-hint{font-size:12.5px;line-height:1.45}
.rs-stage{display:grid;place-items:center;padding:12px;border-radius:18px;background:var(--surface-3)}
.rs-frame{position:relative;width:min(100%,300px);max-height:62dvh;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:#0b0f19;display:grid;place-items:center;color:#cbd5e1;text-align:center}
.rs-frame video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
.rs-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.3}
.rs-note{position:relative;display:grid;gap:8px;justify-items:center;padding:18px;font-size:13px;line-height:1.45}
.rs-note b{font-size:15px;color:#fff}
.rs-meta{font-size:12.5px;color:var(--muted)}
`;

export function ReelSheet({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [layout, setLayout] = useState<ReelLayout>("full");
  const [reel, setReel] = useState<TourReel | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState<"download" | "share" | null>(null);
  const fileRef = useRef<File | null>(null);
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const fileName = `${flow.slug || "tour"}-reel${layout === "framed" ? "-framed" : ""}.mp4`;
  const hint = LAYOUTS.find((l) => l.value === layout)?.hint || "";

  // Load this layout's reel, and keep checking while it renders.
  useEffect(() => {
    let alive = true;
    let timer = 0;
    setReel(null);
    const poll = async () => {
      try {
        const r = await apiEndpoints.driftTourReel(flow.id, layout);
        if (!alive) return;
        const next: TourReel = r.data.reel;
        setReel(next);
        if (next?.status === "RENDERING") timer = window.setTimeout(poll, POLL_MS);
      } catch (e) {
        if (alive) notify.error(apiError(e));
      }
    };
    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [flow.id, layout, pollKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Another video (or layout) → forget the file fetched for sharing.
  useEffect(() => {
    fileRef.current = null;
  }, [reel?.url, layout]);

  const make = async () => {
    setStarting(true);
    try {
      const r = await apiEndpoints.driftStartTourReel(flow.id, layout);
      setReel(r.data.reel);
      setPollKey((k) => k + 1);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setStarting(false);
    }
  };

  const getFile = async () => {
    if (fileRef.current) return fileRef.current;
    const r = await apiEndpoints.driftTourReelFile(flow.id, layout);
    fileRef.current = new File([r.data as Blob], fileName, { type: "video/mp4" });
    return fileRef.current;
  };

  const download = async () => {
    setSaving("download");
    try {
      const file = await getFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      notify.error(apiError(e, "Couldn't download the reel"));
    } finally {
      setSaving(null);
    }
  };

  const share = async () => {
    setSaving("share");
    try {
      const file = await getFile();
      if (!navigator.canShare?.({ files: [file] })) {
        notify.error("This browser can't share videos — use Download instead.");
        return;
      }
      await navigator.share({ files: [file], title: flow.title || flow.name });
    } catch (e: any) {
      if (e?.name === "AbortError") return; // closed the share sheet
      // Some phones only allow sharing right after a tap; the video is ready now.
      if (e?.name === "NotAllowedError") notify.info("The video is ready — tap Share again.");
      else notify.error(apiError(e, "Couldn't share the reel"));
    } finally {
      setSaving(null);
    }
  };

  const status = reel?.status;

  return (
    <div className="t-sheet rs-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Tour reel">
      <style>{REEL_CSS}</style>
      <div className="t-sheet-card rs-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="rs-head">
          <div className="d-eyebrow">Reel</div>
          <div className="t-sheet-title">{flow.title || flow.name}</div>
          <div className="d-sub" style={{ fontSize: 12.5 }}>
            A vertical video of this tour for Instagram Reels, TikTok and YouTube Shorts. It ends with the tour's link and a QR code.
          </div>
        </div>

        <div className="rs-layouts">
          <div className="d-tabs" role="tablist" aria-label="Reel layout">
            {LAYOUTS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="tab"
                aria-selected={layout === l.value}
                className={`d-tab ${layout === l.value ? "active" : ""}`}
                onClick={() => setLayout(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="d-faint rs-hint">{hint}</div>
        </div>

        <div className="rs-stage">
          <div className="rs-frame">
            {status === "READY" && reel?.url ? (
              <video key={reel.url} src={reel.url} controls playsInline muted loop preload="metadata" poster={flow.thumb || undefined} />
            ) : (
              <>
                {flow.thumb && <img className="rs-cover" src={flow.thumb} alt="" />}
                <div className="rs-note" aria-live="polite">
                  {!reel ? (
                    <Spinner />
                  ) : status === "RENDERING" ? (
                    <>
                      <Spinner />
                      <b>Making your reel…</b>
                      <span>Usually about a minute. You can close this — it keeps going.</span>
                    </>
                  ) : status === "FAILED" ? (
                    <>
                      <b>That didn't work</b>
                      <span>{reel.error || "Please try again."}</span>
                    </>
                  ) : (
                    <>
                      <b>No {layout === "full" ? "full-screen" : "framed"} reel yet</b>
                      <span>
                        {reel.drifts} {reel.drifts === 1 ? "drift plays" : "drifts play"} through, one after another.
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {status === "READY" && reel && (
          <div className="rs-meta">
            {reel.seconds ? `${Math.round(reel.seconds)} seconds · ` : ""}made {timeAgo(reel.renderedAt)}
            {reel.stale ? " · the tour has changed since" : ""}
          </div>
        )}

        <div className="t-actions">
          {status === "READY" && reel && (
            <>
              <button type="button" className="d-btn primary" onClick={() => void download()} disabled={!!saving}>
                {saving === "download" ? "Preparing…" : "Download"}
              </button>
              {canShareFiles && (
                <button type="button" className="d-btn" onClick={() => void share()} disabled={!!saving}>
                  {saving === "share" ? "Preparing…" : "Share…"}
                </button>
              )}
              {reel.stale && (
                <button type="button" className="d-btn ghost" onClick={() => void make()} disabled={starting}>
                  {starting ? "Starting…" : "Make a new reel"}
                </button>
              )}
            </>
          )}
          {(status === "NONE" || status === "FAILED") && (
            <button type="button" className="d-btn primary" onClick={() => void make()} disabled={starting}>
              {starting ? "Starting…" : status === "FAILED" ? "Try again" : "Make the reel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
