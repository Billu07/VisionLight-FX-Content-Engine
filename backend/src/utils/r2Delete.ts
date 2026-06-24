import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

// Helper to clean environment variables (handles quotes in some VPS environments)
const cleanEnvVar = (val?: string) => val?.replace(/['"]/g, "").trim() || "";

const r2AccountId = cleanEnvVar(process.env.R2_ACCOUNT_ID);

// Self-contained R2 client so this can be imported from anywhere (e.g. the
// database service) without pulling in the heavier engine module graph.
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: cleanEnvVar(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: cleanEnvVar(process.env.R2_SECRET_ACCESS_KEY),
  },
});

const bucketName = cleanEnvVar(process.env.R2_BUCKET_NAME);
const publicUrl = cleanEnvVar(process.env.R2_PUBLIC_URL);

/**
 * Extract the bucket object key from a public R2 URL. Returns null when the
 * URL is NOT hosted in our R2 bucket (legacy Cloudinary, fal.media, etc.) so
 * we never attempt to delete something we don't own.
 */
const extractR2Key = (rawUrl: string): string | null => {
  if (!rawUrl || !publicUrl) return null;
  try {
    const target = new URL(rawUrl);
    const base = new URL(publicUrl);
    if (target.host !== base.host) return null;
    const key = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
};

/**
 * Best-effort deletion of R2 objects given their public URLs. Never throws —
 * callers (e.g. project teardown) must be able to proceed even if an object is
 * already gone or R2 is briefly unavailable. Returns the number deleted.
 */
export const deleteR2ObjectsByUrl = async (
  urls: (string | null | undefined)[],
): Promise<number> => {
  if (!bucketName) return 0;

  const keys = Array.from(
    new Set(
      urls
        .map((u) => (typeof u === "string" ? extractR2Key(u) : null))
        .filter((k): k is string => !!k),
    ),
  );
  if (keys.length === 0) return 0;

  let deleted = 0;
  await Promise.allSettled(
    keys.map(async (Key) => {
      try {
        await r2Client.send(
          new DeleteObjectCommand({ Bucket: bucketName, Key }),
        );
        deleted += 1;
      } catch (err: any) {
        console.warn(
          `R2 delete failed for key "${Key}":`,
          err?.message || err,
        );
      }
    }),
  );
  return deleted;
};
