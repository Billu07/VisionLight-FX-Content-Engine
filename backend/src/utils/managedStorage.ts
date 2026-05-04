import axios from "axios";
import crypto from "node:crypto";
import { uploadFileToR2 } from "../services/engine/utils";
import { isSafeExternalUrl } from "../lib/app-runtime";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const getExtensionForMime = (mimeType: string, fallback: string) =>
  MIME_EXTENSIONS[mimeType.toLowerCase()] || fallback;

export const buildManagedStorageKey = (
  prefix: string,
  mimeType: string,
  fallbackExtension: string,
) => {
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "");
  const extension = getExtensionForMime(mimeType.split(";")[0].trim(), fallbackExtension);
  return `${safePrefix}/${crypto.randomUUID()}.${extension}`;
};

export const uploadManagedBuffer = async (params: {
  buffer: Buffer;
  contentType: string;
  keyPrefix: string;
  fallbackExtension: string;
}) => {
  const contentType = params.contentType.split(";")[0].trim().toLowerCase();
  const key = buildManagedStorageKey(
    params.keyPrefix,
    contentType,
    params.fallbackExtension,
  );
  return uploadFileToR2(params.buffer, key, contentType);
};

export const isManagedStorageUrl = (rawUrl: string) => {
  const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/g, "");
  if (!publicBase) return false;

  const trimmedUrl = rawUrl.trim();
  return trimmedUrl === publicBase || trimmedUrl.startsWith(`${publicBase}/`);
};

const toGoogleDriveDownloadUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes("drive.google.com")) return rawUrl;

    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    const id = pathMatch?.[1] || parsed.searchParams.get("id");
    if (!id) return rawUrl;

    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  } catch {
    return rawUrl;
  }
};

export const copyExternalImageToManagedStorage = async (params: {
  rawUrl: string;
  keyPrefix: string;
  maxBytes?: number;
}) => {
  const sourceUrl = toGoogleDriveDownloadUrl(params.rawUrl.trim());
  if (!isSafeExternalUrl(sourceUrl)) {
    throw new Error("Logo URL must be a safe public HTTPS image URL.");
  }

  const maxBytes = params.maxBytes ?? 10 * 1024 * 1024;
  const response = await axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: maxBytes,
    headers: {
      "User-Agent": "VisionLight-Asset-Ingest/1.0",
    },
  });

  const contentType = String(response.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(
      "Logo URL did not return an image file. Upload the logo file instead.",
    );
  }

  const buffer = Buffer.from(response.data);
  if (buffer.length > maxBytes) {
    throw new Error("Logo file is too large. Maximum size is 10MB.");
  }

  return uploadManagedBuffer({
    buffer,
    contentType,
    keyPrefix: params.keyPrefix,
    fallbackExtension: "jpg",
  });
};
