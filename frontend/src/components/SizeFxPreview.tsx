import { useEffect, useRef, useState } from "react";
import { getCORSProxyUrl } from "../lib/api";

type Bg = "white" | "black" | "match";
type Compare = "off" | "side" | "overlay" | "ab";

const FRAME =
  "max-h-[42vh] w-auto max-w-full object-contain rounded-lg border border-gray-700 shadow-2xl sm:max-h-[60vh] md:max-h-[80vh]";

// Average the four corner pixels of a CORS-loaded image → an "rgb(...)" string.
// Product shots are usually on a solid background, so this matches it when we
// pad the preview. Falls back to null if the canvas is tainted.
function sampleCornerColor(img: HTMLImageElement): string | null {
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
    const pts: Array<[number, number]> = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ];
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [x, y] of pts) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      r += d[0];
      g += d[1];
      b += d[2];
    }
    return `rgb(${Math.round(r / 4)},${Math.round(g / 4)},${Math.round(b / 4)})`;
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

  // Load the source once (CORS-safe so we can sample colors + draw without taint).
  useEffect(() => {
    let alive = true;
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

  // Redraw whenever the source, zoom, or background changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    // Fixed internal resolution preserving source aspect (uniform padding keeps
    // the aspect ratio; the subject just occupies 1/zoom of the frame).
    const LONG = 900;
    const cw = iw >= ih ? LONG : Math.round(LONG * (iw / ih));
    const ch = iw >= ih ? Math.round(LONG * (ih / iw)) : LONG;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let fill = "#ffffff";
    if (bg === "black") fill = "#000000";
    else if (bg === "match") fill = sampleCornerColor(img) || "#ffffff";
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, cw, ch);

    const scale = 1 / Math.max(1, zoomOut);
    const dw = cw * scale;
    const dh = ch * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }, [img, zoomOut, bg]);

  const previewCanvas = <canvas ref={canvasRef} className={FRAME} />;
  const hasAnchor = !!anchorUrl;

  if (compare === "off" || !hasAnchor) {
    return <div className="flex items-center justify-center">{previewCanvas}</div>;
  }

  const anchorImg = (
    <img
      src={getCORSProxyUrl(anchorUrl!)}
      crossOrigin="anonymous"
      className={FRAME}
      decoding="async"
    />
  );

  if (compare === "side") {
    return (
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
  }

  if (compare === "overlay") {
    return (
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
  }

  // A/B toggle: show either the preview or the anchor in the same spot.
  return (
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
