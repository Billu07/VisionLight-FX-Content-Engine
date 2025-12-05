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
  IMAGE_PROMPT_ENHANCER,
} from "../utils/systemPrompts";

// Initialize OpenAI Client (Used for Visual Analysis & Video Gen)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure Cloudinary explicitly
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const contentEngine = {
  // ===========================================================================
  // WORKFLOW 1: PROMPT ENHANCEMENT (Hybrid Pipeline)
  // - Text-Only Image/Carousel: Pass-through (Efficiency)
  // - Image/Carousel + Ref: OpenAI Eyes + Gemini Brain
  // - Video: OpenAI Eyes + Gemini Brain
  // ===========================================================================

  async enhanceUserPrompt(
    userPrompt: string,
    mediaType: string,
    options: { duration?: number; aspectRatio?: string; size?: string },
    referenceImageBuffer?: Buffer,
    referenceImageMimeType?: string
  ): Promise<string> {
    console.log(`🚀 Starting Prompt Enhancement check for [${mediaType}]...`);

    const isImageOrCarousel = mediaType === "image" || mediaType === "carousel";

    // --- BYPASS: If it's Image/Carousel AND NO Reference Image ---
    if (isImageOrCarousel && !referenceImageBuffer) {
      console.log(
        `⚡ Text-only ${mediaType}: Skipping AI enhancement. Using raw user prompt.`
      );
      return userPrompt;
    }

    // Defaults
    const duration = options.duration || 8;
    const ratio = options.aspectRatio || "16:9";
    const resolution = options.size || "1280x720";

    try {
      // 1. VISUAL ANALYSIS (OPENAI GPT-4o-mini)
      // We use OpenAI here because it's currently best-in-class for describing visual details.
      let imageDescription = "";

      if (referenceImageBuffer && referenceImageMimeType) {
        console.log("📸 1. Analyzing reference image (GPT-4o-mini)...");

        // Resize for speed/cost
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
          max_tokens: 400,
        });
        imageDescription = analysisResponse.choices[0].message.content || "";
        console.log("✅ Visual Analysis Complete.");
      }

      // 2. CREATIVE WRITING (GEMINI 2.5 PRO)
      // Gemini creates the structured "Director" prompt based on the analysis.
      console.log("🧠 2. Sending context to Gemini 2.5 Pro for scripting...");

      let systemPersona = "";
      let taskContext = "";

      if (isImageOrCarousel) {
        systemPersona = IMAGE_PROMPT_ENHANCER;
        taskContext = `USER CONCEPT: "${userPrompt}"\nTARGET ASPECT RATIO: ${ratio}`;
        if (imageDescription) {
          taskContext += `\n\nVISUAL REFERENCE CONTEXT: ${imageDescription}\nINSTRUCTION: Merge the user concept with the visual style of the reference image.`;
        }
      } else {
        // Video Logic
        if (imageDescription) {
          systemPersona = SORA_MOTION_DIRECTOR;
          taskContext = `
USER MOTION IDEA: "${userPrompt}"
REFERENCE IMAGE ANALYSIS: "${imageDescription}"

MANDATORY METADATA SETTINGS:
- Duration: ${duration}s
- Aspect Ratio: ${ratio}
- Resolution: ${resolution}
`;
        } else {
          systemPersona = SORA_CINEMATIC_DIRECTOR;
          taskContext = `
USER CONCEPT: "${userPrompt}"

MANDATORY METADATA SETTINGS:
- Duration: ${duration}s
- Aspect Ratio: ${ratio}
- Resolution: ${resolution}
`;
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
        const textResponse = candidates[0].content.parts[0].text;
        if (textResponse) {
          console.log("✅ Gemini generated the final prompt.");
          return textResponse;
        }
      }

      console.warn("⚠️ Gemini returned empty response. Using original prompt.");
      return userPrompt;
    } catch (error: any) {
      console.error(
        "❌ Prompt Enhancement Failed:",
        error.response?.data || error.message
      );
      return userPrompt;
    }
  },

  // ===========================================================================
  // WORKFLOW 2a: VIDEO GENERATION (Gemini Outpaint -> OpenAI Video)
  // ===========================================================================
  async startVideoGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎬 Starting Video Generation for ${postId}`);

    try {
      let finalInputImageBuffer: Buffer | undefined;

      // 1. DYNAMIC FRAME CALCULATION
      const targetSize = params.size || "1280x720";
      const [widthStr, heightStr] = targetSize.split("x");
      const targetWidth = parseInt(widthStr);
      const targetHeight = parseInt(heightStr);

      console.log(`🎯 Target Resolution: ${targetWidth}x${targetHeight}`);

      // 2. IMAGE PROCESSING (Gemini Outpainting)
      if (params.imageReference && params.hasReferenceImage) {
        console.log("📐 Processing reference image...");

        const imageResponse = await axios.get(params.imageReference, {
          responseType: "arraybuffer",
        });
        const originalImageBuffer = Buffer.from(imageResponse.data);
        const originalMimeType =
          imageResponse.headers["content-type"] || "image/jpeg";

        console.log("🖼️ Generating transparent guide frame...");
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

        console.log(
          `🖌️ Sending to Gemini (2.5-flash-image-preview) for outpainting...`
        );
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

        const geminiPayload = {
          contents: [
            {
              parts: [
                { text: GEMINI_RESIZE_PROMPT },
                {
                  inline_data: {
                    mime_type: originalMimeType,
                    data: originalImageBuffer.toString("base64"),
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
        };

        let bufferToProcess = originalImageBuffer;

        try {
          const geminiResponse = await axios.post(geminiUrl, geminiPayload, {
            headers: { "Content-Type": "application/json" },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          });

          const candidates = geminiResponse.data?.candidates;
          if (candidates && candidates[0]?.content?.parts) {
            const imagePart = candidates[0].content.parts.find(
              (p: any) => p.inline_data || p.inlineData
            );

            if (imagePart) {
              const base64Data =
                imagePart.inline_data?.data || imagePart.inlineData?.data;
              if (base64Data) {
                console.log("✅ Gemini successfully returned adapted image.");
                bufferToProcess = Buffer.from(base64Data, "base64");
              }
            }
          }
        } catch (geminiError: any) {
          console.warn(
            "⚠️ Gemini Outpainting failed, falling back to original.",
            geminiError.message
          );
        }

        console.log(`✂️ Final resize to ${targetWidth}x${targetHeight}...`);
        finalInputImageBuffer = await sharp(bufferToProcess)
          .resize(targetWidth, targetHeight, { fit: "fill" })
          .toBuffer();
      }

      // 3. CALL OPENAI VIDEO API
      console.log("🎥 Calling OpenAI Video API...");

      const form = new FormData();
      form.append("prompt", finalPrompt);
      form.append("model", params.model || "sora-2-pro");
      form.append("seconds", params.duration || 8);
      form.append("size", targetSize);

      if (finalInputImageBuffer) {
        console.log("✅ Attaching 'input_reference' image to video request.");
        form.append("input_reference", finalInputImageBuffer, {
          filename: "reference.png",
        });
      }

      const videoApiUrl = "https://api.openai.com/v1/videos";

      const generateResponse = await axios.post(videoApiUrl, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      });

      const generationId = generateResponse.data.id;
      console.log(`⏳ Video queued. ID: ${generationId}`);

      // 4. ROBUST POLLING LOOP
      const POLLING_INTERVAL = 40000;
      const MAX_ATTEMPTS = 60;

      let status = "queued";
      let resultData: string | Buffer | null = null;
      let attempts = 0;

      console.log("⏳ Initial wait for generation...");
      await sleep(30000);

      while (
        status !== "completed" &&
        status !== "failed" &&
        attempts < MAX_ATTEMPTS
      ) {
        attempts++;
        try {
          const statusRes = await axios.get(`${videoApiUrl}/${generationId}`, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          });
          status = statusRes.data.status;
          console.log(`🔄 Check #${attempts}: Status is '${status}'`);

          if (status === "completed") {
            if (statusRes.data.content && statusRes.data.content.url) {
              resultData = statusRes.data.content.url;
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
                const textData = Buffer.from(contentRes.data).toString("utf-8");
                if (textData.trim().startsWith("{")) {
                  const json = JSON.parse(textData);
                  resultData = json.url || json.content?.url;
                } else {
                  resultData = Buffer.from(contentRes.data);
                }
              } catch (e) {
                resultData = Buffer.from(contentRes.data);
              }
            }
          } else if (status === "failed") {
            throw new Error(
              `API reported failure: ${JSON.stringify(
                statusRes.data.error || "Unknown error"
              )}`
            );
          }
        } catch (pollError: any) {
          const errStatus = pollError.response?.status;
          console.warn(`⚠️ Polling: ${pollError.message}`);
          if (errStatus === 401 || errStatus === 403)
            throw new Error("Auth failed.");
          if (errStatus === 429) {
            console.warn("🛑 Rate Limit. Cooling down 60s...");
            await sleep(60000);
          }
        }

        if (status !== "completed" && status !== "failed") {
          const progress = Math.min(
            95,
            10 + Math.floor((attempts / MAX_ATTEMPTS) * 85)
          );
          await airtableService.updatePost(postId, { progress });
          await sleep(POLLING_INTERVAL);
        }
      }

      if (status !== "completed" || !resultData) {
        throw new Error("Video generation timed out.");
      }

      // 5. CLOUDINARY UPLOAD
      console.log("☁️ Uploading result to Cloudinary...");
      const videoTitle = params.title || "Untitled Video";

      const cloudinaryUrl = await this.uploadToCloudinary(
        resultData,
        postId,
        params.userId,
        videoTitle,
        "video"
      );

      // 6. FINALIZE
      await airtableService.updatePost(postId, {
        mediaUrl: cloudinaryUrl,
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });

      await ROIService.incrementMediaGenerated(params.userId);
      console.log(`✅ Video workflow finished! URL: ${cloudinaryUrl}`);
    } catch (error: any) {
      console.error("❌ Video Generation Workflow Failed:", error);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.response?.data?.error?.message || error.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // WORKFLOW 2b: IMAGE GENERATION (Gemini 2.5 Flash Image)
  // ===========================================================================
  async startImageGeneration(postId: string, finalPrompt: string, params: any) {
    console.log(`🎨 Starting Image Generation for ${postId}`);
    try {
      const geminiImageUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;
      const parts: any[] = [{ text: finalPrompt }];

      if (params.imageReference && params.hasReferenceImage) {
        console.log("📸 Fetching reference image...");
        const imageResponse = await axios.get(params.imageReference, {
          responseType: "arraybuffer",
        });
        const imageBase64 = Buffer.from(imageResponse.data).toString("base64");
        const mimeType = imageResponse.headers["content-type"] || "image/png";
        parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
      }

      console.log("🖌️ Calling Gemini 2.5 Flash Image...");
      const response = await axios.post(
        geminiImageUrl,
        { contents: [{ parts }] },
        {
          headers: { "Content-Type": "application/json" },
          maxBodyLength: Infinity,
        }
      );

      let generatedImageBuffer: Buffer | null = null;
      const candidates = response.data?.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const imagePart = candidates[0].content.parts.find(
          (p: any) => p.inline_data || p.inlineData
        );
        if (imagePart) {
          const base64Data =
            imagePart.inline_data?.data || imagePart.inlineData?.data;
          if (base64Data)
            generatedImageBuffer = Buffer.from(base64Data, "base64");
        }
      }

      if (!generatedImageBuffer)
        throw new Error("No image returned from Gemini.");

      console.log("✅ Image generated.");
      const imageTitle = params.title || "Untitled Image";
      const cloudinaryUrl = await this.uploadToCloudinary(
        generatedImageBuffer,
        postId,
        params.userId,
        imageTitle,
        "image"
      );

      await airtableService.updatePost(postId, {
        mediaUrl: cloudinaryUrl,
        mediaProvider: "gemini-image",
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });

      await ROIService.incrementMediaGenerated(params.userId);
      console.log("✅ Image workflow finished!");
    } catch (error: any) {
      console.error("❌ Image Generation Failed:", error);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // WORKFLOW 2c: CAROUSEL GENERATION (3 SEPARATE IMAGES)
  // ===========================================================================
  async startCarouselGeneration(
    postId: string,
    finalPrompt: string,
    params: any
  ) {
    console.log(`🎠 Starting Carousel Generation for ${postId}`);

    try {
      const imageUrls: string[] = [];
      const prompts = [
        `Slide 1/3 (Introduction): ${finalPrompt}. High impact visual, clear subject.`,
        `Slide 2/3 (Details/Action): ${finalPrompt}. Close up detail or action shot.`,
        `Slide 3/3 (Conclusion): ${finalPrompt}. Artistic resolution.`,
      ];

      for (let i = 0; i < prompts.length; i++) {
        console.log(`📸 Generating Slide ${i + 1}/3...`);

        // Use helper to generate Buffer
        const buf = await this.generateGeminiImage(
          prompts[i],
          params.imageReference
        );

        // Resize to standard Portrait (4:5 or 9:16)
        const resized = await sharp(buf)
          .resize(1080, 1350, { fit: "cover" })
          .toBuffer();

        // Upload individual slide
        const slideTitle = `${params.title || "Carousel"} - Slide ${i + 1}`;
        const url = await this.uploadToCloudinary(
          resized,
          `${postId}_slide_${i + 1}`, // Unique ID per slide
          params.userId,
          slideTitle,
          "image"
        );

        imageUrls.push(url);

        // Update progress: 33%, 66%, 90%
        await airtableService.updatePost(postId, {
          progress: Math.round(((i + 1) / 3) * 90),
        });
      }

      // Store Array of URLs as JSON String in Airtable
      // e.g. '["https://res.cloudinary...", "https://..."]'
      await airtableService.updatePost(postId, {
        mediaUrl: JSON.stringify(imageUrls),
        mediaProvider: "gemini-carousel",
        status: "READY",
        progress: 100,
        generationStep: "COMPLETED",
      });

      await ROIService.incrementMediaGenerated(params.userId);
      console.log("✅ Carousel workflow finished!");
    } catch (error: any) {
      console.error("Carousel Failed:", error);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error: error.message,
        progress: 0,
      });
    }
  },

  // HELPER: Call Gemini for Carousel/Slides
  async generateGeminiImage(
    promptText: string,
    refImageUrl?: string
  ): Promise<Buffer> {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;
    const parts: any[] = [{ text: promptText }];

    if (refImageUrl) {
      try {
        const imgRes = await axios.get(refImageUrl, {
          responseType: "arraybuffer",
        });
        const b64 = Buffer.from(imgRes.data).toString("base64");
        const mime = imgRes.headers["content-type"] || "image/png";
        parts.push({ inline_data: { mime_type: mime, data: b64 } });
      } catch (e) {
        console.warn("Ref image load failed, skipping");
      }
    }

    const response = await axios.post(
      geminiUrl,
      { contents: [{ parts }] },
      {
        headers: { "Content-Type": "application/json" },
        maxBodyLength: Infinity,
      }
    );

    const candidates = response.data?.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      const imagePart = candidates[0].content.parts.find(
        (p: any) => p.inline_data || p.inlineData
      );
      if (imagePart) {
        const base64Data =
          imagePart.inline_data?.data || imagePart.inlineData?.data;
        if (base64Data) return Buffer.from(base64Data, "base64");
      }
    }
    throw new Error("Gemini returned no image data");
  },

  // ===========================================================================
  // UNIVERSAL UPLOADER
  // ===========================================================================
  async uploadToCloudinary(
    file: string | Buffer,
    postId: string,
    userId: string,
    title: string,
    resourceType: "video" | "image"
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        resource_type: resourceType,
        folder: `visionlight/user_${userId}/${resourceType}s`,
        public_id: postId,
        overwrite: true,
        context: { caption: title, alt: title },
      };

      if (Buffer.isBuffer(file)) {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result!.secure_url);
          }
        );
        stream.end(file);
      } else if (typeof file === "string") {
        cloudinary.uploader.upload(file, uploadOptions, (error, result) => {
          if (error) reject(error);
          else resolve(result!.secure_url);
        });
      } else {
        reject(new Error("Invalid file format for upload."));
      }
    });
  },
};
