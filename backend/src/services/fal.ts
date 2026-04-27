import { fal } from "@fal-ai/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export const FalService = {
  _detectMimeType(buffer: Buffer): string {
    if (buffer.length >= 12) {
      // PNG signature
      if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return "image/png";
      }

      // WEBP signature: RIFF....WEBP
      if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      ) {
        return "image/webp";
      }
    }

    // JPEG SOI
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return "image/jpeg";
    }

    return "image/jpeg";
  },

  _bufferToDataUri(buffer: Buffer): string {
    const mimeType = this._detectMimeType(buffer);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  },

  async _uploadReferenceImage(buffer: Buffer): Promise<string> {
    const mimeType = this._detectMimeType(buffer);
    const blob = new Blob([buffer], { type: mimeType });
    return fal.storage.upload(blob);
  },

  _configureClient(tenantKey?: string) {
    if (!tenantKey) {
      throw new Error(
        "API Key is missing. Please configure your Fal AI key in the Admin Panel.",
      );
    }
    fal.config({ credentials: tenantKey });
  },

  async generateOrEditImage(params: {
    prompt: string;
    aspectRatio?: string;
    referenceImages?: Buffer[];
    modelType?: "speed" | "quality";
    useGrounding?: boolean;
    imageSize?: string;
    model?: "nano-banana-2" | "gpt-image-2";
    apiKey?: string;
  }): Promise<Buffer> {
    this._configureClient(params.apiKey);

    try {
      const GPT_IMAGE_MAX_REFS = 5;
      const selectedModel = params.model || "nano-banana-2";
      const isEdit =
        Array.isArray(params.referenceImages) && params.referenceImages.length > 0;

      const endpoint =
        selectedModel === "gpt-image-2"
          ? "openai/gpt-image-2"
          : isEdit
            ? "fal-ai/nano-banana-2/edit"
            : "fal-ai/nano-banana-2";

      console.log(
        `FAL Engine: ${endpoint} | Model: ${selectedModel} | Ratio: ${
          params.aspectRatio || "auto"
        } | Size: ${params.imageSize || "Default"}`,
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
        // Keep Nano Banana behavior unchanged.
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
        input.resolution = params.imageSize || "1K";
      }

      if (isEdit && params.referenceImages) {
        const limitedRefs =
          selectedModel === "gpt-image-2" &&
          params.referenceImages.length > GPT_IMAGE_MAX_REFS
            ? [
                params.referenceImages[0],
                ...params.referenceImages.slice(-(GPT_IMAGE_MAX_REFS - 1)),
              ]
            : params.referenceImages;

        if (selectedModel === "gpt-image-2") {
          try {
            // Prefer hosted references. This avoids very large base64 payloads and
            // keeps GPT edit requests stable.
            input.image_urls = await Promise.all(
              limitedRefs.map((buffer) => this._uploadReferenceImage(buffer)),
            );
          } catch (uploadError: any) {
            console.warn(
              `FAL reference upload failed, using data URI fallback: ${uploadError?.message || "unknown error"}`,
            );
            input.image_urls = limitedRefs.map((buffer) =>
              this._bufferToDataUri(buffer),
            );
          }
        } else {
          input.image_urls = limitedRefs.map((buffer) =>
            this._bufferToDataUri(buffer),
          );
        }
      }

      if (
        selectedModel === "gpt-image-2" &&
        isEdit &&
        (!Array.isArray(input.image_urls) || input.image_urls.length === 0)
      ) {
        throw new Error(
          "GPT image edit requires reference images, but none were attached.",
        );
      }

      console.log("FAL Request Input (keys omitted):", {
        ...input,
        image_urls: input.image_urls
          ? `[${input.image_urls.length} images]`
          : undefined,
      });
      if (selectedModel === "gpt-image-2" && Array.isArray(input.image_urls)) {
        console.log(`GPT Image 2 references attached: ${input.image_urls.length}`);
      }

      const result: any = await fal.subscribe(endpoint, {
        input,
        logs: true,
      });

      if (result?.data?.images?.length) {
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

  async upscaleImage(params: {
    imageUrl: string;
    apiKey?: string;
  }): Promise<Buffer> {
    this._configureClient(params.apiKey);

    try {
      console.log(`FAL Topaz Upscale: ${params.imageUrl}`);

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

      if (result?.data?.image?.url) {
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
