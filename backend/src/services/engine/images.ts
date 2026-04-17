import axios from "axios";
import sharp from "sharp";
import { dbService as airtableService, Asset, CreditPool } from "../database"; // Fixed path
import { GeminiService } from "../gemini";
import { FalService } from "../fal";
import { ROIService } from "../roi";
import {
  uploadToCloudinary,
  getOptimizedUrl,
  downloadAndOptimizeImages,
  getClosestAspectRatio,
} from "./utils";

import { TenantApiKeys } from "./video";

async function refundChargedPool(params: any) {
  const pool = params?.chargedPool as CreditPool | undefined;
  const cost = Number(params?.cost);
  if (!pool || !Number.isFinite(cost) || cost <= 0) return;
  await airtableService.refundGranularCredits(params.userId, pool, cost);
}

export const imageLogic = {
  // === GENERATION ===
  async startImageGeneration(postId: string, finalPrompt: string, params: any, apiKeys?: TenantApiKeys) {
    console.log(
      `🎨 FAL Nano Banana Gen for Post ${postId} | AR: ${params.aspectRatio}`,
    );
    try {
      const refUrls =
        params.imageReferences ||
        (params.imageReference ? [params.imageReference] : []);
      const refBuffers = await downloadAndOptimizeImages(refUrls);

      let targetRatio: "16:9" | "9:16" | "1:1" = "16:9";
      const ar = params.aspectRatio;
      if (ar === "1:1" || ar === "square") targetRatio = "1:1";
      else if (ar === "9:16" || ar === "portrait") targetRatio = "9:16";
      else if (ar === "16:9" || ar === "landscape") targetRatio = "16:9";

      const buf = await FalService.generateOrEditImage({
        prompt: finalPrompt,
        aspectRatio: targetRatio,
        referenceImages: refBuffers,
        modelType: "quality",
        useGrounding: true,
        apiKey: apiKeys?.falApiKey,
      });

      const cloudUrl = await uploadToCloudinary(
        buf,
        postId,
        params.userId,
        "FAL Nano Banana Image",
        "image",
      );
      await airtableService.updatePost(postId, {
        mediaUrl: cloudUrl,
        mediaProvider: "fal-nano-banana",
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });
      await ROIService.incrementMediaGenerated(params.userId);
    } catch (e: any) {
      console.error("Image Gen Error:", e);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: e.message,
        progress: 0,
      });
      await refundChargedPool(params);
    }
  },

  // === CAROUSEL ===
  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any,
    apiKeys?: TenantApiKeys
  ) {
    console.log(`🎠 FAL Nano Banana Carousel for Post ${postId}`);
    try {
      const imageUrls: string[] = [];
      const userRefBuffers = await downloadAndOptimizeImages(
        params.imageReferences || [],
      );
      const carouselHistory: Buffer[] = [...userRefBuffers];

      let targetRatio: "16:9" | "9:16" | "1:1" = "9:16";
      const ar = params.aspectRatio;
      if (ar === "1:1" || ar === "square") targetRatio = "1:1";
      else if (ar === "16:9" || ar === "landscape") targetRatio = "16:9";
      else if (ar === "9:16" || ar === "portrait") targetRatio = "9:16";

      const steps = [
        "Image 1: Establish scene.",
        "Image 2: Action.",
        "Image 3: Conclusion.",
      ];
      for (let i = 0; i < steps.length; i++) {
        const stepPrompt = `PROJECT: Carousel. SLIDE: ${
          i + 1
        }/3. THEME: ${finalPrompt}. FOCUS: ${
          steps[i]
        }. CONSTRAINT: Maintain visual consistency.`;
        const buf = await FalService.generateOrEditImage({
          prompt: stepPrompt,
          aspectRatio: targetRatio,
          referenceImages: carouselHistory,
          modelType: "quality",
          apiKey: apiKeys?.falApiKey,
        });
        carouselHistory.push(buf);
        const url = await uploadToCloudinary(
          buf,
          `${postId}_slide_${i + 1}`,
          params.userId,
          `Slide ${i + 1}`,
          "image",
        );
        imageUrls.push(url);
      }
      await airtableService.updatePost(postId, {
        mediaUrl: JSON.stringify(imageUrls),
        mediaProvider: "fal-nano-banana-carousel",
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });
      await ROIService.incrementMediaGenerated(params.userId);
    } catch (e: any) {
      console.error("Carousel Error:", e);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: e.message,
        progress: 0,
      });
      await refundChargedPool(params);
    }
  },

  // === EDITING ===
  async editAsset(
    originalAssetUrl: string,
    prompt: string,
    userId: string,
    aspectRatio: "16:9" | "9:16" | "original" | "1:1",
    referenceUrl?: string,
    mode: "standard" | "pro" = "pro",
    originalAssetId?: string, // 👈 ADDED PARAMETER
    apiKeys?: TenantApiKeys
  ): Promise<Asset> {
    try {
      console.log(`🎨 Editing asset for ${userId} [${mode}]: "${prompt}"`);
      const imageResponse = await axios.get(originalAssetUrl, {
        responseType: "arraybuffer",
      });
      const buffer = Buffer.from(imageResponse.data);
      const inputBuffers = [buffer];

      let targetConfigRatio = aspectRatio;
      let targetSize: "1K" | "2K" | "4K" = "1K";

      if (aspectRatio === "original") {
        const metadata = await sharp(buffer).metadata();
        if (metadata.width && metadata.height) {
          targetConfigRatio = getClosestAspectRatio(
            metadata.width,
            metadata.height,
          ) as any;
          const maxDim = Math.max(metadata.width, metadata.height);
          if (maxDim > 2500) targetSize = "4K";
          else if (maxDim > 1500) targetSize = "2K";
          else targetSize = "1K";
        } else {
          targetConfigRatio = "16:9";
          targetSize = "2K";
        }
      } else {
        targetSize = "2K";
      }

      let finalPrompt = prompt;
      const modelType = mode === "standard" ? "speed" : "quality";

      if (referenceUrl) {
        const refRes = await axios.get(getOptimizedUrl(referenceUrl), {
          responseType: "arraybuffer",
        });
        inputBuffers.push(Buffer.from(refRes.data));
        if (mode === "pro")
          finalPrompt = `TASK: ${prompt} \nINPUT 2 is style reference. Maintain ID of INPUT 1.`;
      }

      const editedBuffer = await FalService.generateOrEditImage({
        prompt: finalPrompt,
        aspectRatio: targetConfigRatio,
        referenceImages: inputBuffers,
        modelType: modelType,
        useGrounding: mode === "pro",
        imageSize: targetSize,
        apiKey: apiKeys?.falApiKey,
      });

      const newUrl = await uploadToCloudinary(
        editedBuffer,
        `edited_${userId}_${Date.now()}`,
        userId,
        `Edited: ${prompt}`,
        "image",
      );

      let projectId: string | undefined = undefined;
      if (originalAssetId) {
        const original = await airtableService.getUserAssets(userId).then(assets => assets.find(a => a.id === originalAssetId));
        if (original && original.projectId) {
          projectId = original.projectId;
        }
      }

      // ✅ PASSING originalAssetId and using the selected aspectRatio
      // This ensures it moves to Landscape/Portrait/Square OR Edited tab
      return await airtableService.createAsset(
        userId,
        newUrl,
        aspectRatio,
        "IMAGE",
        originalAssetId,
        projectId
      );
    } catch (e: any) {
      throw new Error(`Edit failed: ${e.message}`);
    }
  },

  // === ENHANCE (TOPAZ) ===
  async enhanceAsset(
    userId: string,
    assetUrl: string,
    originalAssetId?: string, // 👈 ADDED PARAMETER
    apiKeys?: TenantApiKeys
  ): Promise<Asset> {
    try {
      console.log(`✨ Enhancing Asset for ${userId}...`);

      const rawUrl = assetUrl;
      const bigBuffer = await FalService.upscaleImage({ imageUrl: rawUrl, apiKey: apiKeys?.falApiKey });

      // FIX: Compress before Cloudinary upload (Mozjpeg 95)
      const optimizedBuffer = await sharp(bigBuffer)
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();

      console.log(
        `📉 Compression: ${(bigBuffer.length / 1024 / 1024).toFixed(2)}MB -> ${(
          optimizedBuffer.length /
          1024 /
          1024
        ).toFixed(2)}MB`,
      );

      const cloudUrl = await uploadToCloudinary(
        optimizedBuffer,
        `enhanced_${userId}_${Date.now()}`,
        userId,
        "Enhanced Asset",
        "image",
      );

      let projectId: string | undefined = undefined;
      if (originalAssetId) {
        const original = await airtableService.getUserAssets(userId).then(assets => assets.find(a => a.id === originalAssetId));
        if (original && original.projectId) {
          projectId = original.projectId;
        }
      }

      // ✅ PASSING originalAssetId
      return await airtableService.createAsset(
        userId,
        cloudUrl,
        "original",
        "IMAGE",
        originalAssetId,
        projectId
      );
    } catch (e: any) {
      console.error("Enhance Error:", e.message);
      throw e;
    }
  },
};
