import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import QRCode from "qrcode";
import axios from "axios";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Response } from "express";
import { prisma } from "./database";
import { FlowError, flowInclude, serializeFlow } from "./driftFlows";
import { enqueueProcessing } from "./rotation3d/processingQueue";
import { IMMUTABLE_CACHE_CONTROL, isManagedStorageUrl, uploadManagedBuffer } from "../utils/managedStorage";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Tour reels (TOUR_V2_PLAN.md, phase 7): a published tour as a vertical 1080×1920 video for
 * Instagram Reels, TikTok and Shorts. An intro card (cover, page, title) → each drift with its
 * name, the page and a progress bar → an end card with the tour's link and a QR code; slide
 * transitions, no audio (the apps add music). Two layouts:
 * - full (default): every drift fills the screen — a portrait window of the full-resolution
 *   footage that glides the way the camera pans, so the whole space passes by;
 * - framed: the whole shot, over a blurred copy of itself.
 * Rendered in one ffmpeg pass on the processing queue (never competing with clip builds),
 * uploaded to storage, and remembered per layout in DriftFlow.settings (reelFull / reel — no
 * schema change) until the tour changes.
 */

const NS = "drift-reel";
const REEL_VERSION = 1;
export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_FPS = 30;
export type ReelLayout = "full" | "framed";
export const parseReelLayout = (v: unknown): ReelLayout => (v === "framed" ? "framed" : "full");
/** where each layout's state lives in DriftFlow.settings (framed kept the key reels were first saved under) */
const STATE_KEY: Record<ReelLayout, string> = { full: "reelFull", framed: "reel" };
const INTRO_S = 2.2;
/** each drift plays through in this long, with a short hold at each end */
const DRIFT_S = 3.4;
const HOLD_START_S = 0.3;
const HOLD_END_S = 0.6;
const END_S = 3.4;
const XFADE_S = 0.45;
export const REEL_MAX_DRIFTS = 8;
const FRAMES_PER_DRIFT = Math.round(DRIFT_S * REEL_FPS);
const FETCH_CONCURRENCY = 8;
const RENDER_TIMEOUT_MS = 6 * 60 * 1000;
const APP_URL = (process.env.DRIFT_APP_URL || "https://drift.li").replace(/\/+$/, "");
const FONT = "'DejaVu Sans','Bai Jamjuree','Segoe UI',Arial,sans-serif";
const ACCENT = "#22d3ee";
const INK = "#0b0f19";

export type ReelInput = {
  title: string;
  pageName: string | null;
  /** image URLs or local paths */
  logo: string | null;
  cover: string | null;
  /** the tour's public link (end card + QR) */
  link: string;
  drifts: {
    name: string;
    /** the lighter (mobile) frames — the framed layout */
    frames: string[];
    /** the full-resolution frames — the full-screen layout (falls back to `frames`) */
    framesFull?: string[];
    /** LTR | RTL | TTB | BTT — which way the full-screen window glides */
    direction?: string | null;
  }[];
};

type ReelState = {
  status: "RENDERING" | "READY" | "FAILED";
  hash: string;
  url?: string;
  seconds?: number;
  renderedAt?: string;
  startedAt?: string;
  error?: string;
};

// ───────────────────────────── drawing ─────────────────────────────

const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] || c);

/** Greedy word wrap by an estimated glyph width (SVG text doesn't wrap); the last line gets "…". */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * 0.56)));
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`;
  return kept;
}

const text = (x: number, y: number, size: number, fill: string, value: string, extra = "") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}"${extra}>${esc(value)}</text>`;

async function loadImage(src: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(src)) {
    const r = await axios.get(src, { responseType: "arraybuffer", timeout: 30000 });
    return Buffer.from(r.data as ArrayBuffer);
  }
  return fs.readFile(src);
}

const blank = (alpha: number) =>
  sharp({ create: { width: REEL_W, height: REEL_H, channels: 4, background: { r: 11, g: 15, b: 25, alpha } } });

async function introCard(input: ReelInput, count: number, cover: Buffer | null, logo: Buffer | null) {
  const base = cover ? sharp(cover).resize(REEL_W, REEL_H, { fit: "cover" }) : blank(1);
  const title = wrapText(input.title, 88, REEL_W - 160, 3);
  const lastLine = 1590;
  const firstLine = lastLine - (title.length - 1) * 98;
  const svg = `<svg width="${REEL_W}" height="${REEL_H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.6"/><stop offset="0.3" stop-color="${INK}" stop-opacity="0.08"/>
      <stop offset="0.58" stop-color="${INK}" stop-opacity="0.5"/><stop offset="1" stop-color="${INK}" stop-opacity="0.96"/>
    </linearGradient></defs>
    <rect width="${REEL_W}" height="${REEL_H}" fill="url(#g)"/>
    ${input.pageName ? text(80, logo ? 262 : 172, 40, "#e2e8f0", input.pageName, ' font-weight="700"') : ""}
    ${text(80, firstLine - 112, 34, ACCENT, "INTERACTIVE TOUR", ' font-weight="700" letter-spacing="8"')}
    ${title.map((l, k) => text(80, firstLine + k * 98, 88, "#ffffff", l, ' font-weight="800"')).join("")}
    ${text(80, lastLine + 100, 40, "#cbd5e1", `${count} ${count === 1 ? "space" : "spaces"} to explore`)}
  </svg>`;
  const layers: sharp.OverlayOptions[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  if (logo) layers.push({ input: logo, top: 120, left: 80 });
  return base.composite(layers).png().toBuffer();
}

async function driftOverlay(input: ReelInput, name: string, index: number, count: number, badge: Buffer | null, badgeWidth: number) {
  const lines = wrapText(name, 76, REEL_W - 160, 2);
  const lastLine = 1640;
  const firstLine = lastLine - (lines.length - 1) * 86;
  const nameX = badge ? 80 + badgeWidth + 22 : 80;
  const barW = REEL_W - 160;
  const gap = 12;
  const seg = (barW - gap * (count - 1)) / count;
  const bars = Array.from({ length: count }, (_, k) => {
    const on = k <= index;
    return `<rect x="${(80 + k * (seg + gap)).toFixed(1)}" y="1712" width="${seg.toFixed(1)}" height="10" rx="5" fill="${on ? ACCENT : "#ffffff"}" fill-opacity="${on ? 1 : 0.28}"/>`;
  }).join("");
  const svg = `<svg width="${REEL_W}" height="${REEL_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>
    </defs>
    <rect width="${REEL_W}" height="320" fill="url(#t)"/>
    <rect y="${REEL_H - 560}" width="${REEL_W}" height="560" fill="url(#b)"/>
    ${input.pageName ? text(nameX, 128, 32, "#e2e8f0", input.pageName, ' font-weight="700"') : ""}
    ${text(80, input.pageName || badge ? 196 : 150, 42, "#ffffff", wrapText(input.title, 42, REEL_W - 160, 1)[0] || "", ' font-weight="800"')}
    ${text(80, firstLine - 92, 36, ACCENT, `${index + 1} / ${count}`, ' font-weight="800" letter-spacing="2"')}
    ${lines.map((l, k) => text(80, firstLine + k * 86, 76, "#ffffff", l, ' font-weight="800"')).join("")}
    ${bars}
  </svg>`;
  const layers: sharp.OverlayOptions[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  if (badge) layers.push({ input: badge, top: 88, left: 80 });
  return blank(0).composite(layers).png().toBuffer();
}

async function endCard(input: ReelInput, cover: Buffer | null, logo: Buffer | null) {
  const base = cover ? sharp(cover).resize(REEL_W, REEL_H, { fit: "cover" }).blur(40).modulate({ brightness: 0.32 }) : blank(1);
  const qrSize = 440;
  const panel = 520;
  const panelTop = 700;
  const qr = await QRCode.toBuffer(input.link, { errorCorrectionLevel: "M", margin: 1, width: qrSize, color: { dark: INK, light: "#ffffff" } });
  const heading = wrapText("Walk through it yourself", 76, REEL_W - 160, 2);
  const title = wrapText(input.title, 44, REEL_W - 160, 2);
  const short = input.link.replace(/^https?:\/\//, "");
  const cut = short.lastIndexOf("/", 34) > 8 ? short.lastIndexOf("/", 34) : 34;
  const linkLines = (short.length <= 34 ? [short] : [short.slice(0, cut), short.slice(cut)]).map((l) => (l.length > 40 ? `${l.slice(0, 39)}…` : l));
  const svg = `<svg width="${REEL_W}" height="${REEL_H}" xmlns="http://www.w3.org/2000/svg">
    ${heading.map((l, k) => text(REEL_W / 2, 400 + k * 90, 76, "#ffffff", l, ' font-weight="800" text-anchor="middle"')).join("")}
    ${title.map((l, k) => text(REEL_W / 2, 400 + heading.length * 90 + 16 + k * 58, 44, "#cbd5e1", l, ' text-anchor="middle"')).join("")}
    <rect x="${(REEL_W - panel) / 2}" y="${panelTop}" width="${panel}" height="${panel}" rx="44" fill="#ffffff"/>
    ${linkLines.map((l, k) => text(REEL_W / 2, panelTop + panel + 110 + k * 54, 42, ACCENT, l, ' font-weight="700" text-anchor="middle"')).join("")}
    ${input.pageName ? text(REEL_W / 2, 1640, 38, "#e2e8f0", input.pageName, ' font-weight="700" text-anchor="middle"') : ""}
    ${text(REEL_W / 2, 1830, 30, "#94a3b8", "Tour · Powered by Drift Live Interactive", ' text-anchor="middle"')}
  </svg>`;
  const layers: sharp.OverlayOptions[] = [
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: qr, top: panelTop + (panel - qrSize) / 2, left: (REEL_W - qrSize) / 2 },
  ];
  if (logo) {
    const meta = await sharp(logo).metadata();
    layers.push({ input: logo, top: 1500, left: Math.round((REEL_W - (meta.width || 0)) / 2) });
  }
  return base.composite(layers).png().toBuffer();
}

// ───────────────────────────── rendering ─────────────────────────────

/** Segment lengths, where each transition starts, and the reel's length. */
export function reelTimeline(driftCount: number) {
  const segments = [INTRO_S, ...Array.from({ length: driftCount }, () => DRIFT_S + HOLD_START_S + HOLD_END_S), END_S];
  const offsets: number[] = [];
  let total = segments[0];
  for (let j = 1; j < segments.length; j++) {
    offsets.push(Math.round((total - XFADE_S) * 1000) / 1000);
    total += segments[j] - XFADE_S;
  }
  return { segments, offsets, seconds: Math.round(total * 100) / 100 };
}

/**
 * Full-screen layout: the portrait (9:16) window of a `srcW`×`srcH` frame for frame `j` of `n`.
 * The window is as large as the frame allows and glides the way the camera pans (eased), so the
 * reel sweeps across the whole space; across the pan it stays centred.
 */
export function fillWindow(srcW: number, srcH: number, j: number, n: number, direction?: string | null) {
  const aspect = REEL_W / REEL_H;
  const width = Math.min(srcW, srcW / srcH > aspect ? Math.round(srcH * aspect) : srcW);
  const height = Math.min(srcH, srcW / srcH > aspect ? srcH : Math.round(srcW / aspect));
  const t = n > 1 ? Math.min(1, Math.max(0, j / (n - 1))) : 0.5;
  const eased = t * t * (3 - 2 * t);
  const slackX = srcW - width;
  const slackY = srcH - height;
  let left = slackX / 2;
  let top = slackY / 2;
  if (direction === "LTR") left = slackX * eased;
  else if (direction === "RTL") left = slackX * (1 - eased);
  else if (direction === "TTB") top = slackY * eased;
  else if (direction === "BTT") top = slackY * (1 - eased);
  return { left: Math.round(left), top: Math.round(top), width, height };
}

const pickEvenly = <T>(items: T[], k: number): T[] =>
  items.length <= k ? items : Array.from({ length: k }, (_, j) => items[Math.round((j * (items.length - 1)) / (k - 1))]);

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

/** The filter graph: intro, drifts (+ their overlays), end card, slides between. */
function reelGraph(driftCount: number, layout: ReelLayout): string[] {
  const { offsets } = reelTimeline(driftCount);
  const seg = (label: string) => `fps=${REEL_FPS},format=yuv420p,settb=AVTB[${label}]`;
  const hold = `fps=${REEL_FPS},tpad=start_duration=${HOLD_START_S}:start_mode=clone:stop_duration=${HOLD_END_S}:stop_mode=clone`;
  const lines = [`[0:v]scale=${REEL_W}:${REEL_H},setsar=1,${seg("s0")}`];
  for (let i = 0; i < driftCount; i++) {
    const frames = 1 + 2 * i;
    const overlay = 2 + 2 * i;
    if (layout === "full") {
      // The frames are already the moving portrait window at 1080×1920.
      lines.push(`[${frames}:v]${hold},scale=${REEL_W}:${REEL_H},setsar=1[c${i}]`);
    } else {
      lines.push(
        `[${frames}:v]${hold},split=2[bg${i}][fg${i}]`,
        `[bg${i}]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=14,eq=brightness=-0.16:saturation=0.85,scale=${REEL_W}:${REEL_H},setsar=1[bb${i}]`,
        `[fg${i}]scale=1016:1440:force_original_aspect_ratio=decrease,setsar=1[ff${i}]`,
        `[bb${i}][ff${i}]overlay=(W-w)/2:(H-h)/2-40[c${i}]`,
      );
    }
    lines.push(`[c${i}][${overlay}:v]overlay=0:0:shortest=1,${seg(`s${i + 1}`)}`);
  }
  lines.push(`[${1 + 2 * driftCount}:v]scale=${REEL_W}:${REEL_H},setsar=1,${seg(`s${driftCount + 1}`)}`);
  let prev = "s0";
  offsets.forEach((offset, j) => {
    const last = j === offsets.length - 1;
    const out = last ? "out" : `x${j + 1}`;
    lines.push(`[${prev}][s${j + 1}]xfade=transition=${last ? "fade" : "slideleft"}:duration=${XFADE_S}:offset=${offset}[${out}]`);
    prev = out;
  });
  return lines;
}

/** Renders a reel to `outFile` (MP4, H.264, no audio), working in `workDir`. */
export async function renderReel(input: ReelInput, outFile: string, workDir: string, layout: ReelLayout = "full"): Promise<{ seconds: number }> {
  const drifts = input.drifts.filter((d) => d.frames.length >= 2).slice(0, REEL_MAX_DRIFTS);
  if (!drifts.length) throw new Error("No drifts to put in the reel");
  const [coverBuf, logoBuf] = await Promise.all([
    input.cover ? loadImage(input.cover).catch(() => null) : Promise.resolve(null),
    input.logo ? loadImage(input.logo).catch(() => null) : Promise.resolve(null),
  ]);
  const logo = logoBuf
    ? await sharp(logoBuf).resize({ width: 360, height: 96, fit: "inside", withoutEnlargement: true }).png().toBuffer().catch(() => null)
    : null;
  const badge = logo ? await sharp(logo).resize({ width: 200, height: 60, fit: "inside" }).png().toBuffer() : null;
  const badgeWidth = badge ? (await sharp(badge).metadata()).width || 0 : 0;

  await fs.writeFile(path.join(workDir, "intro.png"), await introCard(input, drifts.length, coverBuf, logo));
  await fs.writeFile(path.join(workDir, "end.png"), await endCard(input, coverBuf, logo));

  const counts: number[] = [];
  for (let i = 0; i < drifts.length; i++) {
    const drift = drifts[i];
    const dir = path.join(workDir, `d${i}`);
    await fs.mkdir(dir, { recursive: true });
    const frameFile = (j: number) => path.join(dir, `f_${String(j + 1).padStart(4, "0")}.jpg`);
    if (layout === "full") {
      // Full screen: the sharpest frames, cut to the moving portrait window, at 1080×1920.
      const source = drift.framesFull && drift.framesFull.length >= 2 ? drift.framesFull : drift.frames;
      const picks = pickEvenly(source, FRAMES_PER_DRIFT);
      await mapPool(picks, FETCH_CONCURRENCY, async (src, j) => {
        const buf = await loadImage(src);
        const meta = await sharp(buf).metadata();
        if (!meta.width || !meta.height) throw new Error("A frame couldn't be read");
        const region = fillWindow(meta.width, meta.height, j, picks.length, drift.direction);
        const jpg = await sharp(buf)
          .extract(region)
          .resize(REEL_W, REEL_H, { fit: "fill", kernel: "lanczos3" })
          .flatten({ background: INK })
          .jpeg({ quality: 88 })
          .toBuffer();
        await fs.writeFile(frameFile(j), jpg);
      });
      counts.push(picks.length);
    } else {
      // Framed: every frame at the first frame's size (an image sequence can't change size).
      const picks = pickEvenly(drift.frames, FRAMES_PER_DRIFT);
      const first = await sharp(await loadImage(picks[0]))
        .resize({ width: REEL_W, withoutEnlargement: true })
        .flatten({ background: INK })
        .jpeg({ quality: 88 })
        .toBuffer({ resolveWithObject: true });
      const w = first.info.width;
      const h = first.info.height;
      await fs.writeFile(frameFile(0), first.data);
      await mapPool(picks.slice(1), FETCH_CONCURRENCY, async (src, j) => {
        const jpg = await sharp(await loadImage(src)).resize(w, h, { fit: "fill" }).flatten({ background: INK }).jpeg({ quality: 88 }).toBuffer();
        await fs.writeFile(frameFile(j + 1), jpg);
      });
      counts.push(picks.length);
    }
    await fs.writeFile(path.join(workDir, `o${i}.png`), await driftOverlay(input, drift.name, i, drifts.length, badge, badgeWidth));
  }

  const { seconds, segments } = reelTimeline(drifts.length);
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    const still = (file: string, duration: number) =>
      cmd.input(path.join(workDir, file)).inputOptions(["-loop", "1", "-framerate", String(REEL_FPS), "-t", String(duration)]);
    still("intro.png", INTRO_S);
    for (let i = 0; i < drifts.length; i++) {
      cmd.input(path.join(workDir, `d${i}`, "f_%04d.jpg")).inputOptions(["-framerate", (counts[i] / DRIFT_S).toFixed(5), "-start_number", "1"]);
      still(`o${i}.png`, segments[i + 1]);
    }
    still("end.png", END_S);
    cmd.complexFilter(reelGraph(drifts.length, layout), "out");
    cmd.outputOptions([
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
      "-r", String(REEL_FPS), "-movflags", "+faststart", "-an", "-threads", "2", "-y",
    ]);
    let stderr = "";
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
      done(() => reject(new Error("Reel render timed out")));
    }, RENDER_TIMEOUT_MS);
    cmd
      .output(outFile)
      .on("stderr", (line: string) => {
        if (stderr.length < 8000) stderr += `${line}\n`;
      })
      .on("end", () => done(() => resolve()))
      .on("error", (err: Error) => done(() => reject(new Error(`ffmpeg: ${err.message} | ${stderr.slice(-1200)}`))))
      .run();
  });
  return { seconds };
}

// ───────────────────────────── tour reels ─────────────────────────────

/** renders running or queued, as `${flowId}:${layout}` */
const rendering = new Set<string>();

const settingsObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const reelStateOf = (settings: unknown, layout: ReelLayout): ReelState | null => {
  const r = settingsObj(settings)[STATE_KEY[layout]] as ReelState | undefined;
  return r && typeof r === "object" && typeof r.status === "string" && typeof r.hash === "string" ? r : null;
};

/** Writes only this layout's reel state (one atomic JSON update), so a render finishing never
 *  overwrites other tour settings saved meanwhile. */
const saveReelState = (flowId: string, layout: ReelLayout, state: ReelState) =>
  prisma.$executeRaw`UPDATE "DriftFlow" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, ARRAY[${STATE_KEY[layout]}::text], ${JSON.stringify(state)}::jsonb, true) WHERE "id" = ${flowId}`;

const viewable = (status: string) => status === "READY" || status === "PUBLISHED";

/** What a reel of this layout is made from; a change → the stored reel is stale. (The framed
 *  hash is unchanged from the first version, so reels made before stay current.) */
const hashFor = (input: ReelInput, layout: ReelLayout) => {
  const content =
    layout === "framed"
      ? { v: REEL_VERSION, ...input, drifts: input.drifts.map((d) => [d.name, d.frames.length, d.frames[0]]) }
      : {
          v: REEL_VERSION,
          layout,
          ...input,
          drifts: input.drifts.map((d) => [d.name, d.frames.length, d.frames[0], d.framesFull?.[0] ?? null, d.direction ?? null]),
        };
  return crypto.createHash("sha1").update(JSON.stringify(content)).digest("hex").slice(0, 16);
};

async function reelSource(orgId: string, flowId: string) {
  const flow = await prisma.driftFlow.findFirst({
    where: { id: flowId, organizationId: orgId },
    include: { ...flowInclude, organization: { select: { slug: true, name: true, tourSettings: true } } },
  });
  if (!flow) throw new FlowError(404, "Flow not found");
  const serialized = serializeFlow(flow);
  const rawSteps = new Map<string, any>((flow.steps as any[]).map((s) => [s.id as string, s]));
  const drifts = serialized.steps
    .filter((s) => s.product && viewable(s.product.status))
    .map((s) => {
      const m = rawSteps.get(s.id)?.product?.spin?.manifest || {};
      const frames: string[] = Array.isArray(m.frames) ? m.frames : [];
      const small: string[] = Array.isArray(m.framesMobile) && m.framesMobile.length === frames.length ? m.framesMobile : frames;
      return { name: s.product!.name, frames: small, framesFull: frames, direction: s.product!.driftDirection };
    })
    .filter((d) => d.frames.length >= 2)
    .slice(0, REEL_MAX_DRIFTS);
  const page = settingsObj(flow.organization?.tourSettings);
  const input: ReelInput = {
    title: flow.title || flow.name,
    pageName: flow.organization?.name ?? null,
    logo: typeof page.logoUrl === "string" && page.logoUrl ? page.logoUrl : null,
    cover: serialized.thumb,
    link: `${APP_URL}${serialized.publicPath}`,
    drifts,
  };
  return { flow, input };
}

const present = (flowId: string, layout: ReelLayout, state: ReelState | null, hash: string, drifts: number) => {
  if (!state) return { layout, status: "NONE" as const, drifts };
  if (state.status === "RENDERING" && !rendering.has(`${flowId}:${layout}`)) {
    return { layout, status: "FAILED" as const, error: "The reel was interrupted — please make it again.", drifts };
  }
  return {
    layout,
    status: state.status,
    url: state.url ?? null,
    seconds: state.seconds ?? null,
    renderedAt: state.renderedAt ?? null,
    /** the tour changed since this reel was made */
    stale: state.status === "READY" && state.hash !== hash,
    error: state.error ?? null,
    drifts,
  };
};

/** The tour's reel in this layout: none yet, rendering, ready (with its video) or failed. */
export async function tourReel(orgId: string, flowId: string, layout: ReelLayout) {
  const { flow, input } = await reelSource(orgId, flowId);
  return present(flow.id, layout, reelStateOf(flow.settings, layout), hashFor(input, layout), input.drifts.length);
}

/** Makes the reel in this layout (queued behind clip builds). An up-to-date reel is returned as it is. */
export async function startTourReel(orgId: string, flowId: string, layout: ReelLayout) {
  const { flow, input } = await reelSource(orgId, flowId);
  if (flow.status !== "PUBLISHED") throw new FlowError(409, "Publish the tour first — the reel ends with its link.");
  if (!input.drifts.length) throw new FlowError(409, "The tour needs a ready drift before it can have a reel.");
  const hash = hashFor(input, layout);
  const key = `${flow.id}:${layout}`;
  const current = reelStateOf(flow.settings, layout);
  if (rendering.has(key)) return present(flow.id, layout, current, hash, input.drifts.length);
  if (current?.status === "READY" && current.hash === hash && current.url) return present(flow.id, layout, current, hash, input.drifts.length);

  const state: ReelState = { status: "RENDERING", hash, startedAt: new Date().toISOString() };
  rendering.add(key);
  try {
    await saveReelState(flow.id, layout, state);
  } catch (err) {
    rendering.delete(key);
    throw err;
  }
  console.log(`[${NS}] flow ${flow.id}: ${layout} reel queued (${input.drifts.length} drifts)`);
  void enqueueProcessing(async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "drift-reel-"));
    const started = Date.now();
    try {
      const out = path.join(work, "reel.mp4");
      const { seconds } = await renderReel(input, out, work, layout);
      const url = await uploadManagedBuffer({
        buffer: await fs.readFile(out),
        contentType: "video/mp4",
        keyPrefix: `drift/org_${orgId}/flow_${flow.id}/reel`,
        fallbackExtension: "mp4",
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
      await saveReelState(flow.id, layout, { status: "READY", hash, url, seconds, renderedAt: new Date().toISOString() });
      console.log(`[${NS}] flow ${flow.id}: ${layout} reel ready — ${seconds}s video rendered in ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`[${NS}] flow ${flow.id}: ${layout} reel failed`, err);
      await saveReelState(flow.id, layout, { status: "FAILED", hash, error: "We couldn't make the reel — please try again." }).catch(() => undefined);
    } finally {
      rendering.delete(key);
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }).catch(() => undefined);
  return present(flow.id, layout, state, hash, input.drifts.length);
}

/** Streams the ready reel as a download (the storage link opens in the browser instead). */
export async function streamTourReel(orgId: string, flowId: string, layout: ReelLayout, res: Response) {
  const flow = await prisma.driftFlow.findFirst({ where: { id: flowId, organizationId: orgId }, select: { slug: true, settings: true } });
  if (!flow) throw new FlowError(404, "Flow not found");
  const state = reelStateOf(flow.settings, layout);
  if (state?.status !== "READY" || !state.url || !isManagedStorageUrl(state.url)) throw new FlowError(404, "There's no reel for this tour yet");
  const upstream = await axios.get(state.url, { responseType: "stream", timeout: 60000 });
  const base = String(flow.slug || "tour").replace(/[^a-z0-9-]/gi, "") || "tour";
  res.setHeader("Content-Type", "video/mp4");
  const length = upstream.headers["content-length"];
  if (length) res.setHeader("Content-Length", String(length));
  res.setHeader("Content-Disposition", `attachment; filename="${base}-reel${layout === "framed" ? "-framed" : ""}.mp4"`);
  upstream.data.pipe(res);
}
