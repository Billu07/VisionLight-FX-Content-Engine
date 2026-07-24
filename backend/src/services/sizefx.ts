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

// Average the four corner pixels. Product shots are usually on a solid
// background, so this "matches" that background when we pad around the subject.
async function sampleMatchColor(
  normalized: Buffer,
): Promise<{ r: number; g: number; b: number }> {
  try {
    const meta = await sharp(normalized).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (!w || !h) return { r: 255, g: 255, b: 255 };
    const corners = [
      { left: 0, top: 0 },
      { left: w - 1, top: 0 },
      { left: 0, top: h - 1 },
      { left: w - 1, top: h - 1 },
    ];
    let r = 0;
    let g = 0;
    let b = 0;
    for (const c of corners) {
      const px = await sharp(normalized)
        .extract({ left: c.left, top: c.top, width: 1, height: 1 })
        .raw()
        .toBuffer();
      r += px[0];
      g += px[1];
      b += px[2];
    }
    return {
      r: Math.round(r / 4),
      g: Math.round(g / 4),
      b: Math.round(b / 4),
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
