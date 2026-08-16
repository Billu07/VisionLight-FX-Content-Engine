import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import archiver from "archiver";
import axios from "axios";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Response } from "express";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const NULL_DEVICE = os.platform() === "win32" ? "NUL" : "/dev/null";

export type ExportCaption = {
  clip?: string;
  startFrame: number;
  endFrame: number;
  text: string;
  x: number;
  y: number;
  color?: string | null;
  fontSize?: number | null;
  fontWeight?: number | null;
  background?: string | null;
  align?: string | null;
};

export type ExportClip = { url: string; frameCount: number };

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] || c));

// Duration (seconds) without ffprobe (ffmpeg-static ships ffmpeg only) — mirror
// the pipeline: run a 1-frame null-mux and read codecData / stderr.
const parseDuration = (stderr: string): number => {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};
const probeDuration = (input: string): Promise<number> =>
  new Promise((resolve) => {
    let dur = 0;
    let stderr = "";
    const cmd = ffmpeg(input).outputOptions(["-frames:v", "1", "-f", "null"]).output(NULL_DEVICE);
    cmd.on("codecData", (d: any) => {
      const m = String(d?.duration || "").match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) dur = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    });
    cmd.on("stderr", (line: string) => {
      stderr += line + "\n";
    });
    cmd.on("end", () => resolve(dur || parseDuration(stderr)));
    cmd.on("error", () => resolve(dur || parseDuration(stderr)));
    cmd.run();
  });

const downloadTo = async (url: string, dest: string): Promise<void> => {
  const r = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  await fs.writeFile(dest, Buffer.from(r.data as ArrayBuffer));
};

// One caption as a transparent full-frame SVG (position/size/style normalized to
// the frame, matching the interactive player). Overlaid on the video at 0:0.
function oneCaptionSvg(W: number, H: number, c: ExportCaption): string {
  const fs = Math.max(9, (c.fontSize ?? 0.05) * H);
  const px = c.x * W;
  const py = c.y * H;
  const anchor = c.align === "left" ? "start" : c.align === "right" ? "end" : "middle";
  const lines = String(c.text).split("\n");
  const lh = fs * 1.25;
  const y0 = py - ((lines.length - 1) * lh) / 2;
  let bg = "";
  if (c.background) {
    const maxChars = Math.max(1, ...lines.map((l) => l.length));
    const boxW = maxChars * fs * 0.58 + fs * 1.1;
    const boxH = lines.length * lh + fs * 0.4;
    let bx = px - boxW / 2;
    if (anchor === "start") bx = px - fs * 0.55;
    else if (anchor === "end") bx = px - boxW + fs * 0.55;
    const by = py - boxH / 2;
    const r = Math.min(fs * 0.4, boxH / 2);
    bg = `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="${r.toFixed(1)}" fill="${escapeXml(c.background)}"/>`;
  }
  const texts = lines
    .map((ln, i) => {
      const stroke = c.background
        ? ""
        : ` stroke="rgba(0,0,0,0.55)" stroke-width="${(fs * 0.06).toFixed(2)}" style="paint-order:stroke"`;
      return `<text x="${px.toFixed(1)}" y="${(y0 + i * lh).toFixed(1)}" font-size="${fs.toFixed(1)}" fill="${escapeXml(String(c.color || "#ffffff"))}" font-weight="${c.fontWeight || 600}" text-anchor="${anchor}" dominant-baseline="middle" font-family="'DejaVu Sans','Bai Jamjuree',sans-serif"${stroke}>${escapeXml(ln)}</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${bg}${texts}</svg>`;
}

// Render a single spin frame with its active captions baked in (same SVG overlay
// logic as the video export, so the thumbnail matches the downloaded MP4). Used
// for the "snapshot a captioned frame as the poster" action. Returns a PNG.
export async function renderCaptionedFramePng(opts: {
  frameUrl: string;
  captions: ExportCaption[];
  frame: number;
}): Promise<Buffer> {
  const r = await axios.get(opts.frameUrl, { responseType: "arraybuffer", timeout: 30000 });
  const base = sharp(Buffer.from(r.data as ArrayBuffer));
  const meta = await base.metadata();
  const W = meta.width || 1080;
  const H = meta.height || 1080;
  const active = opts.captions.filter(
    (c) =>
      (c.clip || "A") === "A" &&
      String(c.text || "").trim() &&
      opts.frame >= c.startFrame &&
      opts.frame <= c.endFrame,
  );
  const overlays = active.map((c) => ({ input: Buffer.from(oneCaptionSvg(W, H, c)), top: 0, left: 0 }));
  return base.composite(overlays).png().toBuffer();
}

// Build a filter_complex graph: scale each clip to W×H, concat (if 2 clips) into
// [base], then chain a time-gated overlay for each caption PNG.
function buildGraph(
  numVideos: number,
  W: number,
  H: number,
  pngs: { t0: number; t1: number }[],
  speed = 1,
): { filter: string; map: string } {
  const lines: string[] = [];
  if (numVideos === 2) {
    lines.push(`[0:v]scale=${W}:${H},setsar=1[va]`);
    lines.push(`[1:v]scale=${W}:${H},setsar=1[vb]`);
    lines.push(`[va][vb]concat=n=2:v=1[base]`);
  } else {
    lines.push(`[0:v]scale=${W}:${H},setsar=1[base]`);
  }
  let cur = "base";
  pngs.forEach((p, i) => {
    const inIdx = numVideos + i;
    const next = `o${i}`;
    lines.push(`[${cur}][${inIdx}:v]overlay=0:0:enable='between(t,${p.t0.toFixed(3)},${p.t1.toFixed(3)})'[${next}]`);
    cur = next;
  });
  if (speed !== 1) {
    lines.push(`[${cur}]setpts=${(1 / speed).toFixed(4)}*PTS[sped]`);
    cur = "sped";
  }
  return { filter: lines.join(";"), map: cur };
}

const runGraph = (
  inputs: string[],
  filter: string,
  map: string,
  out: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    inputs.forEach((i) => cmd.input(i));
    // complexFilter(spec, map) already maps the output label — do NOT also add a
    // separate -map (that double-maps and makes ffmpeg fail).
    cmd.complexFilter(filter, map);
    cmd
      .outputOptions(["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y"])
      .output(out)
      .on("end", () => resolve())
      .on("error", (e: Error) => reject(e))
      .run();
  });

/**
 * Render + stream a ZIP with three MP4s built from the ORIGINAL video(s) (not the
 * reconstructed spin frames), so duration + smoothness match the source:
 *   <base>-original.mp4      the video(s), concatenated for a 2-clip drift
 *   <base>-captioned.mp4     + captions baked in at their frame→time ranges
 *   <base>-captioned-2x.mp4  the captioned version at 2× speed
 * Captions are clip-A, mapped to time via t = frame / frameCount × durationA.
 */
export async function streamDriftExportZip(opts: {
  clips: ExportClip[]; // [A] or [A, B]
  captions: ExportCaption[];
  frameSampleUrl: string; // a spin frame — its dims are what captions are authored against
  baseName: string;
  res: Response;
}): Promise<void> {
  const { clips, captions, baseName, res } = opts;
  // Caption positions are normalized to the spin-frame dimensions, so scale the
  // video to those dims and render caption PNGs at the same size → perfect align.
  const sample = await axios.get(opts.frameSampleUrl, { responseType: "arraybuffer", timeout: 30000 });
  const meta = await sharp(Buffer.from(sample.data as ArrayBuffer)).metadata();
  const W = (meta.width || 1080) - ((meta.width || 1080) % 2); // libx264 needs even dims
  const H = (meta.height || 1080) - ((meta.height || 1080) % 2);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "drift-export-"));

  try {
    // Download the original clip video(s).
    const videoFiles: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const f = path.join(work, `clip${i}.mp4`);
      await downloadTo(clips[i].url, f);
      videoFiles.push(f);
    }
    const durA = (await probeDuration(videoFiles[0])) || 1;
    const NA = Math.max(1, clips[0].frameCount || 1);

    // Render one transparent full-frame PNG per clip-A caption + its time window.
    const capA = captions.filter((c) => (c.clip || "A") === "A" && String(c.text || "").trim());
    const pngInputs: string[] = [];
    const pngTimes: { t0: number; t1: number }[] = [];
    for (let i = 0; i < capA.length; i++) {
      const c = capA[i];
      const file = path.join(work, `cap${i}.png`);
      await sharp(Buffer.from(oneCaptionSvg(W, H, c))).png().toFile(file);
      pngInputs.push(file);
      pngTimes.push({
        t0: Math.max(0, (c.startFrame / NA) * durA),
        t1: Math.min(durA, ((c.endFrame + 1) / NA) * durA),
      });
    }

    const originalMp4 = path.join(work, "original.mp4");
    const captionedMp4 = path.join(work, "captioned.mp4");
    const captioned2x = path.join(work, "captioned-2x.mp4");

    // original = concat/scale only; captioned = + overlays; 2× = captioned re-timed.
    const orig = buildGraph(videoFiles.length, W, H, []);
    await runGraph(videoFiles, orig.filter, orig.map, originalMp4);

    const cap = buildGraph(videoFiles.length, W, H, pngTimes);
    await runGraph([...videoFiles, ...pngInputs], cap.filter, cap.map, captionedMp4);

    const two = buildGraph(videoFiles.length, W, H, pngTimes, 2);
    await runGraph([...videoFiles, ...pngInputs], two.filter, two.map, captioned2x);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}-drift-export.zip"`);
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (e) => {
      console.error("[drift] export zip error:", e);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    archive.file(originalMp4, { name: `${baseName}-original.mp4` });
    archive.file(captionedMp4, { name: `${baseName}-captioned.mp4` });
    archive.file(captioned2x, { name: `${baseName}-captioned-2x.mp4` });
    await archive.finalize();
    await new Promise<void>((resolve) => res.on("close", () => resolve()));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
