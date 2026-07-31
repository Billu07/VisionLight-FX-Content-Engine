import { useEffect, useRef, useState } from "react";
import { getCORSProxyUrl } from "../lib/api";

type Bg = "white" | "black" | "match";
type Compare = "off" | "side" | "overlay" | "ab";

const FRAME =
  "max-h-[42vh] w-auto max-w-full object-contain rounded-lg border border-gray-700 shadow-2xl sm:max-h-[60vh] md:max-h-[80vh]";

// Auto-detect the background by averaging a ring of pixels around the border.
// More robust than four corners when the product touches an edge. Returns an
// "rgb(...)" string, or null if the canvas is tainted.
function sampleBackgroundColor(img: HTMLImageElement): string | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const at = (x: number, y: number): [number, number, number] => {
      const idx = (y * w + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2]];
    };
    const N = 48; // samples per edge
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < N; i++) {
      const fx = Math.min(w - 1, Math.round((i / (N - 1)) * (w - 1)));
      const fy = Math.min(h - 1, Math.round((i / (N - 1)) * (h - 1)));
      for (const [x, y] of [
        [fx, 0],
        [fx, h - 1],
        [0, fy],
        [w - 1, fy],
      ] as Array<[number, number]>) {
        const [pr, pg, pb] = at(x, y);
        r += pr;
        g += pg;
        b += pb;
        count++;
      }
    }
    if (!count) return null;
    return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(
      b / count,
    )})`;
  } catch {
    return null;
  }
}

/**
 * Client-side live preview of the SizeFX reverse-crop. Draws the source padded
 * with the chosen background (subject at 1/zoom, centered) onto a canvas, and —
 * when an anchor image is chosen — overlays it for size-matching via side-by-side,
 * opacity overlay, or A/B toggle. The math mirrors the server (sharp.extend) so
 * the preview matches the applied result.
 */
export function SizeFxPreview({
  srcUrl,
  anchorUrl,
  zoomOut,
  bg,
  compare,
  overlayOpacity,
  abShowAnchor,
  onToggleAb,
}: {
  srcUrl: string;
  anchorUrl?: string | null;
  zoomOut: number;
  bg: Bg;
  compare: Compare;
  overlayOpacity: number;
  abShowAnchor: boolean;
  onToggleAb?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // Cache the auto-matched background per image. Sampling reads the full image
  // via getImageData, which is expensive — it must NOT rerun on every zoom tick,
  // only when the source image itself changes.
  const matchColorRef = useRef<string>("#ffffff");

  // Load the source (CORS-safe so we can sample colors + draw without taint).
  useEffect(() => {
    let alive = true;
    setImg(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (alive) setImg(image);
    };
    image.onerror = () => {
      if (alive) setImg(null);
    };
    image.src = getCORSProxyUrl(srcUrl);
    return () => {
      alive = false;
    };
  }, [srcUrl]);

  // Sample the auto-match colour once per image (not per zoom change).
  useEffect(() => {
    matchColorRef.current = img
      ? sampleBackgroundColor(img) || "#ffffff"
      : "#ffffff";
  }, [img]);

  // Redraw whenever the source, zoom, background, OR compare mode changes.
  // `compare` matters because switching modes remounts the <canvas>, and the
  // fresh element needs to be drawn again (otherwise it shows up blank/black).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Fixed internal resolution preserving source aspect (uniform padding keeps
    // the aspect ratio; the subject just occupies 1/zoom of the frame). Falls
    // back to 4:3 before the image has loaded so we still paint the background.
    const iw = img?.naturalWidth || 4;
    const ih = img?.naturalHeight || 3;
    const LONG = 900;
    const cw = iw >= ih ? LONG : Math.round(LONG * (iw / ih));
    const ch = iw >= ih ? Math.round(LONG * (ih / iw)) : LONG;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let fill = "#ffffff";
    if (bg === "black") fill = "#000000";
    else if (bg === "match") fill = matchColorRef.current;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, cw, ch);

    if (img) {
      const scale = 1 / Math.max(1, zoomOut);
      const dw = cw * scale;
      const dh = ch * scale;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    }
  }, [img, zoomOut, bg, compare]);

  const previewCanvas = <canvas ref={canvasRef} className={FRAME} />;
  const hasAnchor = !!anchorUrl;
  const anchorImg = hasAnchor ? (
    <img
      src={getCORSProxyUrl(anchorUrl!)}
      crossOrigin="anonymous"
      className={FRAME}
      decoding="async"
    />
  ) : null;

  let content: React.ReactNode;
  if (compare === "off" || !hasAnchor) {
    content = <div className="flex items-center justify-center">{previewCanvas}</div>;
  } else if (compare === "side") {
    content = (
      <div className="flex w-full items-stretch justify-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          {previewCanvas}
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Preview
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          {anchorImg}
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Anchor
          </span>
        </div>
      </div>
    );
  } else if (compare === "overlay") {
    content = (
      <div className="relative flex items-center justify-center">
        {previewCanvas}
        <img
          src={getCORSProxyUrl(anchorUrl!)}
          crossOrigin="anonymous"
          style={{ opacity: overlayOpacity }}
          className="pointer-events-none absolute inset-0 m-auto max-h-[42vh] w-auto max-w-full object-contain sm:max-h-[60vh] md:max-h-[80vh]"
          decoding="async"
        />
      </div>
    );
  } else {
    // A/B toggle: show either the preview or the anchor in the same spot.
    content = (
      <button
        type="button"
        onClick={onToggleAb}
        className="relative flex items-center justify-center focus:outline-none"
        title="Click to toggle Preview / Anchor"
      >
        <div className={abShowAnchor ? "hidden" : "block"}>{previewCanvas}</div>
        {abShowAnchor && anchorImg}
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur">
          {abShowAnchor ? "Anchor" : "Preview"} · tap to flip
        </span>
      </button>
    );
  }

  return (
    <div className="relative flex w-full items-center justify-center">
      {content}
      {!img && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 rounded-lg bg-black/40 px-4 py-3 backdrop-blur">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            <span className="text-[11px] text-gray-300">Loading image…</span>
          </div>
        </div>
      )}
    </div>
  );
}
