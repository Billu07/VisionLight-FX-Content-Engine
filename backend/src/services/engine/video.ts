import axios from "axios";
import sharp from "sharp";
import { dbService as airtableService, Post, CreditPool } from "../database";
import { ROIService } from "../roi";
import { processVideoAssetBackground } from "./processor";
import {
  uploadToCloudinary,
  getOptimizedUrl,
  resizeStrict,
  resizeWithGemini,
  resizeWithBlurFill,
} from "./utils";
import {
  KIE_BASE_URL,
  KIE_API_KEY,
  FAL_BASE_PATH,
  FAL_KEY,
} from "./config";

export interface TenantApiKeys {
  falApiKey?: string;
  kieApiKey?: string;
  openaiApiKey?: string;
}

function getChargedPool(params: any): CreditPool | undefined {
  const pool = params?.chargedPool;
  if (
    pool === "creditsPicDrift" ||
    pool === "creditsPicDriftPlus" ||
    pool === "creditsImageFX" ||
    pool === "creditsVideoFX1" ||
    pool === "creditsVideoFX2" ||
    pool === "creditsVideoFX3"
  ) {
    return pool;
  }
  return undefined;
}

async function refundChargedPool(userId: string, params: any) {
  const pool = getChargedPool(params);
  const cost = Number(params?.cost);
  if (!pool || !Number.isFinite(cost) || cost <= 0) return;
  await airtableService.refundGranularCredits(userId, pool, cost);
}

// Convert Sliders to Prompt
const getKlingCameraPrompt = (h: number, v: number, z: number) => {
  const parts: string[] = [];
  // Thresholds adjusted for -10 to 10 range (Frontend sliders)
  if (h > 1) parts.push("Camera orbits right");
  else if (h < -1) parts.push("Camera orbits left");
  if (v > 1) parts.push("Camera cranes up");
  else if (v < -1) parts.push("Camera cranes down");
  
  // Zoom logic: Zoom slider is -10 to 10 in frontend
  // Mapping: > 0 is In, < 0 is Out
  if (z > 1) parts.push("Camera zooms in");
  else if (z < -1) parts.push("Camera zooms out");

  if (parts.length === 0) return "Static camera, subtle motion";
  return parts.join(", ") + ". Smooth cinematic movement.";
};

const toBoolean = (value: any, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const isLikelyVideoUrl = (url?: string) => {
  if (!url || typeof url !== "string") return false;
  const normalized = url.toLowerCase();
  return (
    normalized.endsWith(".mp4") ||
    normalized.endsWith(".mov") ||
    normalized.includes("/video/") ||
    normalized.includes(".mp4?") ||
    normalized.includes(".mov?")
  );
};

const isLikelyAudioUrl = (url?: string) => {
  if (!url || typeof url !== "string") return false;
  const normalized = url.toLowerCase();
  return (
    normalized.endsWith(".mp3") ||
    normalized.endsWith(".wav") ||
    normalized.endsWith(".m4a") ||
    normalized.endsWith(".aac") ||
    normalized.endsWith(".ogg") ||
    normalized.includes(".mp3?") ||
    normalized.includes(".wav?") ||
    normalized.includes(".m4a?") ||
    normalized.includes(".aac?") ||
    normalized.includes(".ogg?")
  );
};

export const videoLogic = {
  // === DRIFT VIDEO PATH (Kling 2.6 Pro) ===
  async processKlingDrift(
    userId: string,
    assetUrl: string,
    prompt: string,
    horizontal: number,
    vertical: number,
    zoom: number,
    userAspectRatio?: string,
    duration: string = "5",
    generateAudio: boolean = false,
    projectId?: string,
    chargedPool: CreditPool = "creditsPicDrift",
    chargedCost: number = 0,
    apiKeys?: TenantApiKeys
  ) {
    try {
      console.log(
        `🎬 Kling 2.6 Drift Request: H${horizontal} V${vertical} Z${zoom} | AR: ${userAspectRatio} | Dur: ${duration} | Audio: ${generateAudio} | Project: ${projectId}`,
      );

      // ✅ FIX: Download Image FIRST to detect aspect ratio
      // Custom 1080p optimization logic (prefer 1920w over 1280w default)
      let rawUrl = assetUrl;
      if (
        rawUrl &&
        typeof rawUrl === "string" &&
        rawUrl.includes("cloudinary.com") &&
        rawUrl.includes("/upload/")
      ) {
        rawUrl = rawUrl.replace(
          "/upload/",
          "/upload/w_1920,c_limit,q_auto,f_jpg/",
        );
      } else {
        rawUrl = getOptimizedUrl(assetUrl);
      }

      const imageResponse = await axios.get(rawUrl, {
        responseType: "arraybuffer",
      });
      const originalBuffer = Buffer.from(imageResponse.data);
      const metadata = await sharp(originalBuffer).metadata();
      const width = metadata.width || 1024;
      const height = metadata.height || 576;

      // ✅ FIX: Auto-Detect Ratio if "original" or undefined is passed
      if (!userAspectRatio || userAspectRatio === "original") {
        if (height > width) userAspectRatio = "9:16";
        else if (Math.abs(width - height) < 100) userAspectRatio = "1:1";
        else userAspectRatio = "16:9";
        console.log(`📏 Auto-detected Drift Ratio: ${userAspectRatio}`);
      }

      // Now set target dimensions based on the (potentially auto-detected) ratio
      let targetWidth = 1920;
      let targetHeight = 1080;
      let targetRatioString = "16:9";

      if (userAspectRatio === "9:16" || userAspectRatio === "portrait") {
        targetWidth = 1080;
        targetHeight = 1920;
        targetRatioString = "9:16";
      } else if (userAspectRatio === "1:1" || userAspectRatio === "square") {
        targetWidth = 1024;
        targetHeight = 1024;
        targetRatioString = "1:1";
      }

      const sourceAR = width / height;
      const targetAR = targetWidth / targetHeight;
      let finalImageUrl = rawUrl;

      // Logic:
      // 1. If Ratio Mismatch > 5% -> Gemini Outpaint (Returns 2K image) -> Upload
      // 2. If Ratio Matches but Size is too small (e.g. 720p source) -> Upscale Strict -> Upload
      // 3. Else -> Use optimized rawUrl (Already >= 1080p and correct ratio)

      if (Math.abs(sourceAR - targetAR) > 0.05) {
        try {
          const outpaintedBuffer = await resizeWithGemini(
            originalBuffer,
            targetWidth,
            targetHeight,
            targetRatioString as any,
            apiKeys,
          );
          finalImageUrl = await uploadToCloudinary(
            outpaintedBuffer,
            `drift_temp_${userId}_${Date.now()}`,
            userId,
            "Drift Temp Frame",
            "image",
          );
        } catch (e) {
          console.warn("Outpaint failed, proceeding with original.");
        }
      } else if (width < targetWidth * 0.9) {
        // Upscale if width is less than 90% of target (buffer for small rounding diffs)
        try {
          console.log(`🔍 Upscaling Drift Input: ${width} -> ${targetWidth}`);
          const resizedBuffer = await resizeStrict(
            originalBuffer,
            targetWidth,
            targetHeight,
          );
          finalImageUrl = await uploadToCloudinary(
            resizedBuffer,
            `drift_upscale_${userId}_${Date.now()}`,
            userId,
            "Drift Upscale Frame",
            "image",
          );
        } catch (e) {
          console.warn("Upscale failed, proceeding with original.");
        }
      }

      const cameraMove = getKlingCameraPrompt(horizontal, vertical, zoom);
      
      // ✅ IMPROVED PROMPT LOGIC:
      // If user provides a prompt, we use ONLY their prompt.
      // If not, we use the generated camera move pre-prompt.
      const userPrompt = prompt?.trim();
      const finalPrompt = userPrompt ? userPrompt : `The scene. Action: ${cameraMove}. Style: High fidelity, smooth motion, cinematic 3D depth, professional lighting.`;

      const credentials = apiKeys?.falApiKey;
      if (!credentials) throw new Error("API Key is missing. Please configure your Fal AI key in the Admin Panel.");

      // ✅ 2.6 Payload
      const payload: any = {
        prompt: finalPrompt,
        start_image_url: finalImageUrl,
        duration: duration,
        generate_audio: generateAudio,
      };

      const url = `${FAL_BASE_PATH}/image-to-video`;
      const submitRes = await axios.post(url, payload, {
        headers: {
          Authorization: `Key ${credentials}`,
          "Content-Type": "application/json",
        },
      });

      const post = await airtableService.createPost({
        userId,
        projectId,
        title: "Drift Path 3DX",
        prompt: finalPrompt,
        mediaType: "VIDEO",
        platform: "Visionlight",
        status: "PROCESSING",
        mediaProvider: "kling",
        imageReference: assetUrl,
        generationParams: {
          source: "DRIFT_EDITOR",
          externalId: submitRes.data.request_id,
          statusUrl: submitRes.data.status_url,
          aspectRatio: targetRatioString,
          chargedPool,
          cost: chargedCost,
        },
      });

      return {
        success: true,
        postId: post.id,
        requestId: submitRes.data.request_id,
        statusUrl: submitRes.data.status_url,
      };
    } catch (e: any) {
      throw new Error(`Drift failed: ${e.response?.data?.detail || e.message}`);
    }
  },

  async checkToolStatus(statusUrl: string, apiKeys?: TenantApiKeys) {
    const credentials = apiKeys?.falApiKey;
    if (!credentials) throw new Error("API Key is missing. Please configure your Fal AI key in the Admin Panel.");

    const res = await axios.get(statusUrl, {
      headers: { Authorization: `Key ${credentials}` },
    });
    return res.data;
  },

  // === TIMELINE VIDEO GEN ===
  async startVideoGeneration(postId: string, finalPrompt: string, params: any, apiKeys?: TenantApiKeys) {
    console.log(
      `🎬 Video Gen for ${postId} | Model: ${params.model} | AR: ${params.aspectRatio}`,
    );
    const model = typeof params.model === "string" ? params.model : "";
    const isSeedanceFal = model.includes("seedance-fal");
    const isTopazUpscale = model === "topaz-upscale-video";
    // Check for Kling variants
    const isKling = model.includes("kling");
    const isKling3 = model === "kling-3";

    // Check for Veo
    const isVeo = model === "veo-3";

    const isUnsupported =
      !isKling && !isVeo && !isSeedanceFal && !isTopazUpscale;
    const isPro = model.includes("pro") || model.includes("Pro");
    const videoGenerationMode =
      typeof params.videoGenerationMode === "string"
        ? params.videoGenerationMode
        : undefined;

    try {
      if (isUnsupported) {
        throw new Error(
          `Unsupported video model "${model}". Use a Fal-backed model.`,
        );
      }

      let targetWidth = 1280;
      let targetHeight = 720;
      let targetRatioString = "16:9";

      if (params.aspectRatio === "portrait" || params.aspectRatio === "9:16") {
        targetWidth = 720;
        targetHeight = 1280;
        targetRatioString = "9:16";
      } else if (
        params.aspectRatio === "square" ||
        params.aspectRatio === "1:1"
      ) {
        targetWidth = 1024;
        targetHeight = 1024;
        targetRatioString = "1:1";
      } else if (params.aspectRatio === "4:3") {
        targetWidth = 1024;
        targetHeight = 768;
        targetRatioString = "4:3";
      } else if (params.aspectRatio === "3:4") {
        targetWidth = 768;
        targetHeight = 1024;
        targetRatioString = "3:4";
      } else if (params.aspectRatio === "21:9") {
        targetWidth = 1680;
        targetHeight = 720;
        targetRatioString = "21:9";
      }

      if (params.resolution === "1080p" || isKling3) {
        if (targetRatioString === "16:9") {
          targetWidth = 1920;
          targetHeight = 1080;
        } else if (targetRatioString === "9:16") {
          targetWidth = 1080;
          targetHeight = 1920;
        }
      }

      // For Veo 4K
      if (isVeo && params.resolution === "4k") {
        if (targetRatioString === "16:9") {
          targetWidth = 3840;
          targetHeight = 2160;
        } else if (targetRatioString === "9:16") {
          targetWidth = 2160;
          targetHeight = 3840;
        }
      }

      const referenceUrls = (params.imageReferences || []).filter(
        (url: any): url is string => typeof url === "string" && url.length > 0,
      );
      const imageRefUrls: string[] = Array.isArray(params.referenceImageUrls)
        ? params.referenceImageUrls.filter(
            (url: any): url is string => typeof url === "string" && url.length > 0,
          )
        : referenceUrls.filter(
            (url: string) => !isLikelyVideoUrl(url) && !isLikelyAudioUrl(url),
          );
      const videoRefUrls: string[] = Array.isArray(params.referenceVideoUrls)
        ? params.referenceVideoUrls.filter(
            (url: any): url is string => typeof url === "string" && url.length > 0,
          )
        : referenceUrls.filter((url: string) => isLikelyVideoUrl(url));
      const audioRefUrls: string[] = Array.isArray(params.referenceAudioUrls)
        ? params.referenceAudioUrls.filter(
            (url: any): url is string => typeof url === "string" && url.length > 0,
          )
        : referenceUrls.filter((url: string) => isLikelyAudioUrl(url));

      let finalInputImageBuffer: Buffer | undefined;
      const rawRefUrl = imageRefUrls[0] || params.imageReference;

      // Preprocess reference frame only for models that benefit from strict canvas fitting.
      // Seedance generally performs better with original reference frames.
      const shouldPreprocessReference =
        rawRefUrl &&
        params.hasReferenceImage &&
        !isVeo &&
        !isSeedanceFal;

      if (shouldPreprocessReference) {
        try {
          const imageResponse = await axios.get(getOptimizedUrl(rawRefUrl), {
            responseType: "arraybuffer",
            timeout: 60000,
          });
          const originalImageBuffer = Buffer.from(imageResponse.data);
          const metadata = await sharp(originalImageBuffer).metadata();
          const sourceAR = (metadata.width || 1) / (metadata.height || 1);
          const targetAR = targetWidth / targetHeight;

          if (Math.abs(sourceAR - targetAR) > 0.05) {
            try {
              finalInputImageBuffer = await resizeWithGemini(
                originalImageBuffer,
                targetWidth,
                targetHeight,
                targetRatioString as any,
                apiKeys,
              );
            } catch (e) {
              finalInputImageBuffer = await resizeWithBlurFill(
                originalImageBuffer,
                targetWidth,
                targetHeight,
              );
            }
          } else {
            finalInputImageBuffer = await resizeStrict(
              originalImageBuffer,
              targetWidth,
              targetHeight,
            );
          }
        } catch (e: any) {
          console.error("❌ Processing Failed:", e.message);
        }
      }

      let externalId = "";
      let statusUrl = "";
      let provider = "";

      if (isVeo) {
        provider = "veo";
        const referenceUrls = (params.imageReferences || []).filter(
          (url: any): url is string => typeof url === "string" && url.length > 0,
        );
        const primaryRefUrl = referenceUrls[0] || params.imageReference;
        const secondaryRefUrl = referenceUrls[1];

        const requestedDuration = Number(params.duration);
        const normalizedDuration =
          requestedDuration === 4 || requestedDuration === 6 || requestedDuration === 8
            ? `${requestedDuration}s`
            : "8s";
        const normalizedResolution =
          params.resolution === "1080p" || params.resolution === "4k"
            ? params.resolution
            : "720p";

        let veoMode = typeof params.veoMode === "string" ? params.veoMode : "";
        if (!veoMode) {
          if (isLikelyVideoUrl(primaryRefUrl)) {
            veoMode = "extend_video";
          } else if (
            referenceUrls.length > 2 &&
            referenceUrls.every((url: string) => !isLikelyVideoUrl(url))
          ) {
            veoMode = "reference_to_video";
          } else if (
            primaryRefUrl &&
            secondaryRefUrl &&
            !isLikelyVideoUrl(primaryRefUrl) &&
            !isLikelyVideoUrl(secondaryRefUrl)
          ) {
            veoMode = "first_last_frame";
          } else if (primaryRefUrl) {
            veoMode = "image_to_video";
          } else {
            veoMode = "image_to_video";
          }
        }
        params.veoMode = veoMode;

        const payload: any = {
          prompt: finalPrompt,
          aspect_ratio: targetRatioString === "16:9" ? "16:9" : "9:16",
          generate_audio: toBoolean(params.generateAudio, true),
          auto_fix: toBoolean(params.autoFix, true),
        };

        let endpoint = "fal-ai/veo3.1/image-to-video";
        if (veoMode === "extend_video") {
          if (!primaryRefUrl || !isLikelyVideoUrl(primaryRefUrl)) {
            throw new Error("Veo extend mode requires a valid source video.");
          }
          endpoint = "fal-ai/veo3.1/extend-video";
          payload.video_url = getOptimizedUrl(primaryRefUrl);
          payload.duration = "7s";
          payload.resolution = "720p";
          params.duration = 7;
          params.resolution = "720p";
        } else if (veoMode === "reference_to_video") {
          if (referenceUrls.length === 0) {
            throw new Error("Veo reference mode requires at least one reference image.");
          }
          if (referenceUrls.some((url: string) => isLikelyVideoUrl(url))) {
            throw new Error("Veo reference mode only accepts image references.");
          }
          endpoint = "fal-ai/veo3.1/reference-to-video";
          payload.image_urls = referenceUrls.map((url: string) =>
            getOptimizedUrl(url),
          );
          payload.duration = "8s";
          payload.resolution = normalizedResolution;
          params.duration = 8;
          params.resolution = normalizedResolution;
        } else if (veoMode === "first_last_frame") {
          if (!primaryRefUrl || !secondaryRefUrl) {
            throw new Error("Veo first/last mode requires both first and last frame images.");
          }
          if (isLikelyVideoUrl(primaryRefUrl) || isLikelyVideoUrl(secondaryRefUrl)) {
            throw new Error("Veo first/last mode only accepts image frames.");
          }
          endpoint = "fal-ai/veo3.1/first-last-frame-to-video";
          payload.first_frame_url = getOptimizedUrl(primaryRefUrl);
          payload.last_frame_url = getOptimizedUrl(secondaryRefUrl);
          payload.duration = normalizedDuration;
          payload.resolution = normalizedResolution;
          params.duration = Number(normalizedDuration.replace("s", ""));
          params.resolution = normalizedResolution;
        } else {
          if (!primaryRefUrl || isLikelyVideoUrl(primaryRefUrl)) {
            throw new Error("Veo image-to-video mode requires an image source.");
          }
          endpoint = "fal-ai/veo3.1/image-to-video";
          payload.image_url = getOptimizedUrl(primaryRefUrl);
          payload.duration = normalizedDuration;
          payload.resolution = normalizedResolution;
          params.duration = Number(normalizedDuration.replace("s", ""));
          params.resolution = normalizedResolution;
        }

        if (veoMode !== "reference_to_video") {
          if (
            typeof params.negativePrompt === "string" &&
            params.negativePrompt.trim()
          ) {
            payload.negative_prompt = params.negativePrompt.trim();
          }
          if (
            params.seed !== undefined &&
            params.seed !== null &&
            `${params.seed}`.trim() !== ""
          ) {
            const parsedSeed = Number(params.seed);
            if (Number.isFinite(parsedSeed)) {
              payload.seed = Math.max(0, Math.floor(parsedSeed));
            }
          }
        }

        console.log(`Veo Request: ${endpoint}`, JSON.stringify(payload, null, 2));

        const falKey = apiKeys?.falApiKey;
        if (!falKey) throw new Error("API Key is missing. Please configure your Fal AI key in the Admin Panel.");

        const url = `https://queue.fal.run/${endpoint}`;
        const submitRes = await axios.post(url, payload, {
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
        });
        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      } else if (isKling) {
        provider = "kling";
        let klingInputUrl = "";
        let klingEndUrl = "";
        let isImageToVideo = false;

        if (finalInputImageBuffer) {
          klingInputUrl = await uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_kling_start`,
            params.userId,
            "Kling Start",
            "image",
          );
          isImageToVideo = true;

          if (params.imageReferences && params.imageReferences.length > 1) {
            try {
              const tailRaw = getOptimizedUrl(params.imageReferences[1]);
              const tailResp = await axios.get(tailRaw, {
                responseType: "arraybuffer",
              });
              let processedTail = await resizeStrict(
                Buffer.from(tailResp.data),
                targetWidth,
                targetHeight,
              );
              klingEndUrl = await uploadToCloudinary(
                processedTail,
                `${postId}_kling_end`,
                params.userId,
                "Kling End",
                "image",
              );
              await airtableService.updatePost(postId, {
                generatedEndFrame: klingEndUrl,
              });
            } catch (e) {}
          }
        } else if (params.imageReference) {
          // ✅ FIX: Force 1080p Source if Target is 1080p
          if (targetWidth >= 1920 || targetHeight >= 1920) {
             let rawUrl = params.imageReference;
             if (rawUrl && typeof rawUrl === "string" && rawUrl.includes("cloudinary.com") && rawUrl.includes("/upload/")) {
                klingInputUrl = rawUrl.replace("/upload/", "/upload/w_1920,c_limit,q_auto,f_jpg/");
             } else {
                klingInputUrl = getOptimizedUrl(params.imageReference);
             }
          } else {
             klingInputUrl = getOptimizedUrl(params.imageReference);
          }
          isImageToVideo = true;
        }

        // Determine URL and Payload based on Version
        let url = "";
        const payload: any = {
          prompt: finalPrompt,
          duration: params.duration ? params.duration.toString() : "5",
        };

        if (isKling3) {
          // Kling 3 (PicDrift Plus) - Using PRO Endpoint for best quality
          const base = "https://queue.fal.run/fal-ai/kling-video/v3/pro";
          url = `${base}/${isImageToVideo ? "image-to-video" : "text-to-video"}`;

          if (isImageToVideo) {
            payload.start_image_url = klingInputUrl; // V3 Pro uses start_image_url
            if (klingEndUrl) {
              payload.end_image_url = klingEndUrl;
            }
            // Audio allowed with end frame in v3
            payload.generate_audio =
              params.generateAudio === "true" || params.generateAudio === true;
            
            // ✅ Fix: Explicitly send aspect ratio for V3 Pro Image-to-Video
            payload.aspect_ratio = targetRatioString;
          } else {
            payload.aspect_ratio = targetRatioString;
            payload.generate_audio = true;
          }
        } else {
          // Kling 2.5 (Standard)
          url = `${FAL_BASE_PATH}/${isImageToVideo ? "image-to-video" : "text-to-video"}`;

          if (isImageToVideo) {
            payload.start_image_url = klingInputUrl; // v2.6 uses start_image_url
            if (klingEndUrl) {
              payload.end_image_url = klingEndUrl;
              // v2.6 constraint: NO audio with end frame
              payload.generate_audio = false;
            } else {
              payload.generate_audio =
                params.generateAudio === "true" || params.generateAudio === true;
            }
          } else {
            payload.aspect_ratio = targetRatioString;
          }
        }

        const falKey = apiKeys?.falApiKey;
        if (!falKey) throw new Error("API Key is missing. Please configure your Fal AI key in the Admin Panel.");

        const submitRes = await axios.post(url, payload, {
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
        });
        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      } else if (isTopazUpscale) {
        provider = "topaz-upscale";

        const normalizedVideoRefs = videoRefUrls.map((url: string) =>
          getOptimizedUrl(url),
        );
        const fallbackVideoRef = isLikelyVideoUrl(params.imageReference)
          ? getOptimizedUrl(params.imageReference)
          : "";
        const sourceVideoUrl = normalizedVideoRefs[0] || fallbackVideoRef;
        if (!sourceVideoUrl) {
          throw new Error("Topaz Upscale requires a source video reference.");
        }

        const upscaleFactorRaw = Number(params.upscaleFactor);
        const upscaleFactor =
          Number.isFinite(upscaleFactorRaw) && upscaleFactorRaw >= 1
            ? Math.min(8, Math.max(1, upscaleFactorRaw))
            : 2;
        const targetFpsRaw = Number(params.targetFps);
        const targetFps =
          Number.isFinite(targetFpsRaw) && targetFpsRaw > 0
            ? Math.min(120, Math.round(targetFpsRaw))
            : undefined;

        const payload: any = {
          video_url: sourceVideoUrl,
          model: "Proteus",
          upscale_factor: upscaleFactor,
        };
        if (targetFps) payload.target_fps = targetFps;

        console.log("Topaz Upscale Request:", JSON.stringify(payload, null, 2));

        const falKey = apiKeys?.falApiKey;
        if (!falKey) {
          throw new Error(
            "API Key is missing. Please configure your Fal AI key in the Admin Panel.",
          );
        }

        const submitRes = await axios.post(
          "https://queue.fal.run/fal-ai/topaz/upscale/video",
          payload,
          {
            headers: {
              Authorization: `Key ${falKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      } else if (isSeedanceFal) {
        provider = "seedance-fal";
        const imageRefs = imageRefUrls.map((url: string) => getOptimizedUrl(url));
        const videoRefs = videoRefUrls.map((url: string) => getOptimizedUrl(url));
        const audioRefs = audioRefUrls.map((url: string) => getOptimizedUrl(url));
        const falMode =
          videoGenerationMode === "text" ||
          videoGenerationMode === "frames" ||
          videoGenerationMode === "references"
            ? videoGenerationMode
            : audioRefs.length > 0 || videoRefs.length > 0 || imageRefs.length > 2
              ? "references"
              : imageRefs.length > 0
                ? "frames"
                : "text";
        const parsedDuration =
          params.duration === "auto"
            ? "auto"
            : Math.max(4, Math.min(15, Number(params.duration) || 8));
        const falAspectRatio =
          params.aspectRatio === "auto" || params.aspectRatio === "adaptive"
            ? "auto"
            : params.aspectRatio === "1:1" ||
                params.aspectRatio === "4:3" ||
                params.aspectRatio === "3:4" ||
                params.aspectRatio === "16:9" ||
                params.aspectRatio === "9:16" ||
                params.aspectRatio === "21:9"
              ? params.aspectRatio
              : targetRatioString === "4:3" ||
                  targetRatioString === "3:4" ||
                  targetRatioString === "21:9"
                ? targetRatioString
                : targetRatioString === "9:16"
                  ? "9:16"
                  : targetRatioString === "1:1"
                    ? "1:1"
                    : "16:9";

        const payload: any = {
          prompt: finalPrompt,
          resolution:
            params.resolution === "480p" ||
            params.resolution === "720p" ||
            params.resolution === "1080p"
              ? params.resolution
              : "720p",
          duration: parsedDuration,
          aspect_ratio: falAspectRatio,
          generate_audio: toBoolean(params.generateAudio, true),
        };
        if (params.seed !== undefined && params.seed !== null && `${params.seed}`.trim() !== "") {
          const parsedSeed = Number(params.seed);
          if (Number.isFinite(parsedSeed)) payload.seed = Math.max(0, Math.floor(parsedSeed));
        }

        let endpoint = "bytedance/seedance-2.0/text-to-video";
        if (falMode === "frames") {
          endpoint = "bytedance/seedance-2.0/image-to-video";
          if (finalInputImageBuffer) {
            payload.image_url = await uploadToCloudinary(
              finalInputImageBuffer,
              `${postId}_seedance_fal_input`,
              params.userId,
              "Seedance Fal Input",
              "image",
            );
          } else if (imageRefs[0]) {
            payload.image_url = imageRefs[0];
          } else if (params.imageReference) {
            payload.image_url = getOptimizedUrl(params.imageReference);
          } else {
            throw new Error("Frame mode requires at least one image reference.");
          }
          if (imageRefs.length > 1) {
            payload.end_image_url = imageRefs[1];
          }
        } else if (falMode === "references") {
          endpoint = "bytedance/seedance-2.0/reference-to-video";
          if (imageRefs.length > 0) payload.image_urls = imageRefs;
          if (videoRefs.length > 0) payload.video_urls = videoRefs;
          if (audioRefs.length > 0) payload.audio_urls = audioRefs;
          if (
            audioRefs.length > 0 &&
            imageRefs.length === 0 &&
            videoRefs.length === 0
          ) {
            throw new Error(
              "Audio references require at least one image or video reference.",
            );
          }
          if (
            imageRefs.length === 0 &&
            videoRefs.length === 0 &&
            audioRefs.length === 0
          ) {
            throw new Error("Reference mode requires at least one reference.");
          }
        }

        const falSeedanceLogPayload = {
          ...payload,
          image_urls: payload.image_urls
            ? `[${payload.image_urls.length} image refs]`
            : undefined,
          video_urls: payload.video_urls
            ? `[${payload.video_urls.length} video refs]`
            : undefined,
          audio_urls: payload.audio_urls
            ? `[${payload.audio_urls.length} audio refs]`
            : undefined,
          image_url: payload.image_url ? "[image_url_set]" : undefined,
          end_image_url: payload.end_image_url ? "[end_image_url_set]" : undefined,
        };
        console.log(
          `Seedance Fal Request: ${endpoint}`,
          JSON.stringify(falSeedanceLogPayload, null, 2),
        );

        const falKey = apiKeys?.falApiKey;
        if (!falKey) throw new Error("API Key is missing. Please configure your Fal AI key in the Admin Panel.");

        const submitRes = await axios.post(`https://queue.fal.run/${endpoint}`, payload, {
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
        });
        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      }

      await airtableService.updatePost(postId, {
        generationParams: { ...params, externalId, statusUrl },
        mediaProvider: provider,
        status: "PROCESSING",
      });
    } catch (error: any) {
      console.error(
        `Video generation provider failure (${postId}):`,
        error?.message || error,
      );
      const providerErrorPayload =
        typeof error?.response?.data === "string"
          ? error.response.data
          : error?.response?.data
            ? JSON.stringify(error.response.data)
            : "";
      if (providerErrorPayload) {
        console.error("Provider Error Payload:", providerErrorPayload);
      }
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: providerErrorPayload
          ? `${error.message} | ${providerErrorPayload}`
          : error.message,
        progress: 0,
      });
      await refundChargedPool(params.userId, params);
    }
  },

  async checkPostStatus(post: Post, apiKeys?: TenantApiKeys) {
    const params = post.generationParams as any;
    if (post.status !== "PROCESSING" || !params?.externalId) return;
    const externalId = params.externalId;
    const provider = post.mediaProvider || "";
    const userId = post.userId;

    try {
      let isComplete = false;
      let isFailed = false;
      let finalUrl = "";
      let progress = post.progress || 0;
      let errorMessage = "";

      if (provider.includes("kie")) {
        const kieKey = apiKeys?.kieApiKey || KIE_API_KEY;
        const checkRes = await axios.get(
          `${KIE_BASE_URL}/jobs/recordInfo?taskId=${externalId}`,
          { headers: { Authorization: `Bearer ${kieKey}` } },
        );
        const kieCheckCode = checkRes?.data?.code;
        const kieCheckCodeNumeric = Number(kieCheckCode);
        const isKieCheckAccepted =
          (Number.isFinite(kieCheckCodeNumeric) && kieCheckCodeNumeric === 200) ||
          kieCheckCode === "200";
        if (!isKieCheckAccepted) {
          isFailed = true;
          errorMessage =
            checkRes?.data?.msg ||
            checkRes?.data?.message ||
            `KIE status check rejected (${String(kieCheckCode)})`;
        } else if (checkRes.data.data.state === "success") {
          const rawResult = checkRes?.data?.data?.resultJson;
          let parsedResult: any = null;
          if (typeof rawResult === "string" && rawResult.trim()) {
            try {
              parsedResult = JSON.parse(rawResult);
            } catch {
              parsedResult = null;
            }
          } else if (rawResult && typeof rawResult === "object") {
            parsedResult = rawResult;
          }
          finalUrl =
            parsedResult?.resultUrls?.[0] ||
            parsedResult?.result_urls?.[0] ||
            checkRes?.data?.data?.resultUrls?.[0] ||
            checkRes?.data?.data?.result_urls?.[0] ||
            "";
          if (finalUrl) {
            isComplete = true;
          } else {
            isFailed = true;
            errorMessage = "KIE marked success but returned no result URL.";
          }
        } else if (checkRes.data.data.state === "fail") {
          isFailed = true;
          errorMessage = checkRes.data.data.failMsg;
        } else progress = Math.min(95, progress + 5);
      } else if (
        provider.includes("kling") ||
        provider.includes("veo") ||
        provider.includes("seedance-fal") ||
        provider.includes("topaz-upscale")
      ) {
        const falKey = apiKeys?.falApiKey || FAL_KEY;
        const checkUrl =
          params.statusUrl || `${FAL_BASE_PATH}/requests/${externalId}/status`;

        try {
          const statusRes = await axios.get(checkUrl, {
            headers: { Authorization: `Key ${falKey}` },
          });
          const data = statusRes.data;

          if (data.status === "COMPLETED") {
            const resultRes = await axios.get(data.response_url, {
              headers: { Authorization: `Key ${falKey}` },
            });
            // Robust parsing for different Fal models
            finalUrl = resultRes.data.video?.url || resultRes.data.url || resultRes.data.file_url;
            
            if (finalUrl) {
              isComplete = true;
            } else {
              isFailed = true;
              errorMessage = "Completed but no video URL found in response";
              console.error("❌ Missing URL in result:", JSON.stringify(resultRes.data));
            }
          } else if (data.status === "FAILED") {
            isFailed = true;
            errorMessage = statusRes.data.error;
          } else if (data.status === "IN_QUEUE") {
            progress = Math.max(10, progress);
          } else if (data.status === "IN_PROGRESS") {
            progress = Math.min(90, progress + 5);
          }
        } catch (pollErr: any) {
          const pollStatus = pollErr?.response?.status;
          const pollPayload =
            typeof pollErr?.response?.data === "string"
              ? pollErr.response.data
              : JSON.stringify(pollErr?.response?.data || {});
          console.error(
            `Poll Error (${pollStatus || "unknown"}) on ${checkUrl}: ${pollErr.message}`,
            pollPayload,
          );
          // 422 usually means invalid request/task id or malformed poll URL for this job.
          // Mark failed to stop infinite poll loops and issue refund path consistently.
          if (pollStatus === 422) {
            isFailed = true;
            errorMessage = `Fal poll rejected (422): ${pollPayload || "Unprocessable Entity"}`;
          }
        }
      } else if (provider.includes("openai")) {
        isFailed = true;
        errorMessage =
          "OpenAI video provider is no longer supported for new processing. Regenerate with a Fal model.";
      }

      if (isComplete && finalUrl) {
        try {
          const cloudUrl = await uploadToCloudinary(
            finalUrl,
            post.id,
            userId,
            "Video",
            "video",
          );
          await this.finalizePost(post.id, cloudUrl, provider, userId);
        } catch (e) {
          await this.finalizePost(post.id, finalUrl, provider, userId);
        }
      } else if (isFailed) {
        await airtableService.updatePost(post.id, {
          status: "FAILED",
          error: errorMessage || "Generation failed",
          progress: 0,
        });
        await refundChargedPool(userId, params);
      } else if (progress !== post.progress) {
        try {
          await airtableService.updatePost(post.id, { progress });
        } catch (e) {
          console.warn("Progress update failed (Ignored)");
        }
      }
    } catch (error: any) {
      console.error(`Check Status Error (${post.id}):`, error.message);
    }
  },

  async finalizePost(
    postId: string,
    url: string,
    provider: string,
    userId: string,
  ) {
    try {
      const post = await airtableService.updatePost(postId, {
        mediaUrl: url,
        mediaProvider: provider,
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });

      const params = post.generationParams as any;
      if (params?.source === "DRIFT_EDITOR") {
        try {
          const newAsset = await airtableService.createAsset(
            userId,
            url,
            params.aspectRatio || "16:9",
            "VIDEO",
            undefined,
            post.projectId || undefined
          );
          // Trigger background processing for proxy and sprite sheet
          processVideoAssetBackground(newAsset.id, url, userId).catch(e => console.error("Processor failure", e));
        } catch (e) {
          console.warn("Asset Save Failed");
        }
      }
      await ROIService.incrementMediaGenerated(userId);
    } catch (err) {
      console.error("Finalize Error:", err);
    }
  },
};

