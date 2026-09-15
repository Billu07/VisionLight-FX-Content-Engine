import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "./database";

/**
 * Tour pins: labelled spots on a drift ("Quartz island") that follow their place in the
 * footage as people drag. A drift is a pan, so between two frames the scene shifts along
 * one axis — x for LTR/RTL, y for TTB/BTT. The first time a drift gets pins we sample
 * ~30 of its frames, measure the shift between neighbours on small grayscale copies and
 * store the cumulative shift per frame (a fraction of the frame) on the product
 * (`pinTrack`, keyed to the clip's frames so a new clip re-measures). A pin is placed
 * once; the player moves it along that track plus the creator's fine-tuning (`keys`).
 * When the motion can't be measured, pins follow the fine-tuning only.
 */

const NS = "drift-pins";
export const MAX_PINS = 12;
const TITLE_MAX = 40;
const NOTE_MAX = 160;
const MAX_KEYS = 24;

const LONG = 240; // sample size along the drift axis (px)
const SHORT = 136; // and across it
const MAX_SHIFT = 0.3; // the most the scene may move between two sampled frames
const MIN_CONTRAST = 0.8; // the best match must score under 80% of the median mismatch
const SAMPLES = 30;
const FETCH_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 20000;

export type PinTrack = { v: 1; key: string; axis: "x" | "y"; shift: number[] | null };
type PinKey = { f: number; x: number; y: number };

/** The frames pins are edited and measured on: the lighter mobile set when there is one
 *  (same count and order as the full set, so positions carry over). */
export const pinFrames = (manifest: unknown): string[] => {
  const m = (manifest || {}) as { frames?: unknown; framesMobile?: unknown };
  const frames = Array.isArray(m.frames) ? (m.frames as string[]) : [];
  return Array.isArray(m.framesMobile) && m.framesMobile.length === frames.length ? (m.framesMobile as string[]) : frames;
};
const axisOf = (direction?: string | null): "x" | "y" => (direction === "TTB" || direction === "BTT" ? "y" : "x");
const trackKey = (frames: string[]) => `${frames.length}:${frames[0] || ""}`;

async function grayFrame(url: string, axis: "x" | "y") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let input: Buffer;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`frame fetch ${res.status}`);
    input = Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
  const width = axis === "x" ? LONG : SHORT;
  const height = axis === "x" ? SHORT : LONG;
  const { data, info } = await sharp(input)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = Math.max(1, info.channels);
  // Zero mean, unit variance: an exposure change between frames doesn't read as motion.
  const px = new Float32Array(width * height);
  let mean = 0;
  for (let i = 0; i < px.length; i++) mean += data[i * ch];
  mean /= px.length;
  let variance = 0;
  for (let i = 0; i < px.length; i++) {
    const d = data[i * ch] - mean;
    px[i] = d;
    variance += d * d;
  }
  const sd = Math.sqrt(variance / px.length) || 1;
  for (let i = 0; i < px.length; i++) px[i] /= sd;
  return { px, width, height };
}

/** How far the scene moved from frame a to frame b along the axis, as a fraction of the
 *  frame (positive = towards the right / bottom); null when the best match sits at the
 *  edge of the search, i.e. there's no trustworthy answer. */
function estimateShift(a: Float32Array, b: Float32Array, width: number, height: number, axis: "x" | "y"): number | null {
  const len = axis === "x" ? width : height;
  const maxS = Math.floor(len * MAX_SHIFT);
  const errs = new Float64Array(maxS * 2 + 1).fill(Number.POSITIVE_INFINITY);
  let best = 0;
  for (let s = -maxS; s <= maxS; s++) {
    let err = 0;
    let count = 0;
    if (axis === "x") {
      const x0 = Math.max(0, -s);
      const x1 = Math.min(width, width - s);
      for (let y = 0; y < height; y += 2) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const d = a[row + x] - b[row + x + s];
          err += d < 0 ? -d : d;
        }
        count += x1 - x0;
      }
    } else {
      const y0 = Math.max(0, -s);
      const y1 = Math.min(height, height - s);
      for (let y = y0; y < y1; y++) {
        const ra = y * width;
        const rb = (y + s) * width;
        for (let x = 0; x < width; x += 2) {
          const d = a[ra + x] - b[rb + x];
          err += d < 0 ? -d : d;
          count++;
        }
      }
    }
    const e = err / Math.max(1, count);
    errs[s + maxS] = e;
    if (e < errs[best + maxS]) best = s;
  }
  if (Math.abs(best) >= maxS) return null;
  // Confidence: the best match has to beat a typical mismatch clearly. Featureless or
  // unrelated frames (a blank wall, a cut) score about the same at every shift.
  const sorted = Array.from(errs).filter(Number.isFinite).sort((p, q) => p - q);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!(errs[best + maxS] < median * MIN_CONTRAST)) return null;
  const em = errs[best - 1 + maxS];
  const e0 = errs[best + maxS];
  const ep = errs[best + 1 + maxS];
  const den = em - 2 * e0 + ep;
  const sub = den > 1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (em - ep)) / den)) : 0;
  return (best + sub) / len;
}

/** The cumulative shift per frame, or null when a step between samples can't be trusted. */
async function measureTrack(frames: string[], axis: "x" | "y"): Promise<number[] | null> {
  const n = frames.length;
  const step = Math.max(1, Math.round((n - 1) / SAMPLES));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += step) idx.push(i);
  idx.push(n - 1);
  const imgs: Awaited<ReturnType<typeof grayFrame>>[] = new Array(idx.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, idx.length) }, async () => {
      while (cursor < idx.length) {
        const k = cursor++;
        imgs[k] = await grayFrame(frames[idx[k]], axis);
      }
    }),
  );
  const at = [0];
  for (let k = 1; k < idx.length; k++) {
    const s = estimateShift(imgs[k - 1].px, imgs[k].px, imgs[k].width, imgs[k].height, axis);
    if (s === null) return null;
    at.push(at[k - 1] + s);
  }
  const shift = new Array<number>(n).fill(0);
  for (let k = 1; k < idx.length; k++) {
    const f0 = idx[k - 1];
    const f1 = idx[k];
    for (let f = f0; f <= f1; f++) {
      const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
      shift[f] = Math.round((at[k - 1] + (at[k] - at[k - 1]) * t) * 1e5) / 1e5;
    }
  }
  return shift;
}

const inflight = new Map<string, Promise<PinTrack | null>>();

/** The product's pin track — measured and saved on first use, or again after its clip or
 *  direction changed. null when there are no frames; `shift: null` when the motion
 *  couldn't be measured (saved, so it isn't retried on every open). A failed frame
 *  download isn't saved, so the next open tries again. */
export function ensurePinTrack(product: {
  id: string;
  driftDirection?: string | null;
  pinTrack?: unknown;
  spin?: { manifest?: unknown } | null;
}): Promise<PinTrack | null> {
  const frames = pinFrames(product.spin?.manifest);
  if (frames.length < 2) return Promise.resolve(null);
  const axis = axisOf(product.driftDirection);
  const key = trackKey(frames);
  const cur = product.pinTrack as PinTrack | null | undefined;
  if (cur && cur.v === 1 && cur.key === key && cur.axis === axis) return Promise.resolve(cur);
  const running = inflight.get(product.id);
  if (running) return running;
  const job = (async () => {
    const started = Date.now();
    let shift: number[] | null = null;
    try {
      shift = await measureTrack(frames, axis);
    } catch (err: any) {
      console.warn(`[${NS}] product ${product.id}: couldn't load frames to measure motion — ${err?.message || err}`);
      return { v: 1 as const, key, axis, shift: null };
    }
    const track: PinTrack = { v: 1, key, axis, shift };
    await prisma.driftProduct
      .update({ where: { id: product.id }, data: { pinTrack: track as unknown as Prisma.InputJsonValue } })
      .catch((err) => console.error(`[${NS}] product ${product.id}: couldn't save the motion track`, err));
    console.log(`[${NS}] product ${product.id}: ${shift ? "motion measured" : "no reliable motion"} in ${Date.now() - started}ms`);
    return track;
  })().finally(() => inflight.delete(product.id));
  inflight.set(product.id, job);
  return job;
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

type CleanPin = { frame: number; x: number; y: number; keys: PinKey[] | null; title: string; note: string | null; order: number };

/** Validate the pin set the editor saves. */
export function sanitizePins(raw: unknown, frameCount: number): { ok: true; pins: CleanPin[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Pins must be a list" };
  if (raw.length > MAX_PINS) return { ok: false, error: `A drift can have up to ${MAX_PINS} pins` };
  const last = Math.max(0, frameCount - 1);
  const pins: CleanPin[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = (raw[i] || {}) as Record<string, unknown>;
    const title = String(p.title ?? "").trim().slice(0, TITLE_MAX);
    if (!title) return { ok: false, error: `Pin ${i + 1} needs a label` };
    const note = String(p.note ?? "").trim().slice(0, NOTE_MAX) || null;
    const frame = Math.round(clamp(p.frame, 0, last, 0));
    const byFrame = new Map<number, PinKey>();
    for (const k of Array.isArray(p.keys) ? p.keys.slice(0, MAX_KEYS) : []) {
      const f = Math.round(clamp((k as any)?.f, 0, last, -1));
      if (f < 0 || f === frame) continue;
      byFrame.set(f, { f, x: clamp((k as any)?.x, 0, 1, 0.5), y: clamp((k as any)?.y, 0, 1, 0.5) });
    }
    const keys = [...byFrame.values()].sort((a, b) => a.f - b.f);
    pins.push({ frame, x: clamp(p.x, 0, 1, 0.5), y: clamp(p.y, 0, 1, 0.5), keys: keys.length ? keys : null, title, note, order: i });
  }
  return { ok: true, pins };
}

export const serializePin = (p: { id: string; frame: number; x: number; y: number; keys: unknown; title: string; note: string | null }) => ({
  id: p.id,
  frame: p.frame,
  x: p.x,
  y: p.y,
  keys: Array.isArray(p.keys) ? (p.keys as PinKey[]) : null,
  title: p.title,
  note: p.note,
});

/** Pins + the track for the public player. A stale track (the clip was replaced) is
 *  re-measured in the background; until then the pins follow their fine-tuning only. */
export async function publicPins(p: { id: string; driftDirection?: string | null; pinTrack?: unknown; spin?: { manifest?: unknown } | null }) {
  // Never let pins take a drift player down (e.g. a deploy that hasn't pushed the schema yet).
  const rows = await prisma.driftPin
    .findMany({ where: { productId: p.id }, orderBy: { order: "asc" } })
    .catch((err) => {
      console.error(`[${NS}] product ${p.id}: couldn't load pins`, err?.message || err);
      return [];
    });
  if (!rows.length) return { pins: [], pinTrack: null };
  const frames = pinFrames(p.spin?.manifest);
  const t = p.pinTrack as PinTrack | null | undefined;
  const fresh = !!t && t.v === 1 && t.key === trackKey(frames) && t.axis === axisOf(p.driftDirection);
  if (!fresh && frames.length > 1) void ensurePinTrack(p).catch(() => undefined);
  const usable = fresh && Array.isArray(t!.shift) && t!.shift.length === frames.length;
  return { pins: rows.map(serializePin), pinTrack: usable ? { axis: t!.axis, shift: t!.shift as number[] } : null };
}
