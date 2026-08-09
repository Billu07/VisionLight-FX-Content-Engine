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

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] || c));

// Order-preserving bounded-concurrency map.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const fetchBuf = async (url: string): Promise<Buffer> => {
  const r = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(r.data as ArrayBuffer);
};

// SVG overlay (W×H) with the captions active on `frame`, matching the player's
// look: normalized position/size, alignment, optional background pill, and a
// legibility stroke when there's no background. Uses DejaVu Sans (present on the
// VPS) — same font the share-card renders with.
function captionSvg(W: number, H: number, frame: number, captions: ExportCaption[]): string | null {
  const active = captions.filter(
    (c) => frame >= (c.startFrame || 0) && frame <= (c.endFrame || 0) && String(c.text || "").trim(),
  );
  if (!active.length) return null;
  const parts = active
    .map((c) => {
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
      return bg + texts;
    })
    .join("");
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts}</svg>`;
}

// Encode a numbered PNG sequence (f_00001.png…) into an H.264 MP4 at `fps`.
const encode = (dir: string, out: string, fps: number): Promise<void> =>
  new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(dir, "f_%05d.png"))
      .inputOptions(["-framerate", String(fps), "-start_number", "1"])
      .outputOptions([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", // libx264 needs even dimensions
        "-y",
      ])
      .output(out)
      .on("end", () => resolve())
      .on("error", (e: Error) => reject(e))
      .run();
  });

/**
 * Render + stream a ZIP with three MP4s: original, captioned, and captioned @2×.
 * `frames` is the combined (2-clip-aware) frame URL list; `captions` are already
 * in that combined index space. On-demand + in-process (like the pipeline).
 */
export async function streamDriftExportZip(opts: {
  frames: string[];
  captions: ExportCaption[];
  fps: number;
  baseName: string;
  res: Response;
}): Promise<void> {
  const { frames, captions, fps, baseName, res } = opts;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "drift-export-"));
  const origDir = path.join(work, "orig");
  const capDir = path.join(work, "cap");
  await fs.mkdir(origDir);
  await fs.mkdir(capDir);

  try {
    const first = await fetchBuf(frames[0]);
    const meta = await sharp(first).metadata();
    const W = meta.width || 1080;
    const H = meta.height || 1080;

    // Download each frame once; write an original PNG and a captioned PNG.
    await mapPool(frames, 6, async (url, i) => {
      const buf = i === 0 ? first : await fetchBuf(url);
      const name = `f_${String(i + 1).padStart(5, "0")}.png`;
      await sharp(buf).png().toFile(path.join(origDir, name));
      const svg = captionSvg(W, H, i, captions);
      if (svg) {
        await sharp(buf)
          .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
          .png()
          .toFile(path.join(capDir, name));
      } else {
        await sharp(buf).png().toFile(path.join(capDir, name));
      }
    });

    const originalMp4 = path.join(work, "original.mp4");
    const captionedMp4 = path.join(work, "captioned.mp4");
    const captioned2x = path.join(work, "captioned-2x.mp4");
    await encode(origDir, originalMp4, fps);
    await encode(capDir, captionedMp4, fps);
    await encode(capDir, captioned2x, fps * 2);

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
