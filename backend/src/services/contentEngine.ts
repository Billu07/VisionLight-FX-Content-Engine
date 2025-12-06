import OpenAI from "openai";
import FormData from "form-data";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { airtableService } from "./airtable";
import { ROIService } from "./roi";
import {
  SORA_MOTION_DIRECTOR,
  SORA_CINEMATIC_DIRECTOR,
  GEMINI_RESIZE_PROMPT,
} from "../utils/systemPrompts";

// Initialize OpenAI Client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Timeouts
const AI_TIMEOUT = 120000;
const VIDEO_UPLOAD_TIMEOUT = 600000;
const POLLING_REQUEST_TIMEOUT = 60000;
const POLLING_INTERVAL = 40000;

// --- NEW: KIE AI CONFIGURATION ---
const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_API_KEY = process.env.KIE_AI_API_KEY;
const KIE_POLL_INTERVAL = 15000; // Kie is faster than OpenAI

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- NEW HELPER: Fix Image Size for AI (Prevents 400/413 Errors) ---
const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    // Resize to max 1280px width, reduce quality slightly, force JPG
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

export const contentEngine = {
  // ===========================================================================
  // WORKFLOW 1: PROMPT ENHANCEMENT (PRESERVED)
  // ===========================================================================
  async enhanceUserPrompt(
    userPrompt: string,
    mediaType: string,
    options: { duration?: number; aspectRatio?: string; size?: string },
    referenceImageBuffer?: Buffer,
    referenceImageMimeType?: string
  ): Promise<string> {
    console.log(`🚀 Prompt check for [${mediaType}]...`);
    const isImageOrCarousel = mediaType === "image" || mediaType === "carousel";

    // Bypass if Image/Carousel AND NO Reference Image
    if (isImageOrCarousel && !referenceImageBuffer) {
      console.log(`⚡ Text-only ${mediaType}: Skipping enhancement.`);
      return userPrompt;
    }

    const duration = options.duration || 8;
    const ratio = options.aspectRatio || "16:9";
    const resolution = options.size || "1280x720";

    try {
      // 1. Visual Analysis (OpenAI)
      let imageDescription = "";
      if (referenceImageBuffer && referenceImageMimeType) {
        console.log("📸 1. Analyzing reference image (GPT-4o-mini)...");

        const analysisBuffer = await sharp(referenceImageBuffer)
          .resize(1024, 1024, { fit: "inside" })
          .toFormat("jpeg", { quality: 70 })
          .toBuffer();

        const analysisResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this image. Describe the subject, environment, lighting, art style, and mood in high detail.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${analysisBuffer.toString(
                      "base64"
                    )}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 600,
        });
        imageDescription = analysisResponse.choices[0].message.content || "";
      }

      // 2. Creative Writing (Gemini 2.5 Pro)
      console.log("🧠 2. Writing script with Gemini 2.5 Pro...");

      let systemPersona = "";
      let taskContext = "";

      if (isImageOrCarousel) {
        taskContext = `USER CONCEPT: "${userPrompt}"\nTARGET ASPECT RATIO: ${ratio}`;
        if (imageDescription) {
          taskContext += `\n\nVISUAL REFERENCE CONTEXT: ${imageDescription}\nINSTRUCTION: Merge the user concept with the visual style of the reference image.`;
        }
      } else {
        if (imageDescription) {
          systemPersona = SORA_MOTION_DIRECTOR;
          taskContext = `USER MOTION IDEA: "${userPrompt}"\nDURATION: ${duration}s\nREFERENCE IMAGE ANALYSIS: "${imageDescription}"\nASPECT RATIO: ${ratio}\nRESOLUTION: ${resolution}`;
        } else {
          systemPersona = SORA_CINEMATIC_DIRECTOR;
          taskContext = `USER CONCEPT: "${userPrompt}"\nDURATION: ${duration}s\nASPECT RATIO: ${ratio}\nRESOLUTION: ${resolution}`;
        }
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

      const payload = {
        contents: [
          {
            parts: [{ text: systemPersona }, { text: taskContext }],
          },
        ],
        generationConfig: { temperature: 0.7 },
      };

      const response = await axios.post(geminiUrl, payload, {
        headers: { "Content-Type": "application/json" },
      });

      const candidates = response.data?.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        return candidates[0].content.parts[0].text || userPrompt;
      }
      return userPrompt;
    } catch (error: any) {
      console.error(
        "❌ Enhancement Failed:",
        error.response?.data || error.message
      );
      return userPrompt;
    }
  },

  // ===========================================================================
  // WORKFLOW 2a: VIDEO GENERATION (UPDATED: ROUTER FOR KIE + OPENAI)
  // ===========================================================================
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎬 Video Gen for ${postId} | Model: ${params.model}`);

    // --- DETERMINE ENGINE ---
    const isKieModel = params.model && params.model.includes("kie");

    try {
      let finalInputImageBuffer: Buffer | undefined;

      const targetSize = params.size || "1280x720";
      const [widthStr, heightStr] = targetSize.split("x");
      const targetWidth = parseInt(widthStr);
      const targetHeight = parseInt(heightStr);

      // 1. IMAGE PROCESSING (Common Logic)
      const rawRefUrl =
        params.imageReferences && params.imageReferences.length > 0
          ? params.imageReferences[0]
          : params.imageReference;

      // OPTIMIZE URL (Added Fix)
      const refUrl = getOptimizedUrl(rawRefUrl);

      if (refUrl && params.hasReferenceImage) {
        console.log("📐 Processing Ref Image...");

        let originalImageBuffer: Buffer | null = null;
        let originalMimeType = "image/jpeg";

        try {
          // A. Download
          console.log(`⬇️ Downloading from: ${refUrl}`);
          const imageResponse = await axios.get(refUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
          });
          originalImageBuffer = Buffer.from(imageResponse.data);
          originalMimeType =
            imageResponse.headers["content-type"] || "image/jpeg";

          // B. Generate Empty Frame
          const guideFrame = await sharp({
            create: {
              width: targetWidth,
              height: targetHeight,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          })
            .png()
            .toBuffer();

          // C. Call Gemini
          console.log(`🖌️ Sending to Gemini Outpainting...`);
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

          const geminiResponse = await axios.post(
            geminiUrl,
            {
              contents: [
                {
                  parts: [
                    { text: GEMINI_RESIZE_PROMPT },
                    {
                      inline_data: {
                        mime_type: "image/jpeg", // Optimized images are always JPEG
                        data: originalImageBuffer.toString("base64"),
                      },
                    },
                    {
                      inline_data: {
                        mime_type: "image/png",
                        data: guideFrame.toString("base64"),
                      },
                    },
                  ],
                },
              ],
              safetySettings: [
                {
                  category: "HARM_CATEGORY_HARASSMENT",
                  threshold: "BLOCK_NONE",
                },
                {
                  category: "HARM_CATEGORY_HATE_SPEECH",
                  threshold: "BLOCK_NONE",
                },
                {
                  category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  threshold: "BLOCK_NONE",
                },
                {
                  category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                  threshold: "BLOCK_NONE",
                },
              ],
            },
            {
              headers: { "Content-Type": "application/json" },
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              timeout: AI_TIMEOUT,
            }
          );

          // D. Extract Result
          const imgPart =
            geminiResponse.data?.candidates?.[0]?.content?.parts?.find(
              (p: any) => p.inline_data
            );

          if (imgPart) {
            console.log("✅ Gemini Frame Generated Successfully.");
            const bufferToProcess = Buffer.from(
              imgPart.inline_data.data,
              "base64"
            );

            finalInputImageBuffer = await sharp(bufferToProcess)
              .resize(targetWidth, targetHeight, { fit: "fill" })
              .flatten({ background: { r: 0, g: 0, b: 0 } })
              .toFormat("jpeg", { quality: 95 })
              .toBuffer();
          } else {
            console.warn("⚠️ Gemini returned success (200) but NO image data.");
            throw new Error("Gemini returned no image candidates.");
          }
        } catch (e: any) {
          console.error("❌ GEMINI FRAME GEN FAILED (Fallback applied)");
          if (originalImageBuffer) {
            finalInputImageBuffer = await sharp(originalImageBuffer)
              .resize(targetWidth, targetHeight, {
                fit: "contain",
                background: { r: 0, g: 0, b: 0 },
              })
              .flatten({ background: { r: 0, g: 0, b: 0 } })
              .toFormat("jpeg", { quality: 95 })
              .toBuffer();
          }
        }
      }

      // ==========================================================
      // BRANCH A: KIE AI (Video FX)
      // ==========================================================
      if (isKieModel) {
        console.log("🚀 Starting KIE AI Workflow...");

        // 1. Prepare Input Image if needed
        let kieInputUrl = "";
        let isImageToVideo = false;

        if (finalInputImageBuffer) {
          console.log("📤 Uploading Input Frame for Kie...");
          // We upload this specific frame so Kie can access it publicly
          kieInputUrl = await this.uploadToCloudinary(
            finalInputImageBuffer,
            `${postId}_input`,
            params.userId,
            "Kie Input",
            "image"
          );
          isImageToVideo = true;
        }

        // 2. Select Exact Model ID
        // Logic: Frontend sends "kie-sora-2" or "kie-sora-2-pro".
        const isPro = params.model.includes("pro");
        let kieModelId = "";

        if (isImageToVideo) {
          kieModelId = isPro
            ? "sora-2-pro-image-to-video"
            : "sora-2-image-to-video";
        } else {
          kieModelId = isPro
            ? "sora-2-pro-text-to-video"
            : "sora-2-text-to-video";
        }

        console.log(`🤖 Kie Model Selected: ${kieModelId}`);

        // 3. Construct Payload
        const kiePayload: any = {
          model: kieModelId,
          input: {
            prompt: finalPrompt,
            aspect_ratio:
              params.aspectRatio === "9:16" ? "portrait" : "landscape",
            n_frames: params.duration === 15 ? "15" : "10",
            remove_watermark: true,
          },
        };

        // Add Image Params only if ImageToVideo
        if (isImageToVideo) {
          kiePayload.input.image_urls = [kieInputUrl];
        }

        // Add Size Param only if Pro
        if (isPro) {
          // Logic: If user asked for 1080p (high res), send 'high', else 'standard'
          const isHighRes = targetWidth >= 1080 || targetHeight >= 1080;
          kiePayload.input.size = isHighRes ? "high" : "standard";
        }

        // 4. API Call
        const kieRes = await axios.post(
          `${KIE_BASE_URL}/jobs/createTask`,
          kiePayload,
          {
            headers: {
              Authorization: `Bearer ${KIE_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (kieRes.data.code !== 200) {
          throw new Error(`Kie Error: ${JSON.stringify(kieRes.data)}`);
        }

        const taskId = kieRes.data.data.taskId;
        console.log(`⏳ Kie Task ID: ${taskId}`);
        await airtableService.updatePost(postId, {
          generationParams: { ...params, externalId: taskId },
        });

        // 5. Poll Kie
        let videoUrl = "";
        for (let i = 0; i < 100; i++) {
          // Poll for ~15 mins
          await sleep(KIE_POLL_INTERVAL);
          const checkRes = await axios.get(
            `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
            {
              headers: { Authorization: `Bearer ${KIE_API_KEY}` },
            }
          );

          const state = checkRes.data.data.state;
          console.log(`🔄 Kie Poll: ${state}`);

          if (state === "success") {
            const resultObj = JSON.parse(checkRes.data.data.resultJson);
            videoUrl = resultObj.resultUrls?.[0];
            break;
          } else if (state === "fail") {
            const failMsg = checkRes.data.data.failMsg || "Unknown Error";
            throw new Error(`Kie Task Failed: ${failMsg}`);
          }

          // Update progress
          await airtableService.updatePost(postId, {
            progress: Math.min(95, 10 + i * 3),
          });
        }

        if (!videoUrl) throw new Error("Kie timed out or returned no URL");

        // 6. Save Final Video
        console.log("☁️ Saving Final Video...");
        const vidRes = await axios.get(videoUrl, {
          responseType: "arraybuffer",
        });
        const finalCloudUrl = await this.uploadToCloudinary(
          vidRes.data,
          postId,
          params.userId,
          params.title || "Kie Video",
          "video"
        );

        await airtableService.updatePost(postId, {
          mediaUrl: finalCloudUrl,
          mediaProvider: kieModelId,
          status: "READY",
          progress: 100,
          generationStep: "COMPLETED",
        });
        await ROIService.incrementMediaGenerated(params.userId);
      }
      // ==========================================================
      // BRANCH B: OPENAI (Video FX 2) - ORIGINAL LOGIC PRESERVED
      // ==========================================================
      else {
        console.log("🎥 Calling OpenAI Video API...");
        const form = new FormData();
        form.append("prompt", finalPrompt);
        form.append("model", params.model || "sora-2-pro");
        form.append("seconds", params.duration || 8);
        form.append("size", targetSize);
        if (finalInputImageBuffer)
          form.append("input_reference", finalInputImageBuffer, {
            filename: "reference.jpg",
            contentType: "image/jpeg",
          });

        const videoApiUrl = "https://api.openai.com/v1/videos";
        const genResponse = await axios.post(videoApiUrl, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          timeout: VIDEO_UPLOAD_TIMEOUT,
        });

        const generationId = genResponse.data.id;
        console.log(`⏳ Queued: ${generationId}`);

        const updatedParams = { ...params, externalId: generationId };
        await airtableService.updatePost(postId, {
          generationParams: updatedParams,
        });

        // 3. POLLING (Original Logic)
        let videoData: string | Buffer | null = null;
        let attempts = 0;
        const MAX_ATTEMPTS = 90;

        await sleep(45000);

        while (attempts < MAX_ATTEMPTS) {
          attempts++;
          try {
            const statusRes = await axios.get(
              `${videoApiUrl}/${generationId}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                timeout: POLLING_REQUEST_TIMEOUT,
              }
            );

            const status = statusRes.data.status;
            console.log(`🔄 Poll ${attempts}/${MAX_ATTEMPTS}: ${status}`);

            if (status === "completed") {
              if (statusRes.data.content && statusRes.data.content.url) {
                videoData = statusRes.data.content.url; // String URL
              } else {
                // Fetch content
                const contentRes = await axios.get(
                  `${videoApiUrl}/${generationId}/content`,
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    responseType: "arraybuffer", // CRITICAL
                  }
                );

                try {
                  const textData = Buffer.from(contentRes.data).toString(
                    "utf-8"
                  );
                  if (textData.trim().startsWith("{")) {
                    const json = JSON.parse(textData);
                    videoData = json.url || json.content?.url;
                  } else {
                    videoData = Buffer.from(contentRes.data);
                  }
                } catch (e) {
                  videoData = Buffer.from(contentRes.data);
                }
              }

              if (videoData) {
                console.log("✅ Content Retrieved.");
                break;
              }
            } else if (status === "failed") {
              const errCode = statusRes.data.error?.code || "unknown";
              if (errCode === "moderation_blocked")
                throw new Error("⚠️ Blocked by Moderation");
              throw new Error(`API Failed: ${errCode}`);
            }

            const progress = Math.min(
              95,
              5 + Math.floor((attempts / MAX_ATTEMPTS) * 90)
            );
            await airtableService.updatePost(postId, { progress });
          } catch (e: any) {
            if (e.response?.status === 429) {
              console.warn("🛑 Rate Limit. Waiting 60s...");
              await sleep(60000);
              continue;
            }
            if (
              e.message.includes("API Failed") ||
              e.message.includes("Blocked")
            )
              throw e;
            console.warn(`⚠️ Poll Error: ${e.message}`);
          }

          await sleep(POLLING_INTERVAL);
        }

        if (!videoData) throw new Error(`Video generation timed out.`);

        // 4. UPLOAD
        console.log("☁️ Uploading...");
        const videoTitle = params.title || "Untitled Video";

        const cloudinaryUrl = await this.uploadToCloudinary(
          videoData, // Can be String URL or Buffer
          postId,
          params.userId,
          videoTitle,
          "video"
        );

        await airtableService.updatePost(postId, {
          mediaUrl: cloudinaryUrl,
          status: "READY",
          progress: 100,
          generationStep: "COMPLETED",
        });
        await ROIService.incrementMediaGenerated(params.userId);
        console.log(`✅ Video finished!`);
      }
    } catch (error: any) {
      console.error("❌ Video Gen Failed:", error.message);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // WORKFLOW 2b: IMAGE GENERATION (PRESERVED)
  // ===========================================================================
  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎨 Image Gen for ${postId}`);
    try {
      const refUrls: string[] =
        params.imageReferences ||
        (params.imageReference ? [params.imageReference] : []);

      // OPTIMIZATION ADDED (Safe)
      const refBuffers = await this.downloadAndOptimizeImages(refUrls);

      const buf = await this.generateGeminiImage(finalPrompt, refBuffers);

      const cloudUrl = await this.uploadToCloudinary(
        buf,
        postId,
        params.userId,
        params.title || "Image",
        "image"
      );

      await airtableService.updatePost(postId, {
        mediaUrl: cloudUrl,
        mediaProvider: "gemini-image",
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });
      await ROIService.incrementMediaGenerated(params.userId);
      console.log("✅ Image finished!");
    } catch (error: any) {
      console.error("Image Gen Failed:", error);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // WORKFLOW 2c: CAROUSEL GENERATION (PRESERVED)
  // ===========================================================================
  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any
  ) {
    console.log(`🎠 Carousel Gen for ${postId}`);
    try {
      const imageUrls: string[] = [];
      const prompts = [
        `Slide 1/3 (Intro): ${finalPrompt}`,
        `Slide 2/3 (Detail): ${finalPrompt}`,
        `Slide 3/3 (End): ${finalPrompt}`,
      ];

      const refUrls: string[] =
        params.imageReferences ||
        (params.imageReference ? [params.imageReference] : []);

      // OPTIMIZATION ADDED (Safe)
      const userRefBuffers = await this.downloadAndOptimizeImages(refUrls);

      const generatedHistory: Buffer[] = [];

      for (let i = 0; i < prompts.length; i++) {
        console.log(`📸 Generating Slide ${i + 1}/3...`);

        const currentContext = [...userRefBuffers, ...generatedHistory];

        const buf = await this.generateGeminiImage(prompts[i], currentContext);
        const resized = await sharp(buf)
          .resize(1080, 1350, { fit: "cover" })
          .toBuffer();

        const historyThumb = await sharp(resized)
          .resize(512)
          .jpeg({ quality: 60 })
          .toBuffer();
        generatedHistory.push(historyThumb);

        const url = await this.uploadToCloudinary(
          resized,
          `${postId}_slide_${i + 1}`,
          params.userId,
          `Slide ${i + 1}`,
          "image"
        );
        imageUrls.push(url);

        await airtableService.updatePost(postId, { progress: (i + 1) * 30 });
      }

      await airtableService.updatePost(postId, {
        mediaUrl: JSON.stringify(imageUrls),
        mediaProvider: "gemini-carousel",
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });
      await ROIService.incrementMediaGenerated(params.userId);
      console.log("✅ Carousel finished!");
    } catch (error: any) {
      console.error("Carousel Failed:", error);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // HELPERS (PRESERVED)
  // ===========================================================================

  async downloadAndOptimizeImages(urls: string[]): Promise<Buffer[]> {
    if (urls.length === 0) return [];
    console.log(`⬇️ Downloading ${urls.length} reference images...`);
    const promises = urls.map(async (rawUrl) => {
      try {
        const url = getOptimizedUrl(rawUrl); // Optimization Hook
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

  // --- FIXED HELPER: EXTRACTION LOGIC IMPROVED ---
  async generateGeminiImage(
    promptText: string,
    refBuffers: Buffer[] = []
  ): Promise<Buffer> {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;
    const parts: any[] = [{ text: promptText }];

    refBuffers.forEach((buf) => {
      parts.push({
        inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") },
      });
    });

    const payload = {
      contents: [{ parts }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    };

    try {
      const response = await axios.post(geminiUrl, payload, {
        headers: { "Content-Type": "application/json" },
        maxBodyLength: Infinity,
      });

      // DEBUG: Find where the image is hiding
      // console.log("DEBUG RESPONSE:", JSON.stringify(response.data, null, 2));

      const candidates = response.data?.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const imagePart = candidates[0].content.parts.find(
          (p: any) => p.inline_data || p.inlineData
        );
        if (imagePart) {
          // Handle both snake_case and camelCase keys
          const b64 = imagePart.inline_data?.data || imagePart.inlineData?.data;
          if (b64) return Buffer.from(b64, "base64");
        }
      }
      throw new Error("Gemini returned no image data (Structure Mismatch)");
    } catch (err: any) {
      if (err.response) {
        console.error(
          "Gemini API Error:",
          JSON.stringify(err.response.data, null, 2)
        );
      }
      throw err;
    }
  },

  async uploadToCloudinary(
    file: string | Buffer,
    postId: string,
    userId: string,
    title: string,
    resourceType: "video" | "image"
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        resource_type: resourceType,
        folder: `visionlight/user_${userId}/${resourceType}s`,
        public_id: postId,
        overwrite: true,
        context: { caption: title, alt: title },
      };
      if (Buffer.isBuffer(file))
        cloudinary.uploader
          .upload_stream(options, (err, res) =>
            err ? reject(err) : resolve(res!.secure_url)
          )
          .end(file);
      else
        cloudinary.uploader.upload(file as string, options, (err, res) =>
          err ? reject(err) : resolve(res!.secure_url)
        );
    });
  },
};
