import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs";
import path from "node:path";
import { uploadFileToR2 } from "../services/engine/utils";
import { IMMUTABLE_CACHE_CONTROL } from "../utils/managedStorage";

/**
 * Put the drift.li guide films on R2.
 *
 * The films under each landing hero are a few MB each at full resolution, and serving them
 * from the VPS means serving them from the same single box that runs ffmpeg for every drift
 * conversion. On R2 they come off Cloudflare's edge instead, which is both faster for the
 * visitor and takes the bandwidth off the box.
 *
 * Run it on the VPS, where the R2 credentials live:
 *
 *     cd /var/www/myapp/backend && npm run media:upload-guide-films
 *
 * Then put the line it prints into frontend/.env.production and rebuild the frontend. Until
 * that env var is set the films are served from frontend/public as before — this changes
 * where they come from, never whether they exist (frontend/src/rotation3d/guideFilms.ts).
 *
 * Keys are STABLE names, not the random UUIDs managedStorage normally mints, because the
 * frontend has to be able to name them without a manifest. That is what the `?v=` in
 * guideFilms.ts is for: bump VERSION there when a film is replaced, or the immutable
 * cache-control below will keep serving the old one.
 */

const NS = "guide-films";
const PREFIX = "drift/guide";
const DIR = path.resolve(__dirname, "../../../frontend/public/drift/guide");

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    console.error(`[${NS}] R2_BUCKET_NAME and R2_PUBLIC_URL must be set — nothing uploaded.`);
    process.exit(1);
  }
  if (!fs.existsSync(DIR)) {
    console.error(`[${NS}] no films at ${DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(DIR).filter((f) => TYPES[path.extname(f).toLowerCase()]);
  if (!files.length) {
    console.error(`[${NS}] ${DIR} holds nothing uploadable`);
    process.exit(1);
  }

  console.log(`[${NS}] uploading ${files.length} file(s) from ${DIR}`);
  let total = 0;
  for (const file of files) {
    const buffer = fs.readFileSync(path.join(DIR, file));
    const type = TYPES[path.extname(file).toLowerCase()];
    const url = await uploadFileToR2(buffer, `${PREFIX}/${file}`, type, IMMUTABLE_CACHE_CONTROL);
    total += buffer.length;
    console.log(`  ${file.padEnd(22)} ${(buffer.length / 1048576).toFixed(2).padStart(6)} MB  ${url}`);
  }

  const base = `${String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "")}/${PREFIX}`;
  console.log(`\n[${NS}] ${(total / 1048576).toFixed(1)} MB uploaded.`);
  console.log(`\nAdd this to frontend/.env.production, then rebuild the frontend:\n`);
  console.log(`    VITE_GUIDE_CDN=${base}\n`);
  console.log(`Check one before you rely on it:\n`);
  console.log(`    curl -sI "${base}/drift-desktop.mp4" | grep -iE 'content-type|content-length|cache-control'\n`);
}

main().catch((err) => {
  console.error(`[${NS}] failed:`, err);
  process.exit(1);
});
