/**
 * Optical alignment for a big name with a small line under it — the page's own name and the
 * "Tours" beneath it (client's align.png, 2026-10-07).
 *
 * Nothing in the CSS moves them apart: both sit at the same box edge. What separates them is each
 * glyph's own LEFT SIDE BEARING, the blank a font carries before its ink, which scales with type
 * size — a 44px "D" sits ~3px inside its box while the 11px "T" below sits a fraction of that
 * inside its own. A constant nudge cannot fix it either: the name belongs to the creator and
 * every first letter carries a different bearing ("D" wants 3px, "O" wants 2px).
 *
 * So it is measured — and measured by DRAWING, because two cleverer ways both failed:
 *
 *  · `measureText().actualBoundingBoxLeft` is not on every engine's TextMetrics, and a canvas
 *    font SHORTHAND silently refuses to parse family stacks some engines dislike (`ui-sans-serif`,
 *    `system-ui`). Either failure makes both glyphs measure 0, the difference 0, and no nudge is
 *    applied — a no-op indistinguishable from the original bug. That is what shipped first and
 *    what the client reported as doing nothing (2026-10-08).
 *  · SVG `getBBox()` on a text node returns the LAYOUT box, not the ink, so it reported ~0 for a
 *    bearing of 3px and made the alignment worse rather than better. Measured, not assumed.
 *
 * Drawing the glyph and finding its first inked column cannot be wrong about what it is looking
 * at. The one remaining fragility — the canvas font string — is handled by quoting a single
 * family and reading `ctx.font` back to confirm the engine accepted it; if it did not, nothing is
 * guessed and the proportional fallback takes over.
 */

/** A sans-serif capital's left side bearing is about this share of its type size. */
const TYPICAL_BEARING_EM = 0.05;

/**
 * How far the first glyph's INK sits from where the text begins, in CSS px, or null when the
 * engine would not answer. Draws the glyph and finds its leftmost inked column.
 */
function inkOffset(el: HTMLElement): number | null {
  const ch = (el.textContent || "").trim().charAt(0);
  if (!ch) return null;
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize);
  if (!size || !isFinite(size)) return null;

  // One family, quoted, plus a generic: the stack as written is what some engines refuse.
  const family = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const italic = cs.fontStyle === "italic" || cs.fontStyle === "oblique" ? "italic " : "";
  const font = `${italic}${cs.fontWeight} ${size}px "${family}", sans-serif`;

  // Drawn at SS samples per CSS pixel. One sample per pixel rounds each bearing to a whole
  // pixel, and the difference between two roundings is where the client's missing pixel went
  // (ref12): their title sits at the clamp's floor, where the whole difference is only ~1.4px.
  // Four samples puts the error at a quarter of a pixel, well under anything an eye can hold.
  const SS = 4;
  const pad = Math.ceil(size); // room on the left for the bearing, and for anything that overhangs
  const w = Math.ceil(size * 2) + pad * 2;
  const h = Math.ceil(size * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w * SS;
  canvas.height = h * SS;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SS, SS);
  ctx.font = font;
  // An engine that would not parse the string leaves ctx.font at what it was. Ask it back.
  if (!ctx.font || ctx.font.indexOf(`${size}px`) === -1) return null;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  ctx.fillText(ch, pad, Math.round(h * 0.75));

  const W = w * SS;
  const H = h * SS;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return null; // a locked-down canvas
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      // A high bar on purpose: antialiasing throws a faint tail to the left of the real edge,
      // and the two glyphs are different sizes, so their tails are different lengths. Asking
      // for solid ink measures the same thing on both.
      if (data[(y * W + x) * 4 + 3] > 140) return x / SS - pad;
    }
  }
  return null; // nothing was drawn — a font that has not arrived yet
}

/**
 * Line the small line's first glyph up under the big one's. Returns the nudge applied, in px, so
 * a caller (or a test) can see what it decided.
 */
export function alignFirstGlyphs(big: HTMLElement | null, small: HTMLElement | null): number {
  if (!big || !small) return 0;
  const a = inkOffset(big);
  const b = inkOffset(small);
  let dx: number;
  if (a !== null && b !== null) {
    dx = a - b;
  } else {
    // Nothing could be measured. Both bearings are still roughly proportional to their type
    // size, so the difference between them is roughly proportional to the difference in size:
    // never more than a pixel or so out, and far better than leaving it alone.
    const sizeOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) || 0;
    dx = (sizeOf(big) - sizeOf(small)) * TYPICAL_BEARING_EM;
  }
  small.style.marginLeft = Math.abs(dx) < 0.3 ? "" : `${dx.toFixed(2)}px`;
  return dx;
}
