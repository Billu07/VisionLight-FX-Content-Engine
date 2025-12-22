import OpenAI from "openai";
import FormData from "form-data";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { airtableService } from "./airtable";
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
const POLLING_REQUEST_TIMEOUT = 60000;
const KIE_POLL_INTERVAL = 15000;

// Kie AI Config
const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

// FAL AI Config (Kling)
const FAL_KEY = process.env.FAL_KEY;
const FAL_BASE_PATH = "https://queue.fal.run/fal-ai/kling-video/v2.5-turbo";

// Prompt for Gemini
const GEMINI_RESIZE_INSTRUCTION = `Take the design, layout, and style of [Image A] exactly as it is, and seamlessly adapt it into the aspect ratio of [Image B]. Maintain all the visual elements, proportions, and composition of [Image A], but expand, crop, or extend the background naturally so that the final image perfectly matches the aspect ratio and dimensions of [Image B]. Do not distort or stretch any elements—use intelligent background extension, framing, or subtle composition adjustments to preserve the original design integrity while filling the new canvas size.`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

// === HELPER 1: BLUR FILL FALLBACK ===
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

    return await sharp(background)
      .composite([{ input: foreground }])
      .toFormat("jpeg", { quality: 95 })
      .toBuffer();
  } catch (e) {
    return await sharp(buffer)
      .resize(width, height, { fit: "cover" })
      .toFormat("jpeg")
      .toBuffer();
  }
};

// === HELPER 2: GEMINI RESIZE (FIXED & ROBUST) ===
const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Gemini Resize: Preparing inputs for ${targetWidth}x${targetHeight}...`
    );

    // 1. Sanitize Input (Force JPEG + Safe Size)
    const sanitizedInputBuffer = await sharp(originalBuffer)
      .resize({ width: 1536, withoutEnlargement: true })
      .toFormat("jpeg", { quality: 90 })
      .toBuffer();

    // 2. Create Guide Frame
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

    // 3. Call Gemini
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

    // 4. Extract Data (CamelCase or SnakeCase)
    const candidate = response.data?.candidates?.[0];
    const part = candidate?.content?.parts?.find(
      (p: any) => p.inline_data || p.inlineData
    );
    const base64Data = part?.inline_data?.data || part?.inlineData?.data;

    if (base64Data) {
      console.log("✅ Gemini Resize Success.");
      return await sharp(Buffer.from(base64Data, "base64"))
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
  // WORKFLOW: VIDEO GENERATION
  // ===========================================================================
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎬 Video Gen for ${postId} | Model Input: ${params.model}`);

    const isKie = params.model.includes("kie");
    const isKling = params.model.includes("kling");
    const isOpenAI = !isKie && !isKling;

    // Is this a "Pro" request? (Used for model selection in OpenAI/Kie)
    const isPro = params.model.includes("pro") || params.model.includes("Pro");

    try {
      let finalInputImageBuffer: Buffer | undefined;

      // 1. DETERMINE TARGET RESOLUTION
      let targetWidth = 1280;
      let targetHeight = 720;

      // Check for explicit "size" from Dashboard first (e.g. "1792x1024")
      if (params.size) {
        const [w, h] = params.size.split("x");
        targetWidth = parseInt(w);
        targetHeight = parseInt(h);
      } else if (params.resolution) {
        const isLandscape =
          params.aspectRatio === "landscape" || params.aspectRatio === "16:9";
        // Pro/HD usually supports 1080p, Standard is safe at 720p/1280p
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

          try {
            console.log("✨ Attempting Gemini AI Outpainting...");
            finalInputImageBuffer = await resizeWithGemini(
              originalImageBuffer,
              targetWidth,
              targetHeight
            );
            console.log("✅ Gemini Frame Success.");
          } catch (geminiError) {
            console.log("⚠️ Gemini failed, falling back to Blur-Fill.");
            finalInputImageBuffer = await resizeWithBlurFill(
              originalImageBuffer,
              targetWidth,
              targetHeight
            );
          }
        } catch (e: any) {
          console.error("❌ Image Processing Failed:", e.message);
        }
      }

      // ==========================================================
      // BRANCH A: KIE AI (Video FX / Video FX Pro)
      // ==========================================================
      if (isKie) {
        console.log(`🚀 Route: Kie AI (${isPro ? "Pro" : "Standard"})`);
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

        // Kie Duration (Video FX): Dashboard sends 5, 10, 15
        // Kie expects string with 's' (e.g., "5s", "10s", "15s")
        let rawDuration = params.duration
          ? params.duration.toString().replace("s", "")
          : "10";

        // If user selected 5, force it to 10
        if (rawDuration === "5") rawDuration = "10";

        const durationStr = `${rawDuration}s`;

        const kiePayload: any = {
          model: kieModelId,
          input: {
            prompt: finalPrompt,
            aspect_ratio:
              params.aspectRatio === "9:16" ? "portrait" : "landscape",
            n_frames: durationStr,
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

        const taskId = kieRes.data.data.taskId;
        await airtableService.updatePost(postId, {
          generationParams: { ...params, externalId: taskId },
        });

        // Polling
        let videoUrl = "";
        for (let i = 0; i < 100; i++) {
          await sleep(KIE_POLL_INTERVAL);
          const checkRes = await axios.get(
            `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
            { headers: { Authorization: `Bearer ${KIE_API_KEY}` } }
          );
          if (checkRes.data.data.state === "success") {
            const resJson = JSON.parse(checkRes.data.data.resultJson);
            videoUrl = resJson.resultUrls?.[0] || resJson.videoUrl;
            break;
          } else if (checkRes.data.data.state === "fail")
            throw new Error(`Kie Task Failed: ${checkRes.data.data.failMsg}`);

          await airtableService.updatePost(postId, {
            progress: Math.min(95, 10 + i * 3),
          });
        }
        const finalCloudUrl = await this.uploadToCloudinary(
          videoUrl,
          postId,
          params.userId,
          "Kie Video",
          "video"
        );
        await this.finalizePost(
          postId,
          finalCloudUrl,
          kieModelId,
          params.userId
        );
      }

      // ==========================================================
      // BRANCH B: FAL AI (Kling)
      // ==========================================================
      else if (isKling) {
        console.log("🚀 Route: Fal.ai (Kling 2.5)");

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
              const tailOriginalBuffer = Buffer.from(tailResp.data);

              let tailBuffer: Buffer;
              try {
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

              klingTailUrl = await this.uploadToCloudinary(
                tailBuffer,
                `${postId}_kling_end`,
                params.userId,
                "Kling End",
                "image"
              );
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

        const makeFalRequest = async (currentTier: string) => {
          const url = `${FAL_BASE_PATH}/${currentTier}/${endpointSuffix}`;
          const payload: any = {
            prompt: finalPrompt,
            duration: params.duration ? params.duration.toString() : "5",
            aspect_ratio: params.aspectRatio === "9:16" ? "9:16" : "16:9",
          };
          if (isImageToVideo) {
            payload.image_url = klingInputUrl;
            if (currentTier === "pro" && klingTailUrl)
              payload.tail_image_url = klingTailUrl;
          }
          return axios.post(url, payload, {
            headers: {
              Authorization: `Key ${FAL_KEY}`,
              "Content-Type": "application/json",
            },
          });
        };

        let submitRes;
        try {
          submitRes = await makeFalRequest(tier);
        } catch (e: any) {
          if (
            tier === "pro" &&
            (e.response?.status === 404 || e.response?.status === 400)
          ) {
            submitRes = await makeFalRequest("standard");
          } else throw e;
        }

        const requestId = submitRes.data.request_id;
        const statusUrl = submitRes.data.status_url;
        const responseUrl = submitRes.data.response_url;

        await airtableService.updatePost(postId, {
          generationParams: { ...params, externalId: requestId },
        });

        let videoUrl = "";
        for (let i = 0; i < 120; i++) {
          await sleep(5000);
          const statusRes = await axios.get(statusUrl, {
            headers: { Authorization: `Key ${FAL_KEY}` },
          });
          if (statusRes.data.status === "COMPLETED") {
            const resultRes = await axios.get(responseUrl, {
              headers: { Authorization: `Key ${FAL_KEY}` },
            });
            videoUrl = resultRes.data.video.url;
            break;
          } else if (statusRes.data.status === "FAILED") {
            throw new Error(`Fal Failed: ${statusRes.data.error}`);
          }
          await airtableService.updatePost(postId, {
            progress: Math.min(90, 5 + i * 2),
          });
        }

        const finalCloudUrl = await this.uploadToCloudinary(
          videoUrl,
          postId,
          params.userId,
          "Kling Video",
          "video"
        );
        await this.finalizePost(
          postId,
          finalCloudUrl,
          `kling-${tier}`,
          params.userId
        );
      }

      // ==========================================================
      // BRANCH C: OPENAI (Video FX 2 / Video FX 2 Pro)
      // ==========================================================
      else if (isOpenAI) {
        // MODEL: Dashboard sends "sora-2" or "sora-2-pro"
        const openAIModel = params.model || "sora-2-pro";
        console.log(`🎥 Route: OpenAI Video API | Model: ${openAIModel}`);

        // DURATION: Strict Integer (4, 8, 12). Default to 4.
        let secondsInt = 4;
        if (params.duration) {
          const s = params.duration.toString().replace("s", "");
          secondsInt = parseInt(s);
          if (isNaN(secondsInt)) secondsInt = 4;
        }

        // SIZE: "WxH" string
        const openAISizeString = `${targetWidth}x${targetHeight}`;

        const form = new FormData();
        form.append("prompt", finalPrompt);
        form.append("model", openAIModel);
        form.append("seconds", secondsInt);
        form.append("size", openAISizeString);

        if (finalInputImageBuffer) {
          console.log("📤 Attaching Input Reference Image...");
          form.append("input_reference", finalInputImageBuffer, {
            filename: "ref.jpg",
            contentType: "image/jpeg",
          });
        }

        console.log(
          `📡 OpenAI Payload: Model=${openAIModel}, Secs=${secondsInt}, Size=${openAISizeString}`
        );

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

        const generationId = genResponse.data.id;
        await airtableService.updatePost(postId, {
          generationParams: { ...params, externalId: generationId },
        });

        // POLLING LOOP (ROBUST RESTORED VERSION)
        let videoData: string | Buffer = "";

        for (let i = 0; i < 60; i++) {
          await sleep(30000); // Poll every 30s
          try {
            const s = await axios.get(
              `https://api.openai.com/v1/videos/${generationId}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
              }
            );

            console.log(`OpenAI Status: ${s.data.status}`);

            if (s.data.status === "completed") {
              // 1. Try to get URL directly from status response
              if (s.data.content && s.data.content.url) {
                videoData = s.data.content.url;
              }
              // 2. Fallback: Fetch content endpoint (Binary or JSON)
              else {
                console.log("📥 Fetching video content blob...");
                const contentRes = await axios.get(
                  `https://api.openai.com/v1/videos/${generationId}/content`,
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    responseType: "arraybuffer", // Critical for binary video files
                  }
                );

                // Check if it returned a JSON string (e.g. {"url": "..."}) or raw bytes
                const textData = Buffer.from(contentRes.data).toString("utf-8");
                if (textData.trim().startsWith("{")) {
                  try {
                    const json = JSON.parse(textData);
                    videoData = json.url || json.content?.url;
                  } catch (e) {
                    // Not JSON, assume binary video
                    videoData = contentRes.data;
                  }
                } else {
                  // Raw binary video data
                  videoData = contentRes.data;
                }
              }
              break; // Exit loop on success
            }

            if (s.data.status === "failed") {
              throw new Error(
                `OpenAI Failed: ${JSON.stringify(
                  s.data.error || "Unknown Error"
                )}`
              );
            }

            await airtableService.updatePost(postId, {
              progress: Math.min(95, 10 + i * 5),
            });
          } catch (pollErr: any) {
            console.warn("Polling warning:", pollErr.message);
            if (pollErr.message.includes("OpenAI Failed")) throw pollErr;
          }
        }

        if (!videoData) throw new Error("OpenAI Video Generation Timed Out");

        const cloudUrl = await this.uploadToCloudinary(
          videoData,
          postId,
          params.userId,
          "Video",
          "video"
        );
        await this.finalizePost(postId, cloudUrl, openAIModel, params.userId);
      }
    } catch (error: any) {
      console.error("❌ Video Gen Failed:", error.message);
      if (error.response?.data) {
        console.error(
          "🔍 Provider Error Details:",
          JSON.stringify(error.response.data, null, 2)
        );
      }
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
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
    console.log(`✅ Generation finished for ${postId}`);
  },

  // ===========================================================================
  // IMAGE & CAROUSEL WORKFLOWS (Preserved)
  // ===========================================================================
  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎨 Image Gen for ${postId}`);
    try {
      const refUrls =
        params.imageReferences ||
        (params.imageReference ? [params.imageReference] : []);
      const refBuffers = await this.downloadAndOptimizeImages(refUrls);
      const buf = await this.generateGeminiImage(
        finalPrompt,
        refBuffers,
        params.aspectRatio
      );
      const cloudUrl = await this.uploadToCloudinary(
        buf,
        postId,
        params.userId,
        "Image",
        "image"
      );
      await this.finalizePost(postId, cloudUrl, "gemini-image", params.userId);
    } catch (e: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: e.message,
        progress: 0,
      });
    }
  },

  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any
  ) {
    console.log(`🎠 Carousel Gen for ${postId}`);
    try {
      const imageUrls: string[] = [];
      const prompts = [
        `Slide 1/3: ${finalPrompt}`,
        `Slide 2/3: ${finalPrompt}`,
        `Slide 3/3: ${finalPrompt}`,
      ];
      const refUrls =
        params.imageReferences ||
        (params.imageReference ? [params.imageReference] : []);
      const userRefBuffers = await this.downloadAndOptimizeImages(refUrls);
      const generatedHistory: Buffer[] = [];

      for (let i = 0; i < prompts.length; i++) {
        const currentContext = [...userRefBuffers, ...generatedHistory];
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
        generationStep: "COMPLETED",
      });
      await ROIService.incrementMediaGenerated(params.userId);
    } catch (e: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: e.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // HELPERS
  // ===========================================================================
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
    let ratioInstruction =
      aspectRatio === "16:9"
        ? "Wide 16:9. "
        : aspectRatio === "9:16"
        ? "Tall 9:16. "
        : "Square 1:1. ";

    const parts: any[] = [{ text: ratioInstruction + promptText }];
    refBuffers.forEach((buf) => {
      parts.push({
        inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") },
      });
    });

    const response = await axios.post(
      geminiUrl,
      {
        contents: [{ parts }],
        generationConfig: { temperature: 0.9 },
      },
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
