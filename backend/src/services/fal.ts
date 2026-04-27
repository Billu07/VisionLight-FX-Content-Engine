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
    model?: "nano-banana-2" | "gpt-image-2";
    apiKey?: string; // <--- NEW
  }): Promise<Buffer> {
    this._configureClient(params.apiKey);
    try {
      const GPT_IMAGE_MAX_REFS = 5;
      const selectedModel = params.model || "nano-banana-2";
      const isEdit = params.referenceImages && params.referenceImages.length > 0;
      const endpoint =
        selectedModel === "gpt-image-2"
          ? "openai/gpt-image-2"
          : isEdit
            ? "fal-ai/nano-banana-2/edit"
            : "fal-ai/nano-banana-2";

      console.log(
        `🍌 FAL Engine: ${endpoint} | Model: ${selectedModel} | Ratio: ${
          params.aspectRatio || "auto"
        } | Size: ${params.imageSize || "Default"}`
      );

      const input: any = { prompt: params.prompt };

      if (selectedModel === "gpt-image-2") {
        const ratioToSize = (ratio?: string) => {
          if (ratio === "auto" || ratio === "original") return "auto";
          if (ratio === "1:1" || ratio === "square") return "square_hd";
          if (ratio === "9:16" || ratio === "portrait") return "portrait_16_9";
          return "landscape_16_9";
        };
        input.image_size = ratioToSize(params.aspectRatio);
        input.quality = "high";
        input.num_images = 1;
        input.output_format = "jpeg";
      } else {
        // Disable web search for edits to drastically improve speed, keep true for fresh generations.
        input.enable_web_search = isEdit ? false : true;
        input.safety_tolerance = "6";
        input.output_format = "jpeg";
      }

      if (
        selectedModel !== "gpt-image-2" &&
        params.aspectRatio &&
        params.aspectRatio !== "original"
      ) {
        input.aspect_ratio = params.aspectRatio;
      }

      if (selectedModel !== "gpt-image-2") {
        // Default to 1K resolution for Nano Banana paths for speed.
        input.resolution = params.imageSize || "1K";
      }

      if (isEdit && params.referenceImages) {
        let imageUrls = params.referenceImages.map(
          (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`
        );
        if (selectedModel === "gpt-image-2" && imageUrls.length > GPT_IMAGE_MAX_REFS) {
          // Keep source image as the first anchor and retain the most recent refs.
          imageUrls = [imageUrls[0], ...imageUrls.slice(-(GPT_IMAGE_MAX_REFS - 1))];
        }
        input.image_urls = imageUrls;
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
