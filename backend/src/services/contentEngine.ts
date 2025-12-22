import OpenAI from "openai";
import FormData from "form-data";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { airtableService, Post } from "./airtable";
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
// Note: Polling loops removed. We rely on checkPostStatus called by frontend/cron.

// Kie AI Config
const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

// FAL AI Config (Kling)
// 🔙 v2.5 Turbo (Fast/Silent)
const FAL_KEY = process.env.FAL_KEY;
const FAL_BASE_PATH = "https://queue.fal.run/fal-ai/kling-video/v2.5-turbo";

// Prompt for Gemini
const GEMINI_RESIZE_INSTRUCTION = `Take the design, layout, and style of [Image A] exactly as it is, and seamlessly adapt it into the aspect ratio of [Image B]. Maintain all the visual elements, proportions, and composition of [Image A], but expand, crop, or extend the background naturally so that the final image perfectly matches the aspect ratio and dimensions of [Image B]. Do not distort or stretch any elements—use intelligent background extension, framing, or subtle composition adjustments to preserve the original design integrity while filling the new canvas size.`;

const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

// === HELPER 1: BLUR FILL FALLBACK (Strict Center Gravity) ===
const resizeWithBlurFill = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  try {
    const background = await sharp(buffer)
      .resize(width, height, { fit: "cover" })
      .blur(40)
      .modulate({ brightness: 0.7 })
      .toBuffer();

    const foreground = await sharp(buffer)
      .resize({
        width: width,
        height: height,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    // 🛠️ FIX: Added gravity: "center" to prevent left-shift
    return await sharp(background)
      .composite([{ input: foreground, gravity: "center" }])
      .toFormat("jpeg", { quality: 95 })
      .toBuffer();
  } catch (e) {
    // Fallback: Strict center position
    return await sharp(buffer)
      .resize(width, height, { fit: "cover", position: "center" })
      .toFormat("jpeg")
      .toBuffer();
  }
};

// === HELPER 2: STRICT CROP (Deterministic - New) ===
const resizeStrict = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  console.log("📏 Using Strict Center Crop (No AI) for Consistency");
  return await sharp(buffer)
    .resize(width, height, {
      fit: "cover",
      position: "center", // Forces exact center crop
    })
    .toFormat("jpeg", { quality: 95 })
    .toBuffer();
};

// === HELPER 3: GEMINI RESIZE (Robust) ===
const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Gemini Resize: Preparing inputs for ${targetWidth}x${targetHeight}...`
    );

    const sanitizedInputBuffer = await sharp(originalBuffer)
      .resize({ width: 1536, withoutEnlargement: true })
      .toFormat("jpeg", { quality: 90 })
      .toBuffer();

    const guideFrameBuffer = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

    const response = await axios.post(
      geminiUrl,
      {
        contents: [
          {
            parts: [
              { text: GEMINI_RESIZE_INSTRUCTION },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: sanitizedInputBuffer.toString("base64"),
                },
              },
              {
                inline_data: {
                  mime_type: "image/png",
                  data: guideFrameBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE",
          },
        ],
      },
      { headers: { "Content-Type": "application/json" }, timeout: AI_TIMEOUT }
    );

    const b64 =
      response.data?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inline_data || p.inlineData
      )?.inline_data?.data ||
      response.data?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inline_data || p.inlineData
      )?.inlineData?.data;

    if (b64) {
      console.log("✅ Gemini Resize Success.");
      return await sharp(Buffer.from(b64, "base64"))
        .resize(targetWidth, targetHeight, { fit: "fill" })
        .toFormat("jpeg", { quality: 95 })
        .toBuffer();
    } else {
      throw new Error("Gemini returned no image data.");
    }
  } catch (error: any) {
    console.error(
      "❌ Gemini Resize Error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

export const contentEngine = {
  // ===========================================================================
  // 1. INITIATE VIDEO GENERATION (Stateless Start)
  // ===========================================================================
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎬 Video Gen for ${postId} | Model Input: ${params.model}`);

    const isKie = params.model.includes("kie");
    const isKling = params.model.includes("kling");
    const isOpenAI = !isKie && !isKling;
    const isPro = params.model.includes("pro") || params.model.includes("Pro");

    try {
      let finalInputImageBuffer: Buffer | undefined;

      // 1. DETERMINE TARGET RESOLUTION
      let targetWidth = 1280;
      let targetHeight = 720;

      if (params.size) {
        const [w, h] = params.size.split("x");
        targetWidth = parseInt(w);
        targetHeight = parseInt(h);
      } else if (params.resolution) {
        const isLandscape =
          params.aspectRatio === "landscape" || params.aspectRatio === "16:9";
        if (params.resolution === "1080p") {
          targetWidth = isLandscape ? 1920 : 1080;
          targetHeight = isLandscape ? 1080 : 1920;
        } else {
          targetWidth = isLandscape ? 1280 : 720;
          targetHeight = isLandscape ? 720 : 1280;
        }
      }

      console.log(`📏 Target Resolution: ${targetWidth}x${targetHeight}`);

      // 2. IMAGE PROCESSING (Start Frame)
      const rawRefUrl =
        params.imageReferences && params.imageReferences.length > 0
          ? params.imageReferences[0]
          : params.imageReference;
      const refUrl = getOptimizedUrl(rawRefUrl);

      if (refUrl && params.hasReferenceImage) {
        console.log(`📐 Processing Start Frame...`);
        try {
          const imageResponse = await axios.get(refUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
          });
          const originalImageBuffer = Buffer.from(imageResponse.data);

          // 🛠️ FIX: Aspect Ratio Check
          const metadata = await sharp(originalImageBuffer).metadata();
          const sourceAR = (metadata.width || 1) / (metadata.height || 1);
          const targetAR = targetWidth / targetHeight;
          const isARMatch = Math.abs(sourceAR - targetAR) < 0.05; // 5% tolerance

          if (isARMatch) {
            finalInputImageBuffer = await resizeStrict(
              originalImageBuffer,
              targetWidth,
              targetHeight
            );
          } else {
            try {
              console.log(
                "✨ AR Mismatch: Attempting Gemini AI Outpainting..."
              );
              finalInputImageBuffer = await resizeWithGemini(
                originalImageBuffer,
                targetWidth,
                targetHeight
              );
            } catch (geminiError) {
              console.log("⚠️ Gemini failed, falling back to Blur-Fill.");
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

      // ==========================================================
      // BRANCH A: KIE AI
      // ==========================================================
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
        const kieModelId = `${baseModel}-${mode}`;

        let rawDuration = params.duration
          ? params.duration.toString().replace("s", "")
          : "10";
        if (rawDuration === "5") rawDuration = "10";

        const kiePayload: any = {
          model: kieModelId,
          input: {
            prompt: finalPrompt,
            aspect_ratio:
              params.aspectRatio === "9:16" ? "portrait" : "landscape",
            n_frames: `${rawDuration}s`,
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
      }

      // ==========================================================
      // BRANCH B: FAL AI (Kling 2.5 Turbo - FIXED)
      // ==========================================================
      else if (isKling) {
        provider = "kling";
        console.log("🚀 Route: Fal.ai (Kling 2.5 Turbo)");

        let klingInputUrl = "";
        let klingTailUrl = "";
        let isImageToVideo = false;

        if (finalInputImageBuffer) {
          // 1. Upload Processed Start Frame
          klingInputUrl = await this.uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_kling_start`,
            params.userId,
            "Kling Start",
            "image"
          );
          isImageToVideo = true;

          // 2. Process End Frame (Tail)
          if (params.imageReferences && params.imageReferences.length > 1) {
            try {
              const tailRaw = getOptimizedUrl(params.imageReferences[1]);
              const tailResp = await axios.get(tailRaw, {
                responseType: "arraybuffer",
              });
              const tailOriginalBuffer = Buffer.from(tailResp.data);

              // AR Check for Tail Frame
              const meta = await sharp(tailOriginalBuffer).metadata();
              const tailAR = (meta.width || 1) / (meta.height || 1);
              const targetAR = targetWidth / targetHeight;
              const isTailARMatch = Math.abs(tailAR - targetAR) < 0.05;

              let tailBuffer: Buffer;

              if (isTailARMatch) {
                console.log("📏 End Frame AR Match: Using Strict Crop");
                tailBuffer = await resizeStrict(
                  tailOriginalBuffer,
                  targetWidth,
                  targetHeight
                );
              } else {
                try {
                  console.log("✨ End Frame AR Mismatch: Gemini Resize...");
                  tailBuffer = await resizeWithGemini(
                    tailOriginalBuffer,
                    targetWidth,
                    targetHeight
                  );
                } catch (gemErr) {
                  tailBuffer = await resizeWithBlurFill(
                    tailOriginalBuffer,
                    targetWidth,
                    targetHeight
                  );
                }
              }

              // 3. Upload Processed End Frame
              klingTailUrl = await this.uploadToCloudinary(
                tailBuffer,
                `${postId}_kling_end`,
                params.userId,
                "Kling End",
                "image"
              );

              // 👇👇👇 SAVING THE PROCESSED FRAME TO DATABASE 👇👇👇
              // This is critical for the "Use as Start Frame" feature
              await airtableService.updatePost(postId, {
                generatedEndFrame: klingTailUrl,
              });
              console.log("💾 Saved Processed End Frame");
            } catch (e) {
              console.warn("Kling end frame processing failed, using raw.");
              klingTailUrl = getOptimizedUrl(params.imageReferences[1]);
            }
          }
        } else if (params.imageReference) {
          klingInputUrl = getOptimizedUrl(params.imageReference);
          isImageToVideo = true;
        }

        const endpointSuffix = isImageToVideo
          ? "image-to-video"
          : "text-to-video";
        let tier = "standard";
        if (klingTailUrl) tier = "pro";

        const url = `${FAL_BASE_PATH}/${tier}/${endpointSuffix}`;
        const payload: any = {
          prompt: finalPrompt,
          duration: params.duration ? params.duration.toString() : "5",
          aspect_ratio: params.aspectRatio === "9:16" ? "9:16" : "16:9",
        };

        if (isImageToVideo) {
          payload.image_url = klingInputUrl;
          if (tier === "pro" && klingTailUrl)
            payload.tail_image_url = klingTailUrl;
        }

        const submitRes = await axios.post(url, payload, {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
            "Content-Type": "application/json",
          },
        });

        externalId = submitRes.data.request_id;
        statusUrl = submitRes.data.status_url;
      }

      // ==========================================================
      // BRANCH C: OPENAI
      // ==========================================================
      else if (isOpenAI) {
        provider = "openai";
        const openAIModel = params.model || "sora-2-pro";
        let secondsInt = 4;
        if (params.duration) {
          const s = params.duration.toString().replace("s", "");
          secondsInt = parseInt(s) || 4;
        }
        const form = new FormData();
        form.append("prompt", finalPrompt);
        form.append("model", openAIModel);
        form.append("seconds", secondsInt);
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

      // === SAVE STATE ===
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
      // 🛠️ FIX: Refund exact cost if available, else default to safe amount
      const refundAmount = params.cost || 2;
      await airtableService.refundUserCredit(params.userId, refundAmount);
    }
  },

  // ===========================================================================
  // 2. CHECK STATUS (Stateless)
  // ===========================================================================
  async checkPostStatus(post: Post) {
    if (post.status !== "PROCESSING" || !post.generationParams?.externalId)
      return;

    const externalId = post.generationParams.externalId;
    const provider = post.mediaProvider || "openai";
    const userId = post.userId;

    try {
      let isComplete = false;
      let isFailed = false;
      let finalUrl = "";
      let progress = post.progress || 0;
      let errorMessage = "";

      // --- KIE ---
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
      }

      // --- FAL/KLING ---
      else if (provider.includes("kling")) {
        const checkUrl =
          post.generationParams.statusUrl ||
          `${FAL_BASE_PATH}/requests/${externalId}/status`;
        const statusRes = await axios.get(checkUrl, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        });

        if (statusRes.data.status === "COMPLETED") {
          const responseUrl = statusRes.data.response_url;
          const resultRes = await axios.get(responseUrl, {
            headers: { Authorization: `Key ${FAL_KEY}` },
          });
          finalUrl = resultRes.data.video.url;
          isComplete = true;
        } else if (statusRes.data.status === "FAILED") {
          isFailed = true;
          errorMessage = statusRes.data.error;
        } else progress = Math.min(90, progress + 5);
      }

      // --- OPENAI ---
      else if (provider.includes("openai")) {
        try {
          const s = await axios.get(
            `https://api.openai.com/v1/videos/${externalId}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
            }
          );
          if (s.data.status === "completed") {
            finalUrl =
              s.data.content?.url ||
              (
                await axios.get(
                  `https://api.openai.com/v1/videos/${externalId}/content`,
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    responseType: "arraybuffer",
                  }
                )
              ).data;
            isComplete = true;
          } else if (s.data.status === "failed") {
            isFailed = true;
            errorMessage = JSON.stringify(s.data.error);
          } else progress = Math.min(95, progress + 5);
        } catch (e) {}
      }

      if (isComplete && finalUrl) {
        const cloudUrl = await this.uploadToCloudinary(
          finalUrl,
          post.id,
          userId,
          "Video",
          "video"
        );
        await this.finalizePost(post.id, cloudUrl, provider, userId);
      } else if (isFailed) {
        await airtableService.updatePost(post.id, {
          status: "FAILED",
          error: errorMessage,
          progress: 0,
        });

        // 🛠️ FIX: Refund using numeric cost
        const costToRefund = post.generationParams?.cost || 5;
        await airtableService.refundUserCredit(userId, costToRefund);
      } else {
        if (progress !== post.progress)
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
    await airtableService.updatePost(postId, {
      mediaUrl: url,
      mediaProvider: provider,
      status: "READY",
      progress: 100,
      generationStep: "COMPLETED",
    });
    await ROIService.incrementMediaGenerated(userId);
  },

  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    try {
      const refBuffers = await this.downloadAndOptimizeImages(
        params.imageReferences || []
      );
      const buf = await this.generateGeminiImage(
        finalPrompt,
        refBuffers,
        params.aspectRatio
      );
      const url = await this.uploadToCloudinary(
        buf,
        postId,
        params.userId,
        "Image",
        "image"
      );
      await this.finalizePost(postId, url, "gemini-image", params.userId);
    } catch (e: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: e.message,
      });
      // 🛠️ FIX: Refund fixed cost 1
      await airtableService.refundUserCredit(params.userId, 1);
    }
  },

  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any
  ) {
    try {
      const imageUrls: string[] = [];
      const prompts = [
        `Slide 1/3: ${finalPrompt}`,
        `Slide 2/3: ${finalPrompt}`,
        `Slide 3/3: ${finalPrompt}`,
      ];
      const refBuffers = await this.downloadAndOptimizeImages(
        params.imageReferences || []
      );
      const generatedHistory: Buffer[] = [];

      for (let i = 0; i < prompts.length; i++) {
        const currentContext = [...refBuffers, ...generatedHistory];
        const buf = await this.generateGeminiImage(
          prompts[i],
          currentContext,
          "9:16"
        );
        const resized = await sharp(buf)
          .resize(1080, 1350, { fit: "cover" })
          .toBuffer();
        generatedHistory.push(
          await sharp(resized).resize(512).jpeg({ quality: 60 }).toBuffer()
        );
        const url = await this.uploadToCloudinary(
          resized,
          `${postId}_slide_${i + 1}`,
          params.userId,
          `Slide ${i + 1}`,
          "image"
        );
        imageUrls.push(url);
      }
      await airtableService.updatePost(postId, {
        mediaUrl: JSON.stringify(imageUrls),
        mediaProvider: "gemini-carousel",
        status: "READY",
        progress: 100,
      });
      await ROIService.incrementMediaGenerated(params.userId);
    } catch (e: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: e.message,
      });
      // 🛠️ FIX: Refund fixed cost 3
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

  async generateGeminiImage(
    promptText: string,
    refBuffers: Buffer[],
    aspectRatio: string
  ): Promise<Buffer> {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;
    const parts: any[] = [
      {
        text:
          (aspectRatio === "16:9"
            ? "Wide 16:9. "
            : aspectRatio === "9:16"
            ? "Tall 9:16. "
            : "Square 1:1. ") + promptText,
      },
    ];
    refBuffers.forEach((buf) =>
      parts.push({
        inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") },
      })
    );

    const response = await axios.post(
      geminiUrl,
      { contents: [{ parts }], generationConfig: { temperature: 0.9 } },
      { headers: { "Content-Type": "application/json" } }
    );
    const b64 =
      response.data?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inline_data || p.inlineData
      )?.inline_data?.data ||
      response.data?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inline_data || p.inlineData
      )?.inlineData?.data;
    if (b64) return Buffer.from(b64, "base64");
    throw new Error("Gemini No Image");
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
        cloudinary.uploader.upload(f, options, (err, res) =>
          err ? reject(err) : resolve(res!.secure_url)
        );
    });
  },
};
