import sharp from "sharp";
import { dbService as airtableService, Asset } from "../database";
import { processVideoAssetBackground } from "./processor";
import {
  uploadToCloudinary,
  resizeStrict,
  resizeWithGptImage2,
} from "./utils";

export const assetsLogic = {
  async uploadRawAsset(
    fileBuffer: Buffer,
    userId: string,
    projectId?: string,
    requestedRatio?: string,
    fileSizeBytes?: number,
    mimeType?: string,
  ) {
    try {
      const isVideo =
        typeof mimeType === "string" && mimeType.startsWith("video/");
      if (isVideo) {
        const videoUrl = await uploadToCloudinary(
          fileBuffer,
          `raw_${userId}_${Date.now()}`,
          userId,
          "Raw Upload",
          "video",
        );

        const videoRatio = requestedRatio === "VIDEO" ? "VIDEO" : "original";
        return await airtableService.createAsset(
          userId,
          videoUrl,
          videoRatio,
          "VIDEO",
          undefined,
          projectId,
          fileSizeBytes,
        );
      }

      const metadata = await sharp(fileBuffer).metadata();
      const width = metadata.width || 1000;
      const height = metadata.height || 1000;

      console.log(
        `Uploading raw asset: ${width}x${height}, requested ratio: ${requestedRatio}`,
      );

      const url = await uploadToCloudinary(
        fileBuffer,
        `raw_${userId}_${Date.now()}`,
        userId,
        "Raw Upload",
        "image",
      );

      const finalRatio =
        requestedRatio === "3DX_FRAME" || requestedRatio === "VIDEO"
          ? requestedRatio
          : "original";

      return await airtableService.createAsset(
        userId,
        url,
        finalRatio,
        "IMAGE",
        undefined,
        projectId,
        fileSizeBytes,
      );
    } catch (e: any) {
      console.error("Raw upload failed:", e.message);
      throw e;
    }
  },

  async processAndSaveAsset(
    fileBuffer: Buffer,
    userId: string,
    targetAspectRatio: "16:9" | "9:16" | "1:1",
    originalAssetId?: string,
    projectId?: string,
    apiKeys?: any,
  ) {
    try {
      // Normalize EXIF orientation so AR detection and GPT outpaint reference
      // match what users see in browser previews.
      const normalizedBuffer = await sharp(fileBuffer).rotate().toBuffer();

      let targetWidth = 1280;
      let targetHeight = 720;

      if (targetAspectRatio === "9:16") {
        targetWidth = 720;
        targetHeight = 1280;
      } else if (targetAspectRatio === "1:1") {
        targetWidth = 1024;
        targetHeight = 1024;
      }

      const metadata = await sharp(normalizedBuffer).metadata();
      const sourceAR = (metadata.width || 1) / (metadata.height || 1);
      const targetRatioNum = targetWidth / targetHeight;
      const isMatch = Math.abs(sourceAR - targetRatioNum) < 0.05;

      console.log(
        `Asset processing AR check: source=${sourceAR.toFixed(2)} target=${targetRatioNum.toFixed(2)} match=${isMatch}`,
      );

      let processedBuffer: Buffer;
      if (isMatch) {
        console.log("Asset ratios aligned; performing strict resize.");
        processedBuffer = await resizeStrict(
          normalizedBuffer,
          targetWidth,
          targetHeight,
        );
      } else {
        console.log(
          `Asset ratio mismatch; triggering GPT outpaint for ${targetAspectRatio}.`,
        );
        // If GPT outpaint fails, bubble the error so route-level refund logic runs.
        processedBuffer = await resizeWithGptImage2(
          normalizedBuffer,
          targetWidth,
          targetHeight,
          targetAspectRatio,
          apiKeys,
        );
      }

      const url = await uploadToCloudinary(
        processedBuffer,
        `asset_${userId}_${Date.now()}`,
        userId,
        "Processed Asset",
        "image",
      );

      return await airtableService.createAsset(
        userId,
        url,
        targetAspectRatio,
        "IMAGE",
        originalAssetId,
        projectId,
      );
    } catch (e: any) {
      console.error("Asset processing failed:", e.message);
      throw e;
    }
  },

  async copyPostMediaToAsset(postId: string, userId: string): Promise<Asset> {
    const post = await airtableService.getPostById(postId);
    if (!post || !post.mediaUrl) throw new Error("Post has no media");
    if (post.userId !== userId) throw new Error("Access denied");

    let targetUrl = post.mediaUrl;
    try {
      const parsed = JSON.parse(post.mediaUrl);
      if (Array.isArray(parsed)) targetUrl = parsed[0];
    } catch {}

    const params = post.generationParams as any;
    const rawRatio = params?.aspectRatio;
    let dbAspectRatio = "16:9";

    if (rawRatio === "landscape" || rawRatio === "16:9") dbAspectRatio = "16:9";
    else if (rawRatio === "portrait" || rawRatio === "9:16") dbAspectRatio = "9:16";
    else if (rawRatio === "square" || rawRatio === "1:1") dbAspectRatio = "1:1";
    else if (rawRatio === "original") dbAspectRatio = "original";

    let type = "IMAGE";
    if (post.mediaType === "VIDEO" || post.mediaProvider?.includes("kling")) {
      type = "VIDEO";
    }

    const newAsset = await airtableService.createAsset(
      userId,
      targetUrl,
      dbAspectRatio,
      type,
      undefined,
      post.projectId || undefined,
    );

    if (type === "VIDEO") {
      processVideoAssetBackground(newAsset.id, targetUrl, userId).catch((e) =>
        console.error("Processor failure", e),
      );
    }

    return newAsset;
  },
};