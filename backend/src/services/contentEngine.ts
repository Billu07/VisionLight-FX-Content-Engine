import OpenAI from "openai";
import FormData from "form-data";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { airtableService } from "./airtable";
import { ROIService } from "./roi";
import { GEMINI_RESIZE_PROMPT } from "../utils/systemPrompts";

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

// Kie AI Config
const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_API_KEY = process.env.KIE_AI_API_KEY;
const KIE_POLL_INTERVAL = 15000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Fix Image Size/Format for AI APIs
const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

export const contentEngine = {
  // ===========================================================================
  // WORKFLOW: VIDEO GENERATION (Kie Standard vs. OpenAI/Pro Router)
  // ===========================================================================
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎬 Video Gen for ${postId} | Model: ${params.model}`);

    const isStandardKie = params.model === "kie-sora-2";

    try {
      let finalInputImageBuffer: Buffer | undefined;

      // Determine Target Dimensions
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
          targetWidth = isLandscape ? 1920 : 1024;
          targetHeight = isLandscape ? 1024 : 1920;
        } else {
          targetWidth = isLandscape ? 1280 : 720;
          targetHeight = isLandscape ? 720 : 1280;
        }
      }

      // 1. IMAGE PROCESSING
      const rawRefUrl =
        params.imageReferences && params.imageReferences.length > 0
          ? params.imageReferences[0]
          : params.imageReference;

      const refUrl = getOptimizedUrl(rawRefUrl);

      if (refUrl && params.hasReferenceImage) {
        console.log(
          `📐 Processing Ref Image to ${targetWidth}x${targetHeight}...`
        );
        let originalImageBuffer: Buffer | null = null;

        try {
          const imageResponse = await axios.get(refUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
          });
          originalImageBuffer = Buffer.from(imageResponse.data);

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
                        mime_type: "image/jpeg",
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
                  category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                  threshold: "BLOCK_NONE",
                },
                {
                  category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  threshold: "BLOCK_NONE",
                },
                {
                  category: "HARM_CATEGORY_HATE_SPEECH",
                  threshold: "BLOCK_NONE",
                },
              ],
            },
            {
              headers: { "Content-Type": "application/json" },
              timeout: AI_TIMEOUT,
            }
          );

          const imgPart =
            geminiResponse.data?.candidates?.[0]?.content?.parts?.find(
              (p: any) => p.inline_data
            );

          if (imgPart) {
            finalInputImageBuffer = await sharp(
              Buffer.from(imgPart.inline_data.data, "base64")
            )
              .resize(targetWidth, targetHeight, { fit: "fill" })
              .toFormat("jpeg", { quality: 95 })
              .toBuffer();
          } else {
            throw new Error("Gemini returned no image.");
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
      // BRANCH A: KIE AI (Standard)
      // ==========================================================
      if (isStandardKie) {
        console.log("🚀 Starting KIE AI (Standard) Workflow...");

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

        const kieModelId = isImageToVideo
          ? "sora-2-image-to-video"
          : "sora-2-text-to-video";

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

        if (isImageToVideo) kiePayload.input.image_urls = [kieInputUrl];

        const kieRes = await axios.post(
          `${KIE_BASE_URL}/jobs/createTask`,
          kiePayload,
          {
            headers: { Authorization: `Bearer ${KIE_API_KEY}` },
          }
        );

        if (kieRes.data.code !== 200)
          throw new Error(`Kie Error: ${JSON.stringify(kieRes.data)}`);

        const taskId = kieRes.data.data.taskId;
        await airtableService.updatePost(postId, {
          generationParams: { ...params, externalId: taskId },
        });

        // Poll Kie
        let videoUrl = "";
        for (let i = 0; i < 100; i++) {
          await sleep(KIE_POLL_INTERVAL);
          const checkRes = await axios.get(
            `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
            {
              headers: { Authorization: `Bearer ${KIE_API_KEY}` },
            }
          );

          const state = checkRes.data.data.state;
          if (state === "success") {
            const resultObj = JSON.parse(checkRes.data.data.resultJson);
            videoUrl = resultObj.resultUrls?.[0];
            break;
          } else if (state === "fail") {
            throw new Error(`Kie Task Failed: ${checkRes.data.data.failMsg}`);
          }
          await airtableService.updatePost(postId, {
            progress: Math.min(95, 10 + i * 3),
          });
        }

        if (!videoUrl) throw new Error("Kie timed out");

        const finalCloudUrl = await this.uploadToCloudinary(
          videoUrl,
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
      // BRANCH B: OPENAI (Video FX 2 & Pro)
      // ==========================================================
      else {
        console.log("🎥 Routing to OpenAI Video API...");

        let openAISize = params.size;

        if (!openAISize && params.resolution) {
          const isLandscape =
            params.aspectRatio === "landscape" || params.aspectRatio === "16:9";
          if (params.resolution === "1080p") {
            openAISize = isLandscape ? "1920x1024" : "1024x1920";
          } else {
            openAISize = isLandscape ? "1280x720" : "720x1280";
          }
        }
        if (!openAISize) openAISize = "1280x720";

        console.log(`📏 OpenAI Target Size: ${openAISize}`);

        const form = new FormData();
        form.append("prompt", finalPrompt);
        form.append("model", "sora-2.0");
        form.append("seconds", params.duration || 10);
        form.append("size", openAISize);

        if (finalInputImageBuffer) {
          form.append("input_reference", finalInputImageBuffer, {
            filename: "reference.jpg",
            contentType: "image/jpeg",
          });
        }

        const videoApiUrl = "https://api.openai.com/v1/videos";
        const genResponse = await axios.post(videoApiUrl, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          timeout: VIDEO_UPLOAD_TIMEOUT,
        });

        const generationId = genResponse.data.id;
        await airtableService.updatePost(postId, {
          generationParams: { ...params, externalId: generationId },
        });

        // Polling OpenAI
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
            if (status === "completed") {
              if (statusRes.data.content && statusRes.data.content.url) {
                videoData = statusRes.data.content.url;
              } else {
                const contentRes = await axios.get(
                  `${videoApiUrl}/${generationId}/content`,
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    responseType: "arraybuffer",
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
              if (videoData) break;
            } else if (status === "failed") {
              throw new Error(`API Failed: ${statusRes.data.error?.code}`);
            }
            await airtableService.updatePost(postId, {
              progress: Math.min(
                95,
                5 + Math.floor((attempts / MAX_ATTEMPTS) * 90)
              ),
            });
          } catch (e: any) {
            if (e.response?.status === 429) {
              await sleep(60000);
              continue;
            }
            if (e.message.includes("API Failed")) throw e;
          }
          await sleep(POLLING_INTERVAL);
        }

        if (!videoData) throw new Error(`Video generation timed out.`);

        const cloudinaryUrl = await this.uploadToCloudinary(
          videoData,
          postId,
          params.userId,
          params.title || "Video",
          "video"
        );

        await airtableService.updatePost(postId, {
          mediaUrl: cloudinaryUrl,
          status: "READY",
          progress: 100,
          generationStep: "COMPLETED",
        });
        await ROIService.incrementMediaGenerated(params.userId);
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
  // WORKFLOW: IMAGE GENERATION (Gemini)
  // ===========================================================================
  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎨 Image Gen for ${postId}`);
    try {
      const refUrls: string[] =
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
    } catch (error: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // WORKFLOW: CAROUSEL GENERATION (Gemini)
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
      const userRefBuffers = await this.downloadAndOptimizeImages(refUrls);
      const generatedHistory: Buffer[] = [];

      for (let i = 0; i < prompts.length; i++) {
        console.log(`📸 Generating Slide ${i + 1}/3...`);
        const currentContext = [...userRefBuffers, ...generatedHistory];

        // Carousel usually benefits from vertical 9:16
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
    } catch (error: any) {
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
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

  // FIX: Aspect Ratio Prompt Injection (At START of prompt)
  async generateGeminiImage(
    promptText: string,
    refBuffers: Buffer[] = [],
    aspectRatio: string = "1:1"
  ): Promise<Buffer> {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

    // FIX: Moved instruction to the beginning for higher adherence
    let ratioInstruction = "";
    if (aspectRatio === "16:9")
      ratioInstruction = "Wide 16:9 aspect ratio, cinematic landscape shot. ";
    else if (aspectRatio === "9:16")
      ratioInstruction = "Tall 9:16 aspect ratio, vertical portrait shot. ";
    else ratioInstruction = "Square 1:1 aspect ratio. ";

    const finalPrompt = ratioInstruction + promptText;

    const parts: any[] = [{ text: finalPrompt }];

    refBuffers.forEach((buf) => {
      parts.push({
        inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") },
      });
    });

    try {
      const response = await axios.post(
        geminiUrl,
        {
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.9,
            // Note: If the specific Gemini model version supports explicit aspect ratio,
            // it can be added here, but prompt injection is the standard fallback for this endpoint.
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
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
        { headers: { "Content-Type": "application/json" } }
      );

      const candidates = response.data?.candidates;
      const b64 =
        candidates?.[0]?.content?.parts?.find(
          (p: any) => p.inline_data || p.inlineData
        )?.inline_data?.data ||
        candidates?.[0]?.content?.parts?.find(
          (p: any) => p.inline_data || p.inlineData
        )?.inlineData?.data;

      if (b64) return Buffer.from(b64, "base64");
      throw new Error("Gemini structure mismatch (No image)");
    } catch (err: any) {
      if (err.response)
        console.error(
          "Gemini API Error:",
          JSON.stringify(err.response.data, null, 2)
        );
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
