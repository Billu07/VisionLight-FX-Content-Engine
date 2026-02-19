import axios from "axios";
import sharp from "sharp";
import FormData from "form-data";
import { dbService as airtableService, Post } from "../database";
import { ROIService } from "../roi";
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
  VIDEO_UPLOAD_TIMEOUT,
} from "./config";

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
    generateAudio: boolean = false, // ✅ ADDED
  ) {
    try {
      console.log(
        `🎬 Kling 2.6 Drift Request: H${horizontal} V${vertical} Z${zoom} | AR: ${userAspectRatio} | Audio: ${generateAudio}`,
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
      // If user provides a prompt, we use it as the subject.
      // If not, we describe the scene generally but prioritize the camera movement.
      const subject = prompt?.trim() || "The scene";
      const finalPrompt = `${subject}. Action: ${cameraMove}. Style: High fidelity, smooth motion, cinematic 3D depth, professional lighting.`;

      // ✅ 2.6 Payload
      const payload: any = {
        prompt: finalPrompt,
        start_image_url: finalImageUrl,
        duration: "5",
        generate_audio: generateAudio,
      };

      const url = `${FAL_BASE_PATH}/image-to-video`;
      const submitRes = await axios.post(url, payload, {
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
      });

      const post = await airtableService.createPost({
        userId,
        title: "Drift Shot (2.6)",
        prompt: finalPrompt,
        mediaType: "VIDEO",
        platform: "Internal",
        status: "PROCESSING",
        mediaProvider: "kling",
        imageReference: assetUrl,
        generationParams: {
          source: "DRIFT_EDITOR",
          externalId: submitRes.data.request_id,
          statusUrl: submitRes.data.status_url,
          aspectRatio: targetRatioString,
          cost: 0,
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

  async checkToolStatus(statusUrl: string) {
    const res = await axios.get(statusUrl, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    return res.data;
  },

  // === TIMELINE VIDEO GEN ===
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(
      `🎬 Video Gen for ${postId} | Model: ${params.model} | AR: ${params.aspectRatio}`,
    );
    const isKie = params.model.includes("kie");
    // Check for Kling variants
    const isKling = params.model.includes("kling");
    const isKling3 = params.model === "kling-3";

    // Check for Veo
    const isVeo = params.model === "veo-3";

    const isOpenAI = !isKie && !isKling && !isVeo;
    const isPro = params.model.includes("pro") || params.model.includes("Pro");

    try {
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

      let finalInputImageBuffer: Buffer | undefined;
      const rawRefUrl = params.imageReferences?.[0] || params.imageReference;

      // Veo does not support image input (Text-to-Video only)
      if (rawRefUrl && params.hasReferenceImage && !isVeo) {
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
        provider = "kling"; // Using Fal infrastructure (wrapper)

        let endpoint = "fal-ai/veo3.1"; // Default Text-to-Video
        const payload: any = {
          prompt: finalPrompt,
          resolution: params.resolution || "720p", // Default to 720p for safety
          aspect_ratio: targetRatioString === "16:9" ? "16:9" : "9:16",
          duration: params.duration ? `${params.duration}s` : "8s",
          generate_audio: true,
        };

        // Determine Mode based on Input
        // 1. EXTEND VIDEO (Input is a Video URL)
        if (
          params.imageReference &&
          (params.imageReference.endsWith(".mp4") ||
            params.imageReference.includes("/video/") ||
            params.imageReference.includes("cloudinary.com")) &&
            // Simple heuristic to check if it looks like a video
             !params.imageReference.match(/\.(jpg|jpeg|png|webp)$/i)
        ) {
          endpoint = "fal-ai/veo3.1/extend-video";
          payload.video_url = getOptimizedUrl(params.imageReference);
          
          // Extend Video specific constraints
          // API says: "Input videos up to 8 seconds"
          // API says: "duration" enum: "7s" (Wait, docs say "Default value: 7s", "Possible enum values: 7s")
          // Let's force 7s or stick to what API allows if different.
          // The API text says "Possible enum values: 7s" for Extend Video.
          payload.duration = "7s"; 
          
          // Remove unsupported params for extend
          delete payload.resolution; // API docs don't list resolution for extend input, but output is implicitly defined?
          // Actually, "resolution" IS listed in Extend Video Input schema in the text provided?
          // "resolution ResolutionEnum ... Default value: 720p" -> Yes it is.
          // Wait, earlier I saw "delete payload.resolution" in the old code. 
          // Re-reading API text for Extend Video:
          // Input Schema: prompt, aspect_ratio, duration, negative_prompt, resolution, generate_audio, seed, auto_fix, video_url
          // So resolution IS supported. I will keep it.
        } 
        // 2. IMAGE TO VIDEO (Single Image)
        else if (finalInputImageBuffer) {
           endpoint = "fal-ai/veo3.1/image-to-video";
           const veoInputUrl = await uploadToCloudinary(
             finalInputImageBuffer,
             `${postId}_veo_input`,
             params.userId,
             "Veo Input",
             "image",
           );
           payload.image_url = veoInputUrl;
        } 
        // 3. IMAGE TO VIDEO (URL Reference)
        else if (params.imageReference) {
           endpoint = "fal-ai/veo3.1/image-to-video";
           payload.image_url = getOptimizedUrl(params.imageReference);
        }

        console.log(`🚀 Veo Request: ${endpoint}`, JSON.stringify(payload, null, 2));

        const url = `https://queue.fal.run/${endpoint}`;
        const submitRes = await axios.post(url, payload, {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
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

        const submitRes = await axios.post(url, payload, {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
            "Content-Type": "application/json",
          },
        });
        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      } else if (isKie) {
        provider = "kie";
        let kieInputUrl = "";
        let isImageToVideo = false;
        if (finalInputImageBuffer) {
          kieInputUrl = await uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_input`,
            params.userId,
            "Kie Input",
            "image",
          );
          isImageToVideo = true;
        }
        const baseModel = isPro ? "sora-2-pro" : "sora-2";
        const mode = isImageToVideo ? "image-to-video" : "text-to-video";
        const kiePayload: any = {
          model: `${baseModel}-${mode}`,
          input: {
            prompt: finalPrompt,
            aspect_ratio:
              targetRatioString === "9:16" ? "portrait" : "landscape",
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
          { headers: { Authorization: `Bearer ${KIE_API_KEY}` } },
        );
        if (kieRes.data.code !== 200) throw new Error("Kie Error");
        externalId = kieRes.data.data.taskId;
      } else if (isOpenAI) {
        provider = "openai";
        const form = new FormData();
        form.append("prompt", finalPrompt);
        form.append("model", params.model || "sora-2-pro");
        form.append(
          "seconds",
          parseInt(params.duration?.toString().replace("s", "") || "4"),
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
          },
        );
        externalId = genResponse.data.id;
      }

      await airtableService.updatePost(postId, {
        generationParams: { ...params, externalId, statusUrl },
        mediaProvider: provider,
        status: "PROCESSING",
      });
    } catch (error: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
      await airtableService.refundUserCredit(params.userId, params.cost || 2);
    }
  },

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
          { headers: { Authorization: `Bearer ${KIE_API_KEY}` } },
        );
        if (checkRes.data.data.state === "success") {
          finalUrl = JSON.parse(checkRes.data.data.resultJson).resultUrls?.[0];
          isComplete = true;
        } else if (checkRes.data.data.state === "fail") {
          isFailed = true;
          errorMessage = checkRes.data.data.failMsg;
        } else progress = Math.min(95, progress + 5);
      } else if (provider.includes("kling")) {
        const checkUrl =
          params.statusUrl || `${FAL_BASE_PATH}/requests/${externalId}/status`;

        try {
          const statusRes = await axios.get(checkUrl, {
            headers: { Authorization: `Key ${FAL_KEY}` },
          });
          const data = statusRes.data;

          if (data.status === "COMPLETED") {
            const resultRes = await axios.get(data.response_url, {
              headers: { Authorization: `Key ${FAL_KEY}` },
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
          console.error("Poll Error:", pollErr.message);
          // If 404, maybe it's gone? But safer to just log for now.
        }
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
        await airtableService.refundUserCredit(userId, params?.cost || 5);
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
          await airtableService.createAsset(
            userId,
            url,
            params.aspectRatio || "16:9",
            "VIDEO",
          );
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
