/**
 * Tour pins: labelled spots on a drift that follow their place in the footage. Shared by
 * the player (SpinViewer) and the pin editor, so a pin sits in exactly the same place in
 * both. Positions are fractions of the rendered frame (0..1), like captions.
 */

/** Where the creator moved a pin on another frame (fine-tuning). */
export type PinKey = { f: number; x: number; y: number };

export type SpinPin = {
  id?: string;
  /** the frame it was placed on */
  frame: number;
  x: number;
  y: number;
  keys?: PinKey[] | null;
  title: string;
  note?: string | null;
};

/** How the footage moves: the scene's cumulative shift per frame along the drift axis, as
 *  a fraction of the frame. null → unknown, so pins follow their fine-tuning only. */
export type PinTrack = { axis: "x" | "y"; shift: number[] } | null;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Without a track, a pin shows this many frames either side of where it was placed / tuned. */
const UNTRACKED_REACH = 10;
/** Pins fade out over this last stretch before their spot leaves the frame. */
const EDGE_FADE = 0.04;

/** Where a pin sits on `frame`, and whether (and how strongly) it shows there. */
export function pinPlacement(pin: SpinPin, frame: number, track: PinTrack, frameCount: number) {
  const last = Math.max(0, frameCount - 1);
  const f = clamp(Math.round(frame), 0, last);
  const anchor = clamp(Math.round(pin.frame), 0, last);
  const shift = track && Array.isArray(track.shift) && track.shift.length === frameCount ? track.shift : null;
  const along = (at: number) => {
    if (!shift || !track) return { x: pin.x, y: pin.y };
    const d = shift[at] - shift[anchor];
    return track.axis === "y" ? { x: pin.x, y: pin.y + d } : { x: pin.x + d, y: pin.y };
  };

  // The creator's fine-tuning: offsets from the path at the frames they moved it on,
  // blended between those frames (none where it was placed) and held past the outermost.
  const pts = [{ f: anchor, dx: 0, dy: 0 }];
  for (const k of pin.keys || []) {
    const kf = clamp(Math.round(k.f), 0, last);
    if (kf === anchor) continue;
    const base = along(kf);
    pts.push({ f: kf, dx: k.x - base.x, dy: k.y - base.y });
  }
  pts.sort((a, b) => a.f - b.f);
  const first = pts[0];
  const end = pts[pts.length - 1];
  let dx = first.dx;
  let dy = first.dy;
  if (f >= end.f) {
    dx = end.dx;
    dy = end.dy;
  } else if (f > first.f) {
    for (let i = 1; i < pts.length; i++) {
      if (f <= pts[i].f) {
        const a = pts[i - 1];
        const b = pts[i];
        const t = (f - a.f) / Math.max(1, b.f - a.f);
        dx = a.dx + (b.dx - a.dx) * t;
        dy = a.dy + (b.dy - a.dy) * t;
        break;
      }
    }
  }

  const base = along(f);
  const x = base.x + dx;
  const y = base.y + dy;
  const margin = Math.min(x, 1 - x, y, 1 - y);
  let visible = margin >= -0.005;
  if (!shift) visible = visible && f >= first.f - UNTRACKED_REACH && f <= end.f + UNTRACKED_REACH;
  const fade = visible ? clamp((margin + 0.005) / EDGE_FADE, 0, 1) : 0;
  return { x, y, visible, fade };
}
