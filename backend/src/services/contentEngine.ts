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

// Initialize Clients
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
  // WORKFLOW 1: PROMPT ENHANCEMENT (Unchanged)
  // ===========================================================================
  async enhanceUserPrompt(
    userPrompt: string,
    mediaType: string,
    duration: number,
    referenceImageBuffer?: Buffer,
    referenceImageMimeType?: string
  ): Promise<string> {
    console.log(`🚀 Starting Prompt Enhancement for [${mediaType}]...`);
    try {
      let imageDescription = "";
      if (referenceImageBuffer && referenceImageMimeType) {
        console.log("📸 Analyzing reference image...");
        const analysisResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image in clear detail. Focus on objects, characters, environment, colors, mood, style, and anything visually distinctive. Keep it concise but descriptive.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${referenceImageMimeType};base64,${referenceImageBuffer.toString(
                      "base64"
                    )}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
        });
        imageDescription = analysisResponse.choices[0].message.content || "";
      }

      let systemPrompt = "";
      let userContext = "";

      if (mediaType === "image" || mediaType === "carousel") {
        systemPrompt = IMAGE_PROMPT_ENHANCER;
        userContext = `User Idea: ${userPrompt}`;
        if (imageDescription) {
          userContext += `\n\nReference Image Style/Content: ${imageDescription}\nInstruction: Merge the user idea with the visual style of the reference image.`;
        }
      } else {
        if (imageDescription) {
          systemPrompt = SORA_MOTION_DIRECTOR;
          userContext = `Idea: ${userPrompt}\nVideo length: ${duration}\nimage description: ${imageDescription}`;
        } else {
          systemPrompt = SORA_CINEMATIC_DIRECTOR;
          userContext = `idea: ${userPrompt}\nvideo length: ${duration} seconds`;
        }
      }

      const completion = await openai.chat.completions.create({
        model: "chatgpt-4o-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContext },
        ],
      });

      return completion.choices[0].message.content || userPrompt;
    } catch (error) {
      console.error("❌ Prompt Enhancement Failed:", error);
      throw error;
    }
  },

  // ===========================================================================
  // WORKFLOW 2a: VIDEO GENERATION (Fixed Binary Handling)
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

      // 2. IMAGE PROCESSING
      if (params.imageReference && params.hasReferenceImage) {
        console.log("📐 Processing reference image...");
        const imageResponse = await axios.get(params.imageReference, {
          responseType: "arraybuffer",
        });
        const originalImageBuffer = Buffer.from(imageResponse.data);

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

        console.log(`🖌️ Sending to Gemini...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

        const geminiPayload = {
          contents: [
            {
              parts: [
                { text: GEMINI_RESIZE_PROMPT },
                {
                  inline_data: {
                    mime_type: "image/png",
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
          });
          const candidates = geminiResponse.data?.candidates;
          if (candidates && candidates[0]?.content?.parts) {
            const imagePart = candidates[0].content.parts.find(
              (p: any) => p.inline_data || p.inlineData
            );
            if (imagePart) {
              const base64Data =
                imagePart.inline_data?.data || imagePart.inlineData?.data;
              if (base64Data)
                bufferToProcess = Buffer.from(base64Data, "base64");
            }
          }
        } catch (e) {
          console.warn("Gemini outpaint failed, using original.");
        }

        console.log(`✂️ Final resize...`);
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
      const POLLING_INTERVAL = 40000; // 40s
      const MAX_ATTEMPTS = 45; // ~30 mins

      let status = "queued";
      let resultData: string | Buffer | null = null;
      let attempts = 0;

      // Initial wait
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
            // Case A: URL is in status response
            if (statusRes.data.content && statusRes.data.content.url) {
              resultData = statusRes.data.content.url;
            }
            // Case B: Need to fetch content manually
            else {
              console.log("📥 Fetching content payload...");
              // CRITICAL: Request arraybuffer to handle Binary Video correctly
              const contentRes = await axios.get(
                `${videoApiUrl}/${generationId}/content`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  },
                  responseType: "arraybuffer",
                }
              );

              // Check if it's JSON (URL) or Binary (File)
              try {
                const textData = Buffer.from(contentRes.data).toString("utf-8");
                const json = JSON.parse(textData);
                if (json.url || json.content?.url) {
                  resultData = json.url || json.content.url; // It was a URL inside JSON
                } else {
                  // JSON but no URL? Fallback to assuming buffer
                  resultData = Buffer.from(contentRes.data);
                }
              } catch (e) {
                // Not JSON -> It is the Raw Video File (Binary)
                console.log("📦 Received raw binary video file.");
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
          console.warn(
            `⚠️ Polling error (Attempt ${attempts}): ${pollError.message}`
          );
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
        throw new Error("Video generation timed out or returned no data.");
      }

      // 5. CLOUDINARY UPLOAD (Handles URL or Buffer)
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
      console.log("✅ Video workflow finished successfully!");
    } catch (error: any) {
      console.error("❌ Video Generation Workflow Failed:", error);
      await airtableService.updatePost(postId, {
        status: "FAILED",
        error:
          error.response?.data?.error?.message ||
          error.message ||
          "Unknown API Error",
        progress: 0,
      });
    }
  },

  // ===========================================================================
  // WORKFLOW 2b: IMAGE GENERATION
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
        parts.push({
          inline_data: { mime_type: "image/png", data: imageBase64 },
        });
      }

      console.log("🖌️ Calling Gemini 2.5 Flash Image...");
      const response = await axios.post(
        geminiImageUrl,
        { contents: [{ parts }] },
        { headers: { "Content-Type": "application/json" } }
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
  // UNIVERSAL UPLOADER (Supports URL & Buffer)
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

      // Case 1: Input is a Buffer (Binary) -> Use Stream
      if (Buffer.isBuffer(file)) {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result!.secure_url);
          }
        );
        stream.end(file);
      }
      // Case 2: Input is a String (URL or Path) -> Use Upload
      else if (typeof file === "string") {
        cloudinary.uploader.upload(file, uploadOptions, (error, result) => {
          if (error) reject(error);
          else resolve(result!.secure_url);
        });
      } else {
        reject(
          new Error(
            "Invalid file format for upload. Expected string or Buffer."
          )
        );
      }
    });
  },
};
