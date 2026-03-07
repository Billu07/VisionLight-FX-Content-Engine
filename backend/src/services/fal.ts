import { fal } from "@fal-ai/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export const FalService = {
  /**
   * Helper to configure FAL with a tenant's custom key.
   */
  _configureClient(tenantKey?: string) {
    if (!tenantKey) throw new Error("API Key is missing. Please configure your Fal AI key in the Admin Panel.");

    fal.config({ credentials: tenantKey });
  },
  /**
   * CORE GENERATION & EDITING
   * Uses fal-ai/nano-banana-2 or fal-ai/nano-banana-2/edit based on reference images.
   */
  async generateOrEditImage(params: {
    prompt: string;
    aspectRatio?: string;
    referenceImages?: Buffer[];
    modelType?: "speed" | "quality";
    useGrounding?: boolean;
    imageSize?: string;
    apiKey?: string; // <--- NEW
  }): Promise<Buffer> {
    this._configureClient(params.apiKey);
    try {
      const isEdit = params.referenceImages && params.referenceImages.length > 0;
      const endpoint = isEdit ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2";

      console.log(
        `🍌 FAL Engine: ${endpoint} | Ratio: ${params.aspectRatio || "auto"} | Size: ${
          params.imageSize || "Default"
        }`
      );

      const input: any = {
        prompt: params.prompt,
        // Disable web search for edits to drastically improve speed, keep true for fresh 4K generations
        enable_web_search: isEdit ? false : true,
        safety_tolerance: "6", // Maximum creativity (least strict)
        output_format: "jpeg", // Force JPEG to compress 4K under Cloudinary's 10MB limit
      };

      if (params.aspectRatio && params.aspectRatio !== "original") {
        input.aspect_ratio = params.aspectRatio;
      }

      // Default to 1K resolution for both PicFX (generation) and Editor for maximum speed
      input.resolution = params.imageSize || "1K";

      if (isEdit && params.referenceImages) {
        input.image_urls = params.referenceImages.map(
          (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`
        );
      }

      console.log("📤 FAL Request Input (Keys Omitted):", { ...input, image_urls: input.image_urls ? `[${input.image_urls.length} images]` : undefined });

      const result: any = await fal.subscribe(endpoint, {
        input,
        logs: true,
      });

      if (result.data && result.data.images && result.data.images.length > 0) {
        const imageUrl = result.data.images[0].url;
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
        });
        return Buffer.from(response.data);
      }

      throw new Error("No image data returned from FAL.");
    } catch (error: any) {
      console.error("FAL Service Error:", error.message);
      throw error;
    }
  },

  /**
   */
  async upscaleImage(params: { imageUrl: string, apiKey?: string }): Promise<Buffer> {
    this._configureClient(params.apiKey);
    try {
      console.log(`✨ FAL Topaz Upscale: ${params.imageUrl}`);

      const result: any = await fal.subscribe("fal-ai/topaz/upscale/image", {
        input: {
          image_url: params.imageUrl,
          model: "Standard V2",
          upscale_factor: 2,
          output_format: "png",
          face_enhancement: true,
          face_enhancement_strength: 0.8,
        },
        logs: true,
      });

      if (result.data && result.data.image && result.data.image.url) {
        const response = await axios.get(result.data.image.url, {
          responseType: "arraybuffer",
        });
        return Buffer.from(response.data);
      }

      throw new Error("No image returned from FAL Topaz");
    } catch (error: any) {
      console.error("FAL Upscale Error:", error.message);
      throw error;
    }
  },
};
