import sharp from "sharp";
import { dbService as airtableService, Asset } from "../database"; // Fixed import path
import {
  uploadToCloudinary,
  resizeStrict,
  resizeWithGemini,
  resizeWithBlurFill,
} from "./utils";

export const assetsLogic = {
  // ✅ Upload Raw
  async uploadRawAsset(fileBuffer: Buffer, userId: string) {
    try {
      const metadata = await sharp(fileBuffer).metadata();
      const width = metadata.width || 1000;
      const height = metadata.height || 1000;
      let ratio = "16:9";
      if (Math.abs(width / height - 1) < 0.1) ratio = "1:1";
      else if (height > width) ratio = "9:16";

      console.log(`🚀 Uploading Raw Asset: ${width}x${height} (${ratio})`);
      const url = await uploadToCloudinary(
        fileBuffer,
        `raw_${userId}_${Date.now()}`,
        userId,
        "Raw Upload",
        "image",
      );
      return await airtableService.createAsset(
        userId,
        url,
        ratio as any,
        "IMAGE",
      );
    } catch (e: any) {
      console.error("Raw Upload Failed:", e.message);
      throw e;
    }
  },

  // ✅ Updated
  async processAndSaveAsset(
    fileBuffer: Buffer,
    userId: string,
    targetAspectRatio: "16:9" | "9:16" | "1:1",
    originalAssetId?: string, // 👈 NEW PARAMETER
  ) {
    try {
      let targetWidth = 1280;
      let targetHeight = 720;

      // Determine Target Dimensions
      if (targetAspectRatio === "9:16") {
        targetWidth = 720;
        targetHeight = 1280;
      } else if (targetAspectRatio === "1:1") {
        targetWidth = 1024;
        targetHeight = 1024; // Standard Square
      }

      const metadata = await sharp(fileBuffer).metadata();
      const sourceAR = (metadata.width || 1) / (metadata.height || 1);
      const targetRatioNum = targetWidth / targetHeight;

      // 5% Tolerance
      const isMatch = Math.abs(sourceAR - targetRatioNum) < 0.05;

      let processedBuffer: Buffer;
      if (isMatch) {
        processedBuffer = await resizeStrict(
          fileBuffer,
          targetWidth,
          targetHeight,
        );
      } else {
        try {
          // Pass the target ratio string to Gemini logic
          processedBuffer = await resizeWithGemini(
            fileBuffer,
            targetWidth,
            targetHeight,
            targetAspectRatio,
          );
        } catch (e) {
          processedBuffer = await resizeWithBlurFill(
            fileBuffer,
            targetWidth,
            targetHeight,
          );
        }
      }

      const url = await uploadToCloudinary(
        processedBuffer,
        `asset_${userId}_${Date.now()}`,
        userId,
        "Processed Asset",
        "image",
      );

      // ✅ Pass originalAssetId to DB service
      return await airtableService.createAsset(
        userId,
        url,
        targetAspectRatio,
        "IMAGE",
        originalAssetId, // 👈 Pass it here
      );
    } catch (e: any) {
      console.error("Asset Processing Failed:", e.message);
      throw e;
    }
  },

  // ✅ Updated: Maps "Square" to DB correctly
  async copyPostMediaToAsset(postId: string, userId: string): Promise<Asset> {
    const post = await airtableService.getPostById(postId);
    if (!post || !post.mediaUrl) throw new Error("Post has no media");

    let targetUrl = post.mediaUrl;
    try {
      const parsed = JSON.parse(post.mediaUrl);
      if (Array.isArray(parsed)) targetUrl = parsed[0];
    } catch (e) {}

    const params = post.generationParams as any;
    const rawRatio = params?.aspectRatio;
    let dbAspectRatio = "16:9";

    if (rawRatio === "landscape" || rawRatio === "16:9") dbAspectRatio = "16:9";
    else if (rawRatio === "portrait" || rawRatio === "9:16")
      dbAspectRatio = "9:16";
    else if (rawRatio === "square" || rawRatio === "1:1") dbAspectRatio = "1:1";
    else if (rawRatio === "original") dbAspectRatio = "original";

    let type = "IMAGE";
    if (post.mediaType === "VIDEO" || post.mediaProvider?.includes("kling")) {
      type = "VIDEO";
    }

    return await airtableService.createAsset(
      userId,
      targetUrl,
      dbAspectRatio,
      type,
    );
  },
};
