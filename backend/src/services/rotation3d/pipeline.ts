import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import axios from "axios";
import sharp from "sharp";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline as streamPipeline } from "node:stream/promises";
import { uploadManagedBuffer } from "../../utils/managedStorage";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const DOWNLOAD_TIMEOUT_MS = 180000;
const EXTRACT_TIMEOUT_MS = 180000;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const NULL_DEVICE = os.platform() === "win32" ? "NUL" : "/dev/null";

export type SpinManifest = {
  frameCount: number;
  frames: string[]; // ordered R2 URLs, one full horizontal rotation
  defaultFrame: number;
  width: number;
};

const nullSafe = <T>(p: Promise<T>) => p.catch(() => undefined);

const downloadToFile = async (url: string, out: string) => {
  const res = await axios.get(url, {
    responseType: "stream",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxBodyLength: MAX_VIDEO_BYTES,
    maxContentLength: MAX_VIDEO_BYTES,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  await streamPipeline(res.data, fsSync.createWriteStream(out));
};

// Parse "Duration: HH:MM:SS.ms" out of ffmpeg stderr — avoids depending on a
// separate ffprobe binary (ffmpeg-static bundles ffmpeg only).
const parseDuration = (stderr: string): number => {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

const probeDurationSeconds = (input: string): Promise<number> =>
  new Promise((resolve) => {
    let dur = 0;
    let stderr = "";
    // `-frames:v 1` reads essentially just the header (fast) — codecData carries
    // the duration, so we avoid decoding the whole clip just to measure length.
    const cmd = ffmpeg(input)
      .outputOptions(["-frames:v", "1", "-f", "null"])
      .output(NULL_DEVICE);
    cmd.on("codecData", (data: any) => {
      const m = String(data?.duration || "").match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) dur = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    });
    cmd.on("stderr", (line: string) => {
      if (stderr.length < 8000) stderr += `${line}\n`;
    });
    cmd.on("end", () => resolve(dur || parseDuration(stderr)));
    cmd.on("error", () => resolve(dur || parseDuration(stderr)));
    cmd.run();
  });

const extractFrames = (
  input: string,
  outDir: string,
  fps: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let stderr = "";
    const cmd = ffmpeg(input)
      .outputOptions([`-vf`, `fps=${fps}`, "-q:v", "3", "-an", "-y"])
      .output(path.join(outDir, "f_%04d.jpg"));

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
      done(() => reject(new Error("Rotation3D frame extraction timed out")));
    }, EXTRACT_TIMEOUT_MS);

    cmd.on("stderr", (line: string) => {
      if (stderr.length < 6000) stderr += `${line}\n`;
    });
    cmd.on("end", () => done(() => resolve()));
    cmd.on("error", (err: Error) =>
      done(() => reject(new Error(`ffmpeg: ${err.message} | ${stderr.slice(-800)}`))),
    );
    cmd.run();
  });

/**
 * Turn a rendered rotation video into an ordered set of web-optimized frames on
 * R2 and return a manifest the player scrubs. Single horizontal axis: N frames
 * evenly spaced across the whole clip = one smooth rotation.
 *
 * NOTE: background removal (transparent WebP cutouts) is a follow-up — this first
 * pass ships opaque WebP frames so the end-to-end spin works. Swap the sharp step
 * for @imgly/background-removal-node output when we add cutouts.
 */
export const buildSpinFromVideo = async (params: {
  videoUrl: string;
  organizationId: string;
  productId: string;
  frameCount?: number;
  maxWidth?: number;
}): Promise<SpinManifest> => {
  const targetCount = Math.min(72, Math.max(12, params.frameCount ?? 36));
  const maxWidth = params.maxWidth ?? 1200;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "r3d-spin-"));
  const videoPath = path.join(tempDir, `${crypto.randomUUID()}.mp4`);
  const framesDir = path.join(tempDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  try {
    console.log(`[r3d] pipeline start product=${params.productId} url=${params.videoUrl}`);
    await downloadToFile(params.videoUrl, videoPath);
    const dl = await fs.stat(videoPath);
    console.log(`[r3d] downloaded ${dl.size} bytes`);

    const duration = await probeDurationSeconds(videoPath);
    console.log(`[r3d] duration=${duration}s`);
    if (!duration || duration <= 0) {
      throw new Error("Could not read video duration");
    }
    // fps chosen so the whole clip yields ~targetCount evenly-spaced frames.
    const fps = Math.max(0.1, targetCount / duration);
    await extractFrames(videoPath, framesDir, fps);

    const files = (await fs.readdir(framesDir))
      .filter((f) => f.endsWith(".jpg"))
      .sort(); // f_0001, f_0002, … → rotation order
    console.log(`[r3d] extracted ${files.length} frames (fps=${fps.toFixed(3)})`);
    if (files.length === 0) throw new Error("No frames were extracted");

    const keyPrefix = `rotation3d/org_${params.organizationId}/product_${params.productId}/frames`;
    const frames: string[] = [];
    for (const file of files) {
      const raw = await fs.readFile(path.join(framesDir, file));
      const webp = await sharp(raw)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const url = await uploadManagedBuffer({
        buffer: webp,
        contentType: "image/webp",
        keyPrefix,
        fallbackExtension: "webp",
      });
      frames.push(url);
    }
    console.log(`[r3d] uploaded ${frames.length} frames to R2`);

    return {
      frameCount: frames.length,
      frames,
      defaultFrame: Math.round(frames.length / 12),
      width: maxWidth,
    };
  } finally {
    await nullSafe(fs.rm(tempDir, { recursive: true, force: true }));
  }
};
