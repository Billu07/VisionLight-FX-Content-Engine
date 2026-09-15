import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "node:path";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Auto clean-up for tour clips (TOUR_V2_PLAN.md, phase 5). Planned from a tiny grayscale copy
 * of every extracted frame that comes out of the same ffmpeg pass as the frames themselves (no
 * second decode), then applied while the frames are saved. Three fixes, each only when the
 * measurement is clear:
 * - direction: which way the camera pans (the scene's net shift along x or y);
 * - still ends: the frames before the pan gets going and after it stops are dropped (two are
 *   kept), so a drag never starts or ends in a dead zone;
 * - shake: the scene's path through the clip is smoothed and every frame is re-cropped by a
 *   small margin to follow it (translation only).
 * Anything unclear — a walk-through that zooms, a screen recording, a cut, a clip that doesn't
 * pan — keeps the clip exactly as uploaded. Shifts are found coarse-to-fine (half size, then
 * full size), and planning yields to the event loop every few milliseconds so the API stays
 * responsive while a clip builds. Tested on synthetic pans with known answers.
 */

export const ANALYSIS_SIZE = 256;
export const ANALYSIS_FILE = "analysis.gray";

const S = ANALYSIS_SIZE;
const HALF = S / 2;
const EXTRACT_TIMEOUT_MS = 300000;
/** direction: sampled pairs across the clip, and the most the scene may move between two */
const AXIS_SAMPLES = 24;
const AXIS_MAX_SHIFT = 0.3;
/** neighbouring frames: along the pan, and across it */
const PAIR_MAX_ALONG = 0.12;
const PAIR_MAX_ACROSS = 0.05;
/** the best match must score under 80% of the median mismatch */
const MIN_CONTRAST = 0.8;
/** a pan has to cover 20% of the frame, mostly one way, measured on most samples */
const MIN_TRAVEL = 0.2;
const MIN_CONSISTENCY = 0.75;
const MIN_RELIABLE = 0.75;
/** still = within 2% of the pan (at least 0.4% of the frame) of the end frame … */
const STILL_SHARE = 0.02;
const STILL_MIN = 0.004;
/** … until the motion holds for 3 frames; 2 still frames stay at each end */
const STILL_RUN = 3;
const KEEP_STILL = 2;
const MIN_TRIM = 4;
const MAX_TRIM_SHARE = 0.4;
const MIN_KEEP_SHARE = 0.3;
const MIN_KEEP_FRAMES = 12;
/** shake worth steadying (rms of the jitter, share of the frame) and the most we'll crop */
const SHAKE_MIN_RMS = 0.0015;
const MIN_MARGIN = 0.01;
const MAX_MARGIN = 0.06;
/** the longest stretch of planning between two yields to the event loop */
const YIELD_MS = 20;

export type PanDirection = "LTR" | "RTL" | "TTB" | "BTT";
type Axis = "x" | "y";
type Frame = { full: Float32Array; half: Float32Array };

export type CleanupReport = {
  v: 1;
  direction: PanDirection | null;
  trimmedStart: number;
  trimmedEnd: number;
  /** seconds of footage trimmed at each end */
  trimmedStartS: number;
  trimmedEndS: number;
  steadied: boolean;
  /** the jitter before steadying: rms, % of the frame */
  shake: number;
  /** frames kept */
  frames: number;
};

export type SteadyCrop = {
  /** share of each side cropped away */
  margin: number;
  /** per kept frame: how far the crop window shifts (share of the frame) */
  dx: number[];
  dy: number[];
};

export type CleanupPlan = {
  /** the frames kept, inclusive */
  start: number;
  end: number;
  direction: PanDirection | null;
  steady: SteadyCrop | null;
  report: CleanupReport;
};

/**
 * One ffmpeg pass for a tour clip: the frames as PNG (exactly as the standard extraction) plus
 * a 256×256 grayscale copy of each in one raw file for planning the clean-up.
 */
export const extractFramesForCleanup = (input: string, outDir: string, fps: number): Promise<void> =>
  new Promise((resolve, reject) => {
    let stderr = "";
    const cmd = ffmpeg(input)
      .complexFilter([`[0:v]fps=${fps},split=2[full][small]`, `[small]scale=${S}:${S}:flags=area,format=gray[gray]`])
      .output(path.join(outDir, "f_%04d.png"))
      .outputOptions(["-map", "[full]", "-an", "-y"])
      .output(path.join(outDir, ANALYSIS_FILE))
      .outputOptions(["-map", "[gray]", "-f", "rawvideo", "-pix_fmt", "gray", "-y"]);
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      try {
        cmd.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done(() => reject(new Error("Frame extraction timed out")));
    }, EXTRACT_TIMEOUT_MS);
    cmd.on("stderr", (line: string) => {
      if (stderr.length < 6000) stderr += `${line}\n`;
    });
    cmd.on("end", () => done(() => resolve()));
    cmd.on("error", (err: Error) => done(() => reject(new Error(`ffmpeg: ${err.message} | ${stderr.slice(-800)}`))));
    cmd.run();
  });

/** Lets queued requests run between chunks of planning. */
function yielder() {
  let last = Date.now();
  return async () => {
    if (Date.now() - last < YIELD_MS) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    last = Date.now();
  };
}

/** ffmpeg's raw gray output → zero-mean, unit-variance frames (an exposure change doesn't read
 *  as motion) plus half-size copies. null when the size doesn't match the frame count. */
async function analysisFrames(raw: Uint8Array, count: number, tick: () => Promise<void>): Promise<Frame[] | null> {
  const size = S * S;
  if (count < 2 || raw.length !== size * count) return null;
  const frames: Frame[] = [];
  for (let k = 0; k < count; k++) {
    const off = k * size;
    const full = new Float32Array(size);
    let mean = 0;
    for (let i = 0; i < size; i++) mean += raw[off + i];
    mean /= size;
    let variance = 0;
    for (let i = 0; i < size; i++) {
      const d = raw[off + i] - mean;
      full[i] = d;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / size) || 1;
    for (let i = 0; i < size; i++) full[i] /= sd;
    const half = new Float32Array(HALF * HALF);
    for (let y = 0; y < HALF; y++) {
      const r0 = 2 * y * S;
      const r1 = r0 + S;
      for (let x = 0; x < HALF; x++) {
        const c = 2 * x;
        half[y * HALF + x] = (full[r0 + c] + full[r0 + c + 1] + full[r1 + c] + full[r1 + c + 1]) / 4;
      }
    }
    frames.push({ full, half });
    await tick();
  }
  return frames;
}

/** Mean absolute difference where b, shifted by (dx, dy), overlaps a — sampled every `step` px. */
function sad(a: Float32Array, b: Float32Array, size: number, step: number, dx: number, dy: number): number {
  const x0 = Math.max(0, -dx);
  const x1 = Math.min(size, size - dx);
  const y0 = Math.max(0, -dy);
  const y1 = Math.min(size, size - dy);
  let err = 0;
  let n = 0;
  for (let y = y0; y < y1; y += step) {
    const ra = y * size;
    const rb = (y + dy) * size + dx;
    for (let x = x0; x < x1; x += step) {
      const d = a[ra + x] - b[rb + x];
      err += d < 0 ? -d : d;
      n++;
    }
  }
  return n ? err / n : Number.POSITIVE_INFINITY;
}

/** Full-size refinement from a starting guess: walk downhill, then sub-pixel. null at the edge of the range. */
function refineAlong(a: Frame, b: Frame, axis: Axis, other: number, start: number, maxPx: number): number | null {
  const lim = maxPx - 1;
  const cache = new Map<number, number>();
  const err = (s: number) => {
    let e = cache.get(s);
    if (e === undefined) {
      e = axis === "x" ? sad(a.full, b.full, S, 2, s, other) : sad(a.full, b.full, S, 2, other, s);
      cache.set(s, e);
    }
    return e;
  };
  let best = Math.max(-lim, Math.min(lim, start));
  for (let step = 0; step < 8; step++) {
    const c = err(best);
    const l = best - 1 >= -lim ? err(best - 1) : Number.POSITIVE_INFINITY;
    const r = best + 1 <= lim ? err(best + 1) : Number.POSITIVE_INFINITY;
    if (l < c && l <= r) best -= 1;
    else if (r < c) best += 1;
    else break;
  }
  if (best <= -lim || best >= lim) return null;
  const em = err(best - 1);
  const e0 = err(best);
  const ep = err(best + 1);
  const den = em - 2 * e0 + ep;
  const sub = den > 1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (em - ep)) / den)) : 0;
  return best + sub;
}

/** How far the scene moved from a to b along one axis (px at ANALYSIS_SIZE; positive = right /
 *  down), with the other axis held at `other` px; null when there's no clear best match. The
 *  whole range is searched on the half-size copies, then refined at full size. */
function shiftAlong(a: Frame, b: Frame, axis: Axis, other: number, maxPx: number): number | null {
  const cMax = Math.max(2, Math.floor(maxPx / 2));
  const cOther = Math.round(other / 2);
  const n = cMax * 2 + 1;
  const errs = new Float64Array(n);
  let best = -cMax;
  for (let s = -cMax; s <= cMax; s++) {
    const e = axis === "x" ? sad(a.half, b.half, HALF, 2, s, cOther) : sad(a.half, b.half, HALF, 2, cOther, s);
    errs[s + cMax] = e;
    if (e < errs[best + cMax]) best = s;
  }
  if (best <= -cMax || best >= cMax) return null;
  const sorted = Array.from(errs).sort((p, q) => p - q);
  if (!(errs[best + cMax] < sorted[Math.floor(n / 2)] * MIN_CONTRAST)) return null;
  return refineAlong(a, b, axis, other, best * 2, maxPx);
}

/** The pan: its axis and net travel (share of the frame; negative = the scene moves left / up). */
async function detectPan(frames: Frame[], tick: () => Promise<void>): Promise<{ axis: Axis; travel: number } | null> {
  const n = frames.length;
  const step = Math.max(1, Math.round((n - 1) / AXIS_SAMPLES));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const maxPx = Math.floor(S * AXIS_MAX_SHIFT);
  const measure = async (axis: Axis) => {
    let ok = 0;
    let net = 0;
    let abs = 0;
    for (let k = 1; k < idx.length; k++) {
      const s = shiftAlong(frames[idx[k - 1]], frames[idx[k]], axis, 0, maxPx);
      await tick();
      if (s === null) continue;
      ok++;
      net += s / S;
      abs += Math.abs(s) / S;
    }
    const pairs = idx.length - 1;
    return { reliable: pairs ? ok / pairs : 0, net, consistency: abs > 0 ? Math.abs(net) / abs : 0 };
  };
  const x = await measure("x");
  const y = await measure("y");
  const clear = (m: typeof x) => m.reliable >= MIN_RELIABLE && Math.abs(m.net) >= MIN_TRAVEL && m.consistency >= MIN_CONSISTENCY;
  let axis: Axis | null = null;
  if (clear(x) && (!clear(y) || Math.abs(x.net) >= Math.abs(y.net))) axis = "x";
  else if (clear(y)) axis = "y";
  if (!axis) return null;
  const pick = axis === "x" ? x : y;
  const other = axis === "x" ? y : x;
  // Moving both ways at once (a diagonal) isn't a drift we can set a direction for.
  if (other.reliable >= MIN_RELIABLE && Math.abs(other.net) * 2 > Math.abs(pick.net)) return null;
  return { axis, travel: pick.net };
}

const directionOf = (axis: Axis, travel: number): PanDirection =>
  axis === "x" ? (travel < 0 ? "LTR" : "RTL") : travel < 0 ? "TTB" : "BTT";

/** How many frames at one end (counting the end frame) show the same view before the pan gets
 *  going; 0 when that can't be told within `limit` frames. */
async function stillFrames(
  frames: Frame[],
  axis: Axis,
  from: number,
  dir: 1 | -1,
  limit: number,
  still: number,
  tick: () => Promise<void>,
): Promise<number> {
  const maxPx = Math.floor(S * AXIS_MAX_SHIFT);
  const moved: boolean[] = []; // moved[k] → frame from + dir·(k + 1)
  for (let k = 1; k <= limit + STILL_RUN; k++) {
    const i = from + dir * k;
    if (i < 0 || i >= frames.length) break;
    const s = shiftAlong(frames[from], frames[i], axis, 0, maxPx);
    await tick();
    moved.push(s === null || Math.abs(s) / S > still);
    if (moved.length >= STILL_RUN && moved.slice(-STILL_RUN).every(Boolean)) break;
  }
  for (let k = 0; k + STILL_RUN <= moved.length; k++) {
    if (moved.slice(k, k + STILL_RUN).every(Boolean)) return k + 1 <= limit ? k + 1 : 0;
  }
  return 0;
}

/** The scene's path through the kept frames (share of the frame), from neighbouring pairs;
 *  null when too many pairs can't be measured. */
async function scenePath(frames: Frame[], axis: Axis, start: number, end: number, tick: () => Promise<void>) {
  const m = end - start + 1;
  const along = new Float64Array(m);
  const across = new Float64Array(m);
  const maxA = Math.floor(S * PAIR_MAX_ALONG);
  const maxC = Math.floor(S * PAIR_MAX_ACROSS);
  const other: Axis = axis === "x" ? "y" : "x";
  let bad = 0;
  for (let j = 1; j < m; j++) {
    const a = frames[start + j - 1];
    const b = frames[start + j];
    const a0 = shiftAlong(a, b, axis, 0, maxA);
    const c = a0 === null ? null : shiftAlong(a, b, other, Math.round(a0), maxC);
    const a1 = a0 === null || c === null ? null : refineAlong(a, b, axis, Math.round(c), Math.round(a0), maxA);
    await tick();
    if (a1 === null || c === null) {
      bad++;
      along[j] = along[j - 1] + (j >= 2 ? along[j - 1] - along[j - 2] : 0);
      across[j] = across[j - 1];
      continue;
    }
    along[j] = along[j - 1] + a1 / S;
    across[j] = across[j - 1] + c / S;
  }
  if (bad > (m - 1) * (1 - MIN_RELIABLE)) return null;
  return { along, across };
}

/** Gaussian smoothing with point-reflected ends, so a steady pan (a straight line) passes
 *  through unchanged right up to the first and last frame. */
function smooth(v: Float64Array, sigma: number): Float64Array {
  const n = v.length;
  const r = Math.ceil(sigma * 3);
  const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)));
  const at = (j: number) => (j < 0 ? 2 * v[0] - v[Math.min(n - 1, -j)] : j >= n ? 2 * v[n - 1] - v[Math.max(0, 2 * (n - 1) - j)] : v[j]);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      s += at(i + k) * w[k + r];
      ws += w[k + r];
    }
    out[i] = s / ws;
  }
  return out;
}

/**
 * The clean-up for a clip's frames: `raw` = the analysis file, `count` = the frames extracted,
 * `fps` = frames per second of footage (for the report). null when the analysis doesn't line up
 * with the frames (then nothing changes).
 */
export async function planCleanup(raw: Uint8Array, count: number, fps = 0): Promise<CleanupPlan | null> {
  const tick = yielder();
  const frames = await analysisFrames(raw, count, tick);
  if (!frames) return null;
  const n = frames.length;
  const secs = (k: number) => (fps > 0 ? Math.round((k / fps) * 10) / 10 : 0);
  const plan = (start: number, end: number, direction: PanDirection | null, steady: SteadyCrop | null, shake: number): CleanupPlan => ({
    start,
    end,
    direction,
    steady,
    report: {
      v: 1,
      direction,
      trimmedStart: start,
      trimmedEnd: n - 1 - end,
      trimmedStartS: secs(start),
      trimmedEndS: secs(n - 1 - end),
      steadied: !!steady,
      shake: Math.round(shake * 10000) / 100,
      frames: end - start + 1,
    },
  });
  if (n < MIN_KEEP_FRAMES) return plan(0, n - 1, null, null, 0);

  const pan = await detectPan(frames, tick);
  if (!pan) return plan(0, n - 1, null, null, 0);
  const direction = directionOf(pan.axis, pan.travel);

  // Still ends.
  const limit = Math.floor(n * MAX_TRIM_SHARE);
  const still = Math.max(STILL_MIN, STILL_SHARE * Math.abs(pan.travel));
  let trimStart = Math.max(0, (await stillFrames(frames, pan.axis, 0, 1, limit, still, tick)) - KEEP_STILL);
  let trimEnd = Math.max(0, (await stillFrames(frames, pan.axis, n - 1, -1, limit, still, tick)) - KEEP_STILL);
  if (trimStart < MIN_TRIM) trimStart = 0;
  if (trimEnd < MIN_TRIM) trimEnd = 0;
  if (n - trimStart - trimEnd < Math.max(MIN_KEEP_FRAMES, Math.ceil(n * MIN_KEEP_SHARE))) {
    trimStart = 0;
    trimEnd = 0;
  }
  const start = trimStart;
  const end = n - 1 - trimEnd;

  // Shake.
  const path = await scenePath(frames, pan.axis, start, end, tick);
  if (!path) return plan(start, end, direction, null, 0);
  const sigma = Math.min(6, Math.max(3, Math.round((end - start + 1) / 45)));
  const smoothAlong = smooth(path.along, sigma);
  const smoothAcross = smooth(path.across, sigma);
  const m = end - start + 1;
  const cAlong = new Array<number>(m);
  const cAcross = new Array<number>(m);
  let sq = 0;
  let peak = 0;
  for (let j = 0; j < m; j++) {
    cAlong[j] = smoothAlong[j] - path.along[j];
    cAcross[j] = smoothAcross[j] - path.across[j];
    sq += cAlong[j] ** 2 + cAcross[j] ** 2;
    peak = Math.max(peak, Math.abs(cAlong[j]), Math.abs(cAcross[j]));
  }
  const rms = Math.sqrt(sq / m);
  if (rms < SHAKE_MIN_RMS || peak + 0.002 > MAX_MARGIN) return plan(start, end, direction, null, rms);
  const margin = Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, peak * 1.1 + 0.002));
  const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const steady: SteadyCrop =
    pan.axis === "x"
      ? { margin: round5(margin), dx: cAlong.map(round5), dy: cAcross.map(round5) }
      : { margin: round5(margin), dx: cAcross.map(round5), dy: cAlong.map(round5) };
  return plan(start, end, direction, steady, rms);
}

/** The crop for kept frame `j` of a `width`×`height` frame: the window moves against the jitter,
 *  so the scene follows its smoothed path. */
export function steadyCropFor(steady: SteadyCrop, j: number, width: number, height: number) {
  const w = Math.max(2, Math.round(width * (1 - 2 * steady.margin)));
  const h = Math.max(2, Math.round(height * (1 - 2 * steady.margin)));
  const left = Math.round(width * steady.margin - (steady.dx[j] ?? 0) * width);
  const top = Math.round(height * steady.margin - (steady.dy[j] ?? 0) * height);
  return {
    left: Math.min(width - w, Math.max(0, left)),
    top: Math.min(height - h, Math.max(0, top)),
    width: w,
    height: h,
  };
}
