import axios from "axios";
import sharp from "sharp";
import { dbService as airtableService, Asset } from "../database"; // Fixed path
import { GeminiService } from "../gemini";
import { FalService } from "../fal"; // Assuming fal.ts is in ../fal or move it to ./fal later
import { ROIService } from "../roi";
import { FAL_TOPAZ_PATH, FAL_KEY } from "./config";
import {
  uploadToCloudinary,
  getOptimizedUrl,
  downloadAndOptimizeImages,
  getClosestAspectRatio,
} from "./utils";

export const imageLogic = {
  // === GENERATION ===
  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(
      `🎨 Gemini 3 Pro Gen for Post ${postId} | AR: ${params.aspectRatio}`
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

      const buf = await GeminiService.generateOrEditImage({
        prompt: finalPrompt,
        aspectRatio: targetRatio,
        referenceImages: refBuffers,
        modelType: "quality",
        useGrounding: true,
      });

      const cloudUrl = await uploadToCloudinary(
        buf,
        postId,
        params.userId,
        "Gemini 3 Pro Image",
        "image"
      );
      await airtableService.updatePost(postId, {
        mediaUrl: cloudUrl,
        mediaProvider: "gemini-3-pro",
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
      await airtableService.refundUserCredit(params.userId, 1);
    }
  },

  // === CAROUSEL ===
  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any
  ) {
    console.log(`🎠 Gemini 3 Pro Carousel for Post ${postId}`);
    try {
      const imageUrls: string[] = [];
      const userRefBuffers = await downloadAndOptimizeImages(
        params.imageReferences || []
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
        const buf = await GeminiService.generateOrEditImage({
          prompt: stepPrompt,
          aspectRatio: targetRatio,
          referenceImages: carouselHistory,
          modelType: "quality",
        });
        carouselHistory.push(buf);
        const url = await uploadToCloudinary(
          buf,
          `${postId}_slide_${i + 1}`,
          params.userId,
          `Slide ${i + 1}`,
          "image"
        );
        imageUrls.push(url);
      }
      await airtableService.updatePost(postId, {
        mediaUrl: JSON.stringify(imageUrls),
        mediaProvider: "gemini-3-carousel",
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
      await airtableService.refundUserCredit(params.userId, 3);
    }
  },

  // === EDITING ===
  async editAsset(
    originalAssetUrl: string,
    prompt: string,
    userId: string,
    aspectRatio: "16:9" | "9:16" | "original",
    referenceUrl?: string,
    mode: "standard" | "pro" = "pro"
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
            metadata.height
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

      const editedBuffer = await GeminiService.generateOrEditImage({
        prompt: finalPrompt,
        aspectRatio: targetConfigRatio,
        referenceImages: inputBuffers,
        modelType: modelType,
        useGrounding: mode === "pro",
        imageSize: targetSize,
      });

      const newUrl = await uploadToCloudinary(
        editedBuffer,
        `edited_${userId}_${Date.now()}`,
        userId,
        `Edited: ${prompt}`,
        "image"
      );
      return await airtableService.createAsset(
        userId,
        newUrl,
        "original",
        "IMAGE"
      );
    } catch (e: any) {
      throw new Error(`Edit failed: ${e.message}`);
    }
  },

  // === ENHANCE (TOPAZ) ===
  // === ENHANCE (TOPAZ) ===
  async enhanceAsset(userId: string, assetUrl: string): Promise<Asset> {
    try {
      console.log(`✨ Enhancing Asset for ${userId}...`);

      // 1. Use Raw URL (Do not downscale input)
      const rawUrl = assetUrl;

      // 2. Get the High-Res Buffer from Topaz (Often >10MB PNG)
      const bigBuffer = await FalService.upscaleImage({ imageUrl: rawUrl });

      // 🛠️ FIX: Compress before Cloudinary upload
      // Convert huge PNG to High-Quality JPEG (95%) to stay under 10MB limit
      const optimizedBuffer = await sharp(bigBuffer)
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();

      console.log(
        `📉 Compression: ${(bigBuffer.length / 1024 / 1024).toFixed(2)}MB -> ${(
          optimizedBuffer.length /
          1024 /
          1024
        ).toFixed(2)}MB`
      );

      // 3. Upload the optimized buffer
      const cloudUrl = await uploadToCloudinary(
        optimizedBuffer,
        `enhanced_${userId}_${Date.now()}`,
        userId,
        "Enhanced Asset",
        "image"
      );

      return await airtableService.createAsset(
        userId,
        cloudUrl,
        "original",
        "IMAGE"
      );
    } catch (e: any) {
      console.error("Enhance Error:", e.message);
      throw e;
    }
  },
};
