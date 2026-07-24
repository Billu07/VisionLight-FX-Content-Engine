import sharp from "sharp";

// SizeFX — server-side "reverse crop" (uncrop). Instead of an AI outpaint, we
// deterministically pad the image on all sides with a chosen background so the
// subject "zooms back" inside a larger, same-aspect-ratio canvas. This is the
// cheap/fast foundation for rotation-prep size-matching (no model render).

export type SizeFxBg = "white" | "black" | "match";

const clampZoom = (z: number): number => {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1.5;
  return Math.max(1, Math.min(3, n));
};

// Auto-detect the background by averaging thin strips along all four edges.
// Product shots are usually on a solid background, so the border mean "matches"
// that background when we pad around the subject. Averaging strips (rather than
// just the corners) is robust when the product touches an edge. Mirrors the
// client preview's border sampling so the applied result matches the preview.
async function sampleMatchColor(
  normalized: Buffer,
): Promise<{ r: number; g: number; b: number }> {
  try {
    const meta = await sharp(normalized).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (!w || !h) return { r: 255, g: 255, b: 255 };
    const strip = Math.max(1, Math.round(Math.min(w, h) * 0.03)); // ~3% border
    const regions = [
      { left: 0, top: 0, width: w, height: strip }, // top
      { left: 0, top: h - strip, width: w, height: strip }, // bottom
      { left: 0, top: 0, width: strip, height: h }, // left
      { left: w - strip, top: 0, width: strip, height: h }, // right
    ];
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const region of regions) {
      const stats = await sharp(normalized).extract(region).stats();
      const ch = stats.channels;
      if (ch.length >= 3) {
        r += ch[0].mean;
        g += ch[1].mean;
        b += ch[2].mean;
        n++;
      }
    }
    if (!n) return { r: 255, g: 255, b: 255 };
    return {
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
    };
  } catch {
    return { r: 255, g: 255, b: 255 };
  }
}

export async function buildReverseCrop(opts: {
  input: Buffer;
  zoomOut: number;
  bg: SizeFxBg;
}): Promise<Buffer> {
  const zoom = clampZoom(opts.zoomOut);

  // Normalize EXIF orientation first so extend() works off the true dimensions.
  const normalized = await sharp(opts.input).rotate().png().toBuffer();
  const meta = await sharp(normalized).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) throw new Error("Could not read image dimensions");

  // Uniform padding preserves the source aspect ratio — the subject simply
  // occupies 1/zoom of the frame.
  const newW = Math.round(w * zoom);
  const newH = Math.round(h * zoom);
  const left = Math.round((newW - w) / 2);
  const right = Math.max(0, newW - w - left);
  const top = Math.round((newH - h) / 2);
  const bottom = Math.max(0, newH - h - top);

  let background: sharp.Color;
  if (opts.bg === "black") {
    background = { r: 0, g: 0, b: 0, alpha: 1 };
  } else if (opts.bg === "match") {
    const c = await sampleMatchColor(normalized);
    background = { r: c.r, g: c.g, b: c.b, alpha: 1 };
  } else {
    background = { r: 255, g: 255, b: 255, alpha: 1 };
  }

  return sharp(normalized)
    .extend({ top, bottom, left, right, background })
    .png()
    .toBuffer();
}
