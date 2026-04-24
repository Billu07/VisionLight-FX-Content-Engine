import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import axios from "axios";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const CAPTURE_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 120000;
const MAX_VIDEO_DOWNLOAD_BYTES = 512 * 1024 * 1024; // 512MB hard cap
const END_OFFSETS_SECONDS = ["-0.01", "-0.08", "-0.25", "-0.5"];

const annotateError = (message: string, stderr?: string): Error => {
  if (!stderr) return new Error(message);
  const trimmedStderr = stderr.trim();
  if (!trimmedStderr) return new Error(message);
  return new Error(`${message} | ffmpeg: ${trimmedStderr.slice(-1200)}`);
};

const captureSingleFrameNearEnd = async (
  inputSource: string,
  outputPath: string,
  endOffsetSec: string,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let stderr = "";
    const command = ffmpeg(inputSource)
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
      settle(() =>
        reject(annotateError("FFmpeg end-frame extraction timed out.", stderr)),
      );
    }, CAPTURE_TIMEOUT_MS);

    command.on("stderr", (line: string) => {
      if (stderr.length > 6000) return;
      stderr += `${line}\n`;
    });
    command.on("end", () => settle(() => resolve()));
    command.on("error", (err: Error) =>
      settle(() => reject(annotateError(err.message, stderr))),
    );
    command.run();
  });

const extractFromSource = async (
  inputSource: string,
  outputPath: string,
): Promise<Buffer> => {
  let lastError: unknown;

  for (const endOffset of END_OFFSETS_SECONDS) {
    try {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
      await captureSingleFrameNearEnd(inputSource, outputPath, endOffset);
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
};

const downloadVideoToFile = async (videoUrl: string, outputPath: string): Promise<void> => {
  const response = await axios.get(videoUrl, {
    responseType: "stream",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxBodyLength: MAX_VIDEO_DOWNLOAD_BYTES,
    maxContentLength: MAX_VIDEO_DOWNLOAD_BYTES,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  await pipeline(response.data, fsSync.createWriteStream(outputPath));
};

export const extractLastFrameAsJpeg = async (videoUrl: string): Promise<Buffer> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "visionlight-end-frame-"));
  const outputPath = path.join(tempDir, `${crypto.randomUUID()}.jpg`);
  const downloadPath = path.join(tempDir, `${crypto.randomUUID()}.video`);
  let remoteError: unknown;
  let localError: unknown;

  try {
    try {
      return await extractFromSource(videoUrl, outputPath);
    } catch (error) {
      remoteError = error;
    }

    // If direct remote extraction fails (common with some CDNs/range handling),
    // download once and retry extraction from a local file path.
    if (/^https?:\/\//i.test(videoUrl)) {
      try {
        await downloadVideoToFile(videoUrl, downloadPath);
        return await extractFromSource(downloadPath, outputPath);
      } catch (error) {
        localError = error;
      }
    }

    const remoteSuffix =
      remoteError instanceof Error && remoteError.message
        ? ` remote=${remoteError.message}`
        : "";
    const localSuffix =
      localError instanceof Error && localError.message
        ? ` local=${localError.message}`
        : "";
    if (remoteSuffix || localSuffix) {
      throw new Error(`Could not extract end frame.${remoteSuffix}${localSuffix}`.trim());
    }

    const suffix =
      remoteError instanceof Error && remoteError.message
        ? `: ${remoteError.message}`
        : "";
    throw new Error(`Could not extract end frame${suffix}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};
