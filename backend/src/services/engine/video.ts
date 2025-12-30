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
  if (h > 10) parts.push("Camera orbits right");
  else if (h < -10) parts.push("Camera orbits left");
  if (v > 10) parts.push("Camera cranes up");
  else if (v < -10) parts.push("Camera cranes down");
  if (z > 5.5) parts.push("Camera zooms in");
  else if (z < 4.5) parts.push("Camera zooms out");
  if (parts.length === 0) return "Static camera, subtle motion";
  return parts.join(", ") + ". Smooth cinematic movement.";
};

export const videoLogic = {
  // === DRIFT VIDEO PATH ===
  async processKlingDrift(
    userId: string,
    assetUrl: string,
    prompt: string,
    horizontal: number,
    vertical: number,
    zoom: number,
    userAspectRatio?: string
  ) {
    try {
      console.log(
        `🎬 Kling Drift Request: H${horizontal} V${vertical} Z${zoom}`
      );

      let targetWidth = 1280;
      let targetHeight = 720;
      let targetRatioString = "16:9";
      if (userAspectRatio === "9:16" || userAspectRatio === "portrait") {
        targetWidth = 720;
        targetHeight = 1280;
        targetRatioString = "9:16";
      } else if (userAspectRatio === "1:1" || userAspectRatio === "square") {
        targetWidth = 1024;
        targetHeight = 1024;
        targetRatioString = "1:1";
      }

      const rawUrl = getOptimizedUrl(assetUrl);
      const imageResponse = await axios.get(rawUrl, {
        responseType: "arraybuffer",
      });
      const originalBuffer = Buffer.from(imageResponse.data);
      const metadata = await sharp(originalBuffer).metadata();

      const sourceAR = (metadata.width || 1) / (metadata.height || 1);
      const targetAR = targetWidth / targetHeight;
      let finalImageUrl = rawUrl;

      if (Math.abs(sourceAR - targetAR) > 0.05) {
        try {
          const outpaintedBuffer = await resizeWithGemini(
            originalBuffer,
            targetWidth,
            targetHeight
          );
          finalImageUrl = await uploadToCloudinary(
            outpaintedBuffer,
            `drift_temp_${userId}_${Date.now()}`,
            userId,
            "Drift Temp Frame",
            "image"
          );
        } catch (e) {
          console.warn("Gemini Outpaint failed, proceeding with original.");
        }
      }

      const cameraMove = getKlingCameraPrompt(horizontal, vertical, zoom);
      const finalPrompt = `Subject: ${
        prompt || "The main subject"
      }. Action: ${cameraMove}. Style: High fidelity, smooth motion, 3D depth.`;

      const payload: any = {
        prompt: finalPrompt,
        image_url: finalImageUrl,
        duration: "5",
        aspect_ratio: targetRatioString,
      };
      const url = `${FAL_BASE_PATH}/pro/image-to-video`;
      const submitRes = await axios.post(url, payload, {
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
      });

      return {
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
      `🎬 Video Gen for ${postId} | Model: ${params.model} | AR: ${params.aspectRatio}`
    );
    const isKie = params.model.includes("kie");
    const isKling = params.model.includes("kling");
    const isOpenAI = !isKie && !isKling;
    const isPro = params.model.includes("pro") || params.model.includes("Pro");

    try {
      const isPortrait =
        params.aspectRatio === "portrait" || params.aspectRatio === "9:16";
      let targetWidth = isPortrait ? 720 : 1280;
      let targetHeight = isPortrait ? 1280 : 720;
      if (params.resolution === "1080p") {
        targetWidth = isPortrait ? 1080 : 1920;
        targetHeight = isPortrait ? 1920 : 1080;
      }

      let finalInputImageBuffer: Buffer | undefined;
      const rawRefUrl = params.imageReferences?.[0] || params.imageReference;

      if (rawRefUrl && params.hasReferenceImage) {
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
                targetHeight
              );
            } catch (e) {
              finalInputImageBuffer = await resizeWithBlurFill(
                originalImageBuffer,
                targetWidth,
                targetHeight
              );
            }
          } else {
            finalInputImageBuffer = await resizeStrict(
              originalImageBuffer,
              targetWidth,
              targetHeight
            );
          }
        } catch (e: any) {
          console.error("❌ Processing Failed:", e.message);
        }
      }

      let externalId = "";
      let statusUrl = "";
      let provider = "";

      if (isKling) {
        provider = "kling";
        let klingInputUrl = "";
        let klingTailUrl = "";
        let isImageToVideo = false;
        if (finalInputImageBuffer) {
          klingInputUrl = await uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_kling_start`,
            params.userId,
            "Kling Start",
            "image"
          );
          isImageToVideo = true;
          // Tail Logic
          if (params.imageReferences && params.imageReferences.length > 1) {
            try {
              const tailRaw = getOptimizedUrl(params.imageReferences[1]);
              const tailResp = await axios.get(tailRaw, {
                responseType: "arraybuffer",
              });
              let processedTail = await resizeStrict(
                Buffer.from(tailResp.data),
                targetWidth,
                targetHeight
              );
              klingTailUrl = await uploadToCloudinary(
                processedTail,
                `${postId}_kling_end`,
                params.userId,
                "Kling End",
                "image"
              );
              await airtableService.updatePost(postId, {
                generatedEndFrame: klingTailUrl,
              });
            } catch (e) {}
          }
        } else if (params.imageReference) {
          klingInputUrl = getOptimizedUrl(params.imageReference);
          isImageToVideo = true;
        }

        const url = `${FAL_BASE_PATH}/pro/${
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
        if (kieRes.data.code !== 200) throw new Error("Kie Error");
        externalId = kieRes.data.data.taskId;
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
          { headers: { Authorization: `Bearer ${KIE_API_KEY}` } }
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

      if (isComplete && finalUrl) {
        try {
          const cloudUrl = await uploadToCloudinary(
            finalUrl,
            post.id,
            userId,
            "Video",
            "video"
          );
          await this.finalizePost(post.id, cloudUrl, provider, userId);
        } catch (e) {
          await this.finalizePost(post.id, finalUrl, provider, userId);
        }
      } else if (isFailed) {
        await airtableService.updatePost(post.id, {
          status: "FAILED",
          error: errorMessage,
          progress: 0,
        });
        await airtableService.refundUserCredit(userId, params?.cost || 5);
      } else if (progress !== post.progress) {
        await airtableService.updatePost(post.id, { progress });
      }
    } catch (error: any) {
      console.error(`Check Status Error (${post.id}):`, error.message);
    }
  },

  async finalizePost(
    postId: string,
    url: string,
    provider: string,
    userId: string
  ) {
    // 1. Update the Post status first
    const post = await airtableService.updatePost(postId, {
      mediaUrl: url,
      mediaProvider: provider,
      status: "READY",
      progress: 100,
      generationStep: "COMPLETED",
    });

    // 2. Check if this was a "Utility Job" (Drift Editor)
    const params = post.generationParams as any;

    if (params?.source === "DRIFT_EDITOR") {
      console.log(
        "💾 Drift Job Complete. Saving to Assets & Cleaning up Timeline..."
      );

      // A. Save to Asset Library (The Permanent Home)
      await airtableService.createAsset(
        userId,
        url,
        params.aspectRatio || "16:9",
        "VIDEO"
      );

      // B. Delete the Temporary Post from Timeline (Keep Timeline Clean)
      // We don't need the "Job Ticket" anymore since we have the Asset.
      await airtableService.deletePost(postId);
      console.log("🧹 Temporary Drift Post deleted.");
    }

    // 3. Track Stats
    await ROIService.incrementMediaGenerated(userId);
  },
};
