import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const CAPTURE_TIMEOUT_MS = 20000;
const END_OFFSETS_SECONDS = ["-0.01", "-0.08", "-0.25", "-0.5"];

const captureSingleFrameNearEnd = async (
  videoUrl: string,
  outputPath: string,
  endOffsetSec: string,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const command = ffmpeg(videoUrl)
      .inputOptions([`-sseof ${endOffsetSec}`])
      .outputOptions(["-frames:v 1", "-q:v 2", "-an", "-f image2", "-y"])
      .output(outputPath);

    let settled = false;
    const settle = (handler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      handler();
    };

    const timeout = setTimeout(() => {
      try {
        command.kill("SIGKILL");
      } catch {
        // Ignore kill errors; timeout still resolves via rejection.
      }
      settle(() => reject(new Error("FFmpeg end-frame extraction timed out.")));
    }, CAPTURE_TIMEOUT_MS);

    command.on("end", () => settle(() => resolve()));
    command.on("error", (err: Error) => settle(() => reject(err)));
    command.run();
  });

export const extractLastFrameAsJpeg = async (videoUrl: string): Promise<Buffer> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "visionlight-end-frame-"));
  const outputPath = path.join(tempDir, `${crypto.randomUUID()}.jpg`);
  let lastError: unknown;

  try {
    for (const endOffset of END_OFFSETS_SECONDS) {
      try {
        await captureSingleFrameNearEnd(videoUrl, outputPath, endOffset);
        if (!fsSync.existsSync(outputPath)) continue;

        const stat = await fs.stat(outputPath);
        if (stat.size > 0) {
          return await fs.readFile(outputPath);
        }
      } catch (error) {
        lastError = error;
      }
    }

    const suffix =
      lastError instanceof Error && lastError.message
        ? `: ${lastError.message}`
        : "";
    throw new Error(`Could not extract end frame${suffix}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};
