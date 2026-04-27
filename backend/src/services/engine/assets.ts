import sharp from "sharp";
import { dbService as airtableService, Asset } from "../database"; // Fixed import path
import { processVideoAssetBackground } from "./processor";
import {
  uploadToCloudinary,
  resizeStrict,
  resizeWithGptImage2,
} from "./utils";

export const assetsLogic = {
  // ✅ Upload Raw
  // ✅ Upload Raw (Forced "original" tag)
  async uploadRawAsset(
    fileBuffer: Buffer,
    userId: string,
    projectId?: string,
    requestedRatio?: string,
    fileSizeBytes?: number,
    mimeType?: string,
  ) {
    try {
      const isVideo = typeof mimeType === "string" && mimeType.startsWith("video/");
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

      // We log the ratio but we SAVE it as "original" so it goes to the correct tab, UNLESS it's a special type like 3DX_FRAME or VIDEO
      console.log(`🚀 Uploading Raw Asset: ${width}x${height}, Requested Ratio: ${requestedRatio}`);

      const url = await uploadToCloudinary(
        fileBuffer,
        `raw_${userId}_${Date.now()}`,
        userId,
        "Raw Upload",
        "image",
      );

      const finalRatio = (requestedRatio === "3DX_FRAME" || requestedRatio === "VIDEO") ? requestedRatio : "original";

      return await airtableService.createAsset(
        userId,
        url,
        finalRatio, // We force original so it lands in Media Pool specifically, unless it's a special system frame
        "IMAGE",
        undefined,
        projectId,
        fileSizeBytes
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
    projectId?: string, // 👈 NEW PARAMETER
    apiKeys?: any // 👈 NEW PARAMETER
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

      console.log(`🖼️ Asset Processing: Source AR: ${sourceAR.toFixed(2)} | Target AR: ${targetRatioNum.toFixed(2)} | Match: ${isMatch}`);

      let processedBuffer: Buffer;
      if (isMatch) {
        console.log("📏 Ratios match (within tolerance). Performing strict resize.");
        processedBuffer = await resizeStrict(
          fileBuffer,
          targetWidth,
          targetHeight,
        );
      } else {
        console.log(`✨ Ratios differ. Triggering AI Outpainting for ${targetAspectRatio}...`);
        // Use GPT-Image-2 for outpainting. If it fails, bubble the error so
        // credits are refunded instead of returning a blur fallback silently.
        processedBuffer = await resizeWithGptImage2(
          fileBuffer,
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

      // ✅ Pass originalAssetId to DB service
      return await airtableService.createAsset(
        userId,
        url,
        targetAspectRatio,
        "IMAGE",
        originalAssetId, // 👈 Pass it here
        projectId // 👈 Pass it here
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
    if (post.userId !== userId) throw new Error("Access denied");

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

    const newAsset = await airtableService.createAsset(
      userId,
      targetUrl,
      dbAspectRatio,
      type,
      undefined,
      post.projectId || undefined
    );

    if (type === "VIDEO") {
      processVideoAssetBackground(newAsset.id, targetUrl, userId).catch(e => console.error("Processor failure", e));
    }

    return newAsset;
  },
};

