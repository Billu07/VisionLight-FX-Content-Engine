import OpenAI from "openai";
import FormData from "form-data";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { dbService as airtableService, Post, Asset } from "./database";
import { GeminiService } from "./gemini";
import { ROIService } from "./roi";

// Configuration
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AI_TIMEOUT = 120000;
const VIDEO_UPLOAD_TIMEOUT = 600000;

// Kie AI Config
const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

// FAL AI Config
const FAL_KEY = process.env.FAL_KEY;
const FAL_BASE_PATH = "https://queue.fal.run/fal-ai/kling-video/v2.5-turbo";
const FAL_TOPAZ_PATH = "https://queue.fal.run/fal-ai/topaz/upscale/image";

const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

// === HELPER: Convert Sliders (-10 to 10) to Kling Camera Prompts ===
const getKlingCameraPrompt = (h: number, v: number, z: number) => {
  const parts: string[] = [];

  // Horizontal (Orbit/Pan) - Threshold 3 for strong move
  if (h >= 3) parts.push("Camera orbits right");
  else if (h > 0) parts.push("Camera pans right");

  if (h <= -3) parts.push("Camera orbits left");
  else if (h < 0) parts.push("Camera pans left");

  // Vertical (Crane/Tilt)
  if (v >= 3) parts.push("Camera cranes up");
  else if (v > 0) parts.push("Camera tilts up");

  if (v <= -3) parts.push("Camera cranes down");
  else if (v < 0) parts.push("Camera tilts down");

  // Zoom
  if (z >= 2) parts.push("Camera zooms in");
  else if (z <= -2) parts.push("Camera zooms out");

  if (parts.length === 0) return "Static camera, subtle motion";
  return parts.join(", ") + ". Smooth cinematic movement.";
};

// === HELPER 1: BLACK FILL FALLBACK ===
const resizeWithBlurFill = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  try {
    const background = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    const foreground = await sharp(buffer)
      .resize({
        width,
        height,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    return await sharp(background)
      .composite([{ input: foreground, gravity: "center" }])
      .toFormat("jpeg", { quality: 95 })
      .toBuffer();
  } catch (e) {
    return await sharp(buffer)
      .resize(width, height, { fit: "cover", position: "center" })
      .toFormat("jpeg")
      .toBuffer();
  }
};

// === HELPER 2: STRICT CROP ===
const resizeStrict = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  return await sharp(buffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .toFormat("jpeg", { quality: 95 })
    .toBuffer();
};

// === HELPER 3: GEMINI RESIZE ===
const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> => {
  try {
    const backgroundGuide = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    const compositeBuffer = await sharp(backgroundGuide)
      .composite([
        {
          input: await sharp(originalBuffer)
            .resize({ width: targetWidth, height: targetHeight, fit: "inside" })
            .toBuffer(),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer();

    const isPortrait = targetHeight > targetWidth;
    const direction = isPortrait ? "vertical" : "horizontal";

    const fullPrompt = `
    TASK: Image Extension (Outpainting).
    INPUT: An image with a sharp central subject and BLACK ${direction} bars.
    INSTRUCTIONS:
    1. REMOVE THE BLACK BARS: Paint over them completely with high-definition details.
    2. SEAMLESS EXTENSION: Match lighting, texture, and style.
    3. NO LETTERBOXING: Final output must be full-screen.
    4. PRESERVE CENTER: Do not modify the central subject.
    `;

    return await GeminiService.generateOrEditImage({
      prompt: fullPrompt,
      aspectRatio: isPortrait ? "9:16" : "16:9",
      referenceImages: [compositeBuffer],
      modelType: "quality",
    });
  } catch (error: any) {
    console.error("❌ Gemini Resize Error:", error.message);
    throw error;
  }
};

export const contentEngine = {
  // ✅ Upload Raw (No Resizing)
  async uploadRawAsset(fileBuffer: Buffer, userId: string) {
    try {
      const metadata = await sharp(fileBuffer).metadata();
      const width = metadata.width || 1000;
      const height = metadata.height || 1000;
      let ratio = "16:9";
      if (Math.abs(width / height - 1) < 0.1) ratio = "1:1";
      else if (height > width) ratio = "9:16";

      const url = await this.uploadToCloudinary(
        fileBuffer,
        `raw_${userId}_${Date.now()}`,
        userId,
        "Raw Upload",
        "image"
      );
      return await airtableService.createAsset(userId, url, ratio as any);
    } catch (e: any) {
      console.error("Raw Upload Failed:", e.message);
      throw e;
    }
  },

  // === KLING DRIFT PATH (Video Generation) ===
  async processKlingDrift(
    userId: string,
    assetUrl: string,
    prompt: string,
    horizontal: number,
    vertical: number,
    zoom: number
  ) {
    try {
      console.log(
        `🎬 Kling Drift Request: H${horizontal} V${vertical} Z${zoom}`
      );

      const imageResponse = await axios.get(getOptimizedUrl(assetUrl), {
        responseType: "arraybuffer",
      });
      const metadata = await sharp(Buffer.from(imageResponse.data)).metadata();

      let targetRatio = "16:9";
      if (metadata.width && metadata.height) {
        if (Math.abs(metadata.width - metadata.height) < 100)
          targetRatio = "1:1";
        else if (metadata.height > metadata.width) targetRatio = "9:16";
      }

      const cameraMove = getKlingCameraPrompt(horizontal, vertical, zoom);
      const finalPrompt = `Subject: ${
        prompt || "The main subject"
      }. Action: ${cameraMove}. Style: Cinematic, high fidelity, 3D depth.`;

      const payload: any = {
        prompt: finalPrompt,
        image_url: getOptimizedUrl(assetUrl),
        duration: "5",
        aspect_ratio: targetRatio,
      };

      const submitRes = await axios.post(
        `${FAL_BASE_PATH}/pro/image-to-video`,
        payload,
        {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Kling Accepted:", submitRes.data.request_id);

      return {
        requestId: submitRes.data.request_id,
        statusUrl: submitRes.data.status_url,
      };
    } catch (e: any) {
      console.error("❌ Kling Drift Failed:", e.response?.data || e.message);
      throw new Error(`Drift failed: ${e.response?.data?.detail || e.message}`);
    }
  },

  async checkToolStatus(statusUrl: string) {
    const res = await axios.get(statusUrl, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    return res.data;
  },

  async processAndSaveAsset(
    fileBuffer: Buffer,
    userId: string,
    targetAspectRatio: "16:9" | "9:16"
  ) {
    try {
      const targetWidth = targetAspectRatio === "16:9" ? 1280 : 720;
      const targetHeight = targetAspectRatio === "16:9" ? 720 : 1280;
      const metadata = await sharp(fileBuffer).metadata();
      const sourceAR = (metadata.width || 1) / (metadata.height || 1);
      const targetRatioNum = targetWidth / targetHeight;
      const isMatch = Math.abs(sourceAR - targetRatioNum) < 0.15;

      let processedBuffer: Buffer;
      if (isMatch)
        processedBuffer = await resizeStrict(
          fileBuffer,
          targetWidth,
          targetHeight
        );
      else {
        try {
          processedBuffer = await resizeWithGemini(
            fileBuffer,
            targetWidth,
            targetHeight
          );
        } catch (e) {
          processedBuffer = await resizeWithBlurFill(
            fileBuffer,
            targetWidth,
            targetHeight
          );
        }
      }

      const url = await this.uploadToCloudinary(
        processedBuffer,
        `asset_${userId}_${Date.now()}`,
        userId,
        "Processed Asset",
        "image"
      );
      return await airtableService.createAsset(
        userId,
        url,
        targetAspectRatio,
        "IMAGE"
      );
    } catch (e: any) {
      console.error("Asset Processing Failed:", e.message);
      throw e;
    }
  },

  async copyPostMediaToAsset(postId: string, userId: string): Promise<Asset> {
    const post = await airtableService.getPostById(postId);
    if (!post || !post.mediaUrl) throw new Error("Post has no media");

    let targetUrl = post.mediaUrl;
    try {
      const parsed = JSON.parse(post.mediaUrl);
      if (Array.isArray(parsed)) targetUrl = parsed[0];
    } catch (e) {}

    let type = "IMAGE";
    if (post.mediaType === "VIDEO" || post.mediaProvider?.includes("kling")) {
      type = "VIDEO";
    }

    return await airtableService.createAsset(userId, targetUrl, "16:9", type);
  },

  async editAsset(
    originalAssetUrl: string,
    prompt: string,
    userId: string,
    aspectRatio: "16:9" | "9:16" | "original",
    referenceUrl?: string,
    mode: "standard" | "pro" = "pro"
  ): Promise<Asset> {
    try {
      const imageResponse = await axios.get(getOptimizedUrl(originalAssetUrl), {
        responseType: "arraybuffer",
      });
      const inputBuffers = [Buffer.from(imageResponse.data)];
      let finalPrompt = prompt;
      const modelType = mode === "standard" ? "speed" : "quality";

      if (referenceUrl) {
        const refRes = await axios.get(getOptimizedUrl(referenceUrl), {
          responseType: "arraybuffer",
        });
        inputBuffers.push(Buffer.from(refRes.data));
        if (mode === "pro") {
          finalPrompt = `TASK: ${prompt} \nINPUT 2 is style reference. Maintain ID of INPUT 1.`;
        }
      }

      const editedBuffer = await GeminiService.generateOrEditImage({
        prompt: finalPrompt,
        aspectRatio: aspectRatio === "original" ? "original" : aspectRatio,
        referenceImages: inputBuffers,
        modelType: modelType,
        useGrounding: mode === "pro",
      });

      const newUrl = await this.uploadToCloudinary(
        editedBuffer,
        `edited_${userId}_${Date.now()}`,
        userId,
        `Edited: ${prompt}`,
        "image"
      );
      return await airtableService.createAsset(
        userId,
        newUrl,
        aspectRatio,
        "IMAGE"
      );
    } catch (e: any) {
      throw new Error(`Edit failed: ${e.message}`);
    }
  },

  // === ✅ NEW: ENHANCE ASSET (Topaz) ===
  async enhanceAsset(userId: string, assetUrl: string): Promise<Asset> {
    try {
      console.log(`✨ Enhancing Asset for ${userId}...`);

      // 1. Submit to Topaz
      const submitRes = await axios.post(
        FAL_TOPAZ_PATH,
        {
          image_url: getOptimizedUrl(assetUrl),
          model: "Standard V2",
          upscale_factor: 2,
          output_format: "jpeg",
          face_enhancement: true,
        },
        {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const statusUrl = submitRes.data.status_url;
      console.log("Enhance Job Submitted:", submitRes.data.request_id);

      // 2. Simple Polling Loop (Wait for result - up to 90s)
      let resultUrl = "";
      let attempts = 0;
      while (!resultUrl && attempts < 45) {
        await new Promise((r) => setTimeout(r, 2000));
        const checkRes = await axios.get(statusUrl, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        });

        if (checkRes.data.status === "COMPLETED") {
          const resultRes = await axios.get(checkRes.data.response_url);
          resultUrl = resultRes.data.image.url;
        } else if (checkRes.data.status === "FAILED") {
          throw new Error("Enhancement Failed: " + checkRes.data.error);
        }
        attempts++;
      }

      if (!resultUrl) throw new Error("Enhancement timed out.");

      // 3. Upload Result & Save
      const cloudUrl = await this.uploadToCloudinary(
        resultUrl,
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

  // === VIDEO GENERATION (Standard) ===
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎬 Video Gen for ${postId} | Model Input: ${params.model}`);
    const isKie = params.model.includes("kie");
    const isKling = params.model.includes("kling");
    const isOpenAI = !isKie && !isKling;
    const isPro = params.model.includes("pro") || params.model.includes("Pro");

    try {
      let finalInputImageBuffer: Buffer | undefined;
      let targetWidth = 1280;
      let targetHeight = 720;
      const isPortrait =
        params.aspectRatio === "portrait" || params.aspectRatio === "9:16";

      if (params.size) {
        const [w, h] = params.size.split("x");
        targetWidth = parseInt(w);
        targetHeight = parseInt(h);
      } else if (params.resolution) {
        targetWidth = isPortrait ? 1080 : 1920;
        targetHeight = isPortrait ? 1920 : 1080;
        if (params.resolution === "720p") {
          targetWidth = isPortrait ? 720 : 1280;
          targetHeight = isPortrait ? 1280 : 720;
        }
      }

      const rawRefUrl =
        params.imageReferences && params.imageReferences.length > 0
          ? params.imageReferences[0]
          : params.imageReference;
      const refUrl = getOptimizedUrl(rawRefUrl);

      if (refUrl && params.hasReferenceImage) {
        try {
          const imageResponse = await axios.get(refUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
          });
          const originalImageBuffer = Buffer.from(imageResponse.data);
          const metadata = await sharp(originalImageBuffer).metadata();
          const sourceAR = (metadata.width || 1) / (metadata.height || 1);
          const targetAR = targetWidth / targetHeight;

          if (Math.abs(sourceAR - targetAR) < 0.05) {
            finalInputImageBuffer = await resizeStrict(
              originalImageBuffer,
              targetWidth,
              targetHeight
            );
          } else {
            try {
              finalInputImageBuffer = await resizeWithGemini(
                originalImageBuffer,
                targetWidth,
                targetHeight
              );
            } catch (geminiError) {
              finalInputImageBuffer = await resizeWithBlurFill(
                originalImageBuffer,
                targetWidth,
                targetHeight
              );
            }
          }
        } catch (e: any) {
          console.error("❌ Image Processing Failed:", e.message);
        }
      }

      let externalId = "";
      let statusUrl = "";
      let provider = "";

      if (isKie) {
        provider = "kie";
        let kieInputUrl = "";
        let isImageToVideo = false;
        if (finalInputImageBuffer) {
          kieInputUrl = await this.uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_input`,
            params.userId,
            "Kie Input",
            "image"
          );
          isImageToVideo = true;
        }
        const baseModel = isPro ? "sora-2-pro" : "sora-2";
        const mode = isImageToVideo ? "image-to-video" : "text-to-video";
        const kiePayload: any = {
          model: `${baseModel}-${mode}`,
          input: {
            prompt: finalPrompt,
            aspect_ratio: isPortrait ? "portrait" : "landscape",
            n_frames: params.duration
              ? params.duration.toString().replace("s", "")
              : "10",
            remove_watermark: true,
          },
        };
        if (isImageToVideo) kiePayload.input.image_urls = [kieInputUrl];

        const kieRes = await axios.post(
          `${KIE_BASE_URL}/jobs/createTask`,
          kiePayload,
          { headers: { Authorization: `Bearer ${KIE_API_KEY}` } }
        );
        if (kieRes.data.code !== 200)
          throw new Error(`Kie Error: ${JSON.stringify(kieRes.data)}`);
        externalId = kieRes.data.data.taskId;
      } else if (isKling) {
        provider = "kling";
        let klingInputUrl = "";
        let klingTailUrl = "";
        let isImageToVideo = false;

        if (finalInputImageBuffer) {
          klingInputUrl = await this.uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_kling_start`,
            params.userId,
            "Kling Start",
            "image"
          );
          isImageToVideo = true;

          if (params.imageReferences && params.imageReferences.length > 1) {
            try {
              const tailRaw = getOptimizedUrl(params.imageReferences[1]);
              const tailResp = await axios.get(tailRaw, {
                responseType: "arraybuffer",
              });
              klingTailUrl = await this.uploadToCloudinary(
                tailResp.data,
                `${postId}_kling_end`,
                params.userId,
                "Kling End",
                "image"
              );
              await airtableService.updatePost(postId, {
                generatedEndFrame: klingTailUrl,
              });
            } catch (e) {
              klingTailUrl = getOptimizedUrl(params.imageReferences[1]);
            }
          }
        } else if (params.imageReference) {
          klingInputUrl = getOptimizedUrl(params.imageReference);
          isImageToVideo = true;
        }

        const tier = "pro"; // Always force PRO
        const url = `${FAL_BASE_PATH}/${tier}/${
          isImageToVideo ? "image-to-video" : "text-to-video"
        }`;
        const payload: any = {
          prompt: finalPrompt,
          duration: params.duration ? params.duration.toString() : "5",
          aspect_ratio: isPortrait ? "9:16" : "16:9",
        };
        if (isImageToVideo) {
          payload.image_url = klingInputUrl;
          if (klingTailUrl) payload.tail_image_url = klingTailUrl;
        }

        const submitRes = await axios.post(url, payload, {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
            "Content-Type": "application/json",
          },
        });
        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      } else if (isOpenAI) {
        provider = "openai";
        const form = new FormData();
        form.append("prompt", finalPrompt);
        form.append("model", params.model || "sora-2-pro");
        form.append(
          "seconds",
          parseInt(params.duration?.toString().replace("s", "") || "4")
        );
        form.append("size", `${targetWidth}x${targetHeight}`);
        if (finalInputImageBuffer) {
          form.append("input_reference", finalInputImageBuffer, {
            filename: "ref.jpg",
            contentType: "image/jpeg",
          });
        }
        const genResponse = await axios.post(
          "https://api.openai.com/v1/videos",
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            timeout: VIDEO_UPLOAD_TIMEOUT,
          }
        );
        externalId = genResponse.data.id;
      }

      await airtableService.updatePost(postId, {
        generationParams: { ...params, externalId, statusUrl },
        mediaProvider: provider,
        status: "PROCESSING",
      });
      console.log(`✅ Initiated ${provider} job: ${externalId}`);
    } catch (error: any) {
      console.error("❌ Video Gen Startup Failed:", error.message);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
      await airtableService.refundUserCredit(params.userId, params.cost || 2);
    }
  },

  // =========================================================
  // 🚀 CRITICAL FIX: Robust Check Status with Fallback
  // =========================================================
  async checkPostStatus(post: Post) {
    const params = post.generationParams as any;
    if (post.status !== "PROCESSING" || !params?.externalId) return;
    const externalId = params.externalId;
    const provider = post.mediaProvider || "openai";
    const userId = post.userId;

    try {
      let isComplete = false;
      let isFailed = false;
      let finalUrl = "";
      let progress = post.progress || 0;
      let errorMessage = "";

      if (provider.includes("kie")) {
        const checkRes = await axios.get(
          `${KIE_BASE_URL}/jobs/recordInfo?taskId=${externalId}`,
          { headers: { Authorization: `Bearer ${KIE_API_KEY}` } }
        );
        if (checkRes.data.data.state === "success") {
          const resJson = JSON.parse(checkRes.data.data.resultJson);
          finalUrl = resJson.resultUrls?.[0] || resJson.videoUrl;
          isComplete = true;
        } else if (checkRes.data.data.state === "fail") {
          isFailed = true;
          errorMessage = checkRes.data.data.failMsg;
        } else progress = Math.min(95, progress + 5);
      } else if (provider.includes("kling")) {
        const checkUrl =
          params.statusUrl || `${FAL_BASE_PATH}/requests/${externalId}/status`;
        const statusRes = await axios.get(checkUrl, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        });
        if (statusRes.data.status === "COMPLETED") {
          const resultRes = await axios.get(statusRes.data.response_url, {
            headers: { Authorization: `Key ${FAL_KEY}` },
          });
          finalUrl = resultRes.data.video.url;
          isComplete = true;
        } else if (statusRes.data.status === "FAILED") {
          isFailed = true;
          errorMessage = statusRes.data.error;
        } else progress = Math.min(90, progress + 5);
      }

      // ✅ CLOUDINARY FALLBACK FIX
      if (isComplete && finalUrl) {
        console.log(`✅ Job ${externalId} Completed! Uploading...`);
        try {
          const cloudUrl = await this.uploadToCloudinary(
            finalUrl,
            post.id,
            userId,
            "Video",
            "video"
          );
          await this.finalizePost(post.id, cloudUrl, provider, userId);
        } catch (uploadError: any) {
          console.error("❌ Cloudinary Failed:", uploadError.message);
          console.warn("⚠️ Fallback: Using Raw FAL URL");
          await this.finalizePost(post.id, finalUrl, provider, userId);
        }
      } else if (isFailed) {
        await airtableService.updatePost(post.id, {
          status: "FAILED",
          error: errorMessage,
          progress: 0,
        });
        const costToRefund = params?.cost || 5;
        await airtableService.refundUserCredit(userId, costToRefund);
      } else {
        if (progress !== post.progress)
          await airtableService.updatePost(post.id, { progress });
      }
    } catch (error: any) {
      console.error(`Check Status Critical Error (${post.id}):`, error.message);
    }
  },

  async finalizePost(
    postId: string,
    url: string,
    provider: string,
    userId: string
  ) {
    const post = await airtableService.updatePost(postId, {
      mediaUrl: url,
      mediaProvider: provider,
      status: "READY",
      progress: 100,
      generationStep: "COMPLETED",
    });

    const params = post.generationParams as any;
    if (params?.source === "DRIFT_EDITOR") {
      console.log("💾 Auto-saving Drift result to Asset Library...");
      await airtableService.createAsset(userId, url, "16:9", "VIDEO");
    }
    await ROIService.incrementMediaGenerated(userId);
  },

  // === IMAGE GEN ===
  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(
      `🎨 Gemini 3 Pro Gen for Post ${postId} | AR: ${params.aspectRatio}`
    );
    try {
      const refUrls =
        params.imageReferences ||
        (params.imageReference ? [params.imageReference] : []);
      const refBuffers = await this.downloadAndOptimizeImages(refUrls);
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

      const cloudUrl = await this.uploadToCloudinary(
        buf,
        postId,
        params.userId,
        "Gemini 3 Pro Image",
        "image"
      );
      await this.finalizePost(postId, cloudUrl, "gemini-3-pro", params.userId);
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

  // === CAROUSEL GEN ===
  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any
  ) {
    console.log(`🎠 Gemini 3 Pro Carousel for Post ${postId}`);
    try {
      const imageUrls: string[] = [];
      const userRefBuffers = await this.downloadAndOptimizeImages(
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
        const url = await this.uploadToCloudinary(
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

  async downloadAndOptimizeImages(urls: string[]): Promise<Buffer[]> {
    if (urls.length === 0) return [];
    const promises = urls.map(async (rawUrl) => {
      try {
        const url = getOptimizedUrl(rawUrl);
        const res = await axios.get(url, { responseType: "arraybuffer" });
        return await sharp(res.data)
          .resize(1024, 1024, { fit: "inside" })
          .toFormat("jpeg", { quality: 80 })
          .toBuffer();
      } catch (e) {
        return null;
      }
    });
    const results = await Promise.all(promises);
    return results.filter((buf): buf is Buffer => buf !== null);
  },

  async uploadToCloudinary(
    f: any,
    p: string,
    u: string,
    t: string,
    r: string
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const options = {
        resource_type: r as "auto" | "image" | "video" | "raw",
        folder: `visionlight/user_${u}/${r}s`,
        public_id: p,
        overwrite: true,
        context: { caption: t, alt: t },
      };

      if (Buffer.isBuffer(f))
        cloudinary.uploader
          .upload_stream(options, (err, res) =>
            err ? reject(err) : resolve(res!.secure_url)
          )
          .end(f);
      else
        cloudinary.uploader.upload(
          f,
          { ...options, timeout: 120000 },
          (err, res) => (err ? reject(err) : resolve(res!.secure_url))
        );
    });
  },
};
