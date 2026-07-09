import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { uploadManagedBuffer } from "../../utils/managedStorage";
import { matteEnabled, matteFrame } from "./matte";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const EXTRACT_TIMEOUT_MS = 300000;
const NULL_DEVICE = os.platform() === "win32" ? "NUL" : "/dev/null";
const UPLOAD_CONCURRENCY = 8; // parallel frame → R2 uploads
// Keep native resolution for standard product footage (≤1440p keeps its width);
// only very large frames are capped so files stay sane. WebP q92 is visually
// lossless, so extracted frames match the source.
const MAX_FRAME_WIDTH = 2048;
const WEBP_QUALITY = 92;

export type SpinManifest = {
  frameCount: number;
  frames: string[];
  defaultFrame: number;
  width: number | null;
};

const parseDuration = (stderr: string): number => {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

const probeDurationSeconds = (input: string): Promise<number> =>
  new Promise((resolve) => {
    let dur = 0;
    let stderr = "";
    // `-frames:v 1` reads essentially just the header (fast). codecData carries
    // the duration, so we never decode the whole clip just to measure length.
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

// One ffmpeg pass extracts ~targetCount evenly-spaced frames as lossless PNG
// (no intermediate JPEG generation loss).
const extractFrames = (input: string, outDir: string, fps: number): Promise<void> =>
  new Promise((resolve, reject) => {
    let stderr = "";
    const cmd = ffmpeg(input)
      .outputOptions([`-vf`, `fps=${fps}`, "-an", "-y"])
      .output(path.join(outDir, "f_%04d.png"));

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

// Order-preserving bounded-concurrency map.
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Turn a rendered rotation video (already on local disk — no re-download) into an
 * ordered set of high-quality WebP frames on R2 and return the player manifest.
 * Single horizontal axis: N evenly-spaced frames = one smooth rotation.
 *
 * NOTE: frames are still opaque. Transparent-background cutouts (the true 3D
 * feel) are the next enhancement — swap the sharp step for a matte step there.
 */
export const buildSpinFromVideo = async (params: {
  videoPath: string;
  organizationId: string;
  productId: string;
  frameCount?: number;
}): Promise<SpinManifest> => {
  const targetCount = Math.min(72, Math.max(12, params.frameCount ?? 36));
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "r3d-frames-"));

  try {
    console.log(`[r3d] pipeline start product=${params.productId}`);
    const duration = await probeDurationSeconds(params.videoPath);
    console.log(`[r3d] duration=${duration}s`);
    if (!duration || duration <= 0) throw new Error("Could not read video duration");

    const fps = Math.max(0.1, targetCount / duration);
    await extractFrames(params.videoPath, framesDir, fps);

    const files = (await fs.readdir(framesDir))
      .filter((f) => f.endsWith(".png"))
      .sort(); // f_0001, f_0002, … → rotation order
    console.log(`[r3d] extracted ${files.length} frames (fps=${fps.toFixed(3)})`);
    if (files.length === 0) throw new Error("No frames were extracted");

    const matte = matteEnabled();
    let matted = 0;
    const keyPrefix = `rotation3d/org_${params.organizationId}/product_${params.productId}/frames`;
    const frames = await mapPool(files, UPLOAD_CONCURRENCY, async (file) => {
      const raw = await fs.readFile(path.join(framesDir, file));
      // Background cutout (transparent PNG). Falls back to the opaque frame on
      // any failure so a spin still ships.
      let input: Buffer = raw;
      if (matte) {
        const cut = await matteFrame(raw);
        if (cut) {
          input = cut;
          matted++;
        }
      }
      const webp = await sharp(input)
        .resize({ width: MAX_FRAME_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY }) // sharp preserves alpha in webp
        .toBuffer();
      return uploadManagedBuffer({
        buffer: webp,
        contentType: "image/webp",
        keyPrefix,
        fallbackExtension: "webp",
      });
    });
    console.log(
      `[r3d] uploaded ${frames.length} frames to R2 (matte ${matte ? `${matted}/${files.length}` : "off"})`,
    );

    return {
      frameCount: frames.length,
      frames,
      defaultFrame: Math.round(frames.length / 12),
      width: MAX_FRAME_WIDTH,
    };
  } finally {
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
  }
};
