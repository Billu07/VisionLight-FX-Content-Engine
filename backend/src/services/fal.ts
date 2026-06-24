import { fal } from "@fal-ai/client";
import axios from "axios";
import sharp from "sharp";
import dotenv from "dotenv";
import { Blob as NodeBlob } from "buffer";

dotenv.config();

export const FalService = {
  _extractErrorStatus(error: any): number | undefined {
    const raw =
      error?.status ??
      error?.response?.status ??
      error?.cause?.status ??
      error?.cause?.response?.status;
    const status = Number(raw);
    if (!Number.isFinite(status) || status < 100 || status > 599) {
      return undefined;
    }
    return status;
  },

  _extractErrorDetails(error: any): string {
    const data =
      error?.response?.data ??
      error?.data ??
      error?.body ??
      error?.cause?.response?.data ??
      error?.cause?.data;

    if (typeof data === "string" && data.trim().length > 0) {
      return data.trim();
    }
    if (data && typeof data === "object") {
      try {
        return JSON.stringify(data);
      } catch {
        // fall through
      }
    }

    if (typeof error?.message === "string" && error.message.trim().length > 0) {
      return error.message.trim();
    }
    return "Unknown upstream error";
  },

  async _resolveGptImageSize(
    aspectRatio?: string,
    referenceImages?: Buffer[],
  ): Promise<string | { width: number; height: number }> {
    // High-resolution output for GPT Image 2. The old code used fal's ~1MP
    // presets (square_hd / landscape_16_9 ≈ 1024px edge), which is why renders
    // and edits looked low quality once downloaded. We instead request explicit
    // dimensions with a ~2.5K long edge (agreed quality/cost target), preserving
    // the exact aspect ratio. The output stays lossless PNG, so there is no
    // quality compromise — only the pixel dimensions are bounded here.
    // API limits (still respected): multiples of 16, max edge 3840px, aspect
    // ratio <= 3:1, total pixels <= 8,294,400.
    const MAX_EDGE = 2560; // ~2.5K long edge
    const TARGET_MAX_PIXELS = 8_000_000; // safety cap, below the 8,294,400 hard limit

    const dimsForRatio = (
      ratioWidthOverHeight: number,
    ): { width: number; height: number } => {
      let r = ratioWidthOverHeight;
      if (!Number.isFinite(r) || r <= 0) r = 4 / 3;
      // Clamp to the model's max aspect ratio (3:1 in either orientation).
      r = Math.min(3, Math.max(1 / 3, r));

      let w: number;
      let h: number;
      if (r >= 1) {
        w = MAX_EDGE;
        h = MAX_EDGE / r;
      } else {
        h = MAX_EDGE;
        w = MAX_EDGE * r;
      }
      if (w * h > TARGET_MAX_PIXELS) {
        const scale = Math.sqrt(TARGET_MAX_PIXELS / (w * h));
        w *= scale;
        h *= scale;
      }
      const round16 = (n: number) => Math.max(512, Math.floor(n / 16) * 16);
      return { width: round16(w), height: round16(h) };
    };

    const ar = (aspectRatio || "").toLowerCase();
    if (ar === "1:1" || ar === "square") return dimsForRatio(1);
    if (ar === "9:16" || ar === "portrait") return dimsForRatio(9 / 16);
    if (ar === "16:9" || ar === "landscape") return dimsForRatio(16 / 9);
    if (ar === "4:3") return dimsForRatio(4 / 3);
    if (ar === "3:4") return dimsForRatio(3 / 4);
    if (ar === "21:9") return dimsForRatio(21 / 9);

    // "original" / "auto" / unknown: keep the input image's native aspect ratio.
    const primaryRef = Array.isArray(referenceImages)
      ? referenceImages[0]
      : undefined;
    if (!primaryRef) return dimsForRatio(4 / 3);
    try {
      const meta = await sharp(primaryRef).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      if (!width || !height) return dimsForRatio(4 / 3);
      return dimsForRatio(width / height);
    } catch {
      return dimsForRatio(4 / 3);
    }
  },

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

  async _normalizeReferenceBuffer(buffer: Buffer): Promise<Buffer> {
    try {
      // Normalize EXIF orientation and output a stable JPEG payload for edit refs.
      return await sharp(buffer).rotate().jpeg({ quality: 95 }).toBuffer();
    } catch {
      return buffer;
    }
  },

  async _uploadReferenceImage(buffer: Buffer): Promise<string> {
    const mimeType = this._detectMimeType(buffer);
    const blob = new NodeBlob([buffer], { type: mimeType });
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
    referenceImageUrls?: string[];
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
      const hasReferenceBuffers =
        Array.isArray(params.referenceImages) && params.referenceImages.length > 0;
      const hasReferenceUrls =
        Array.isArray(params.referenceImageUrls) &&
        params.referenceImageUrls.some(
          (url) => typeof url === "string" && url.trim().length > 0,
        );
      const isEdit = hasReferenceBuffers || hasReferenceUrls;

      const endpoint =
        selectedModel === "gpt-image-2"
          ? isEdit
            ? "openai/gpt-image-2/edit"
            : "openai/gpt-image-2"
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
        input.image_size = await this._resolveGptImageSize(
          params.aspectRatio,
          params.referenceImages,
        );
        input.quality = "high";
        input.num_images = 1;
        // Lossless PNG: GPT Image 2's native/default format. Requesting JPEG here
        // re-compressed every render (and every edit) into a lossy file even
        // though the user is charged for a full "high" quality result. PNG keeps
        // the model output pixel-faithful for both download and re-editing.
        input.output_format = "png";
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

      let fallbackDataUriRefs: string[] | null = null;
      if (isEdit) {
        const rawBufferRefs = hasReferenceBuffers ? params.referenceImages! : [];
        const rawUrlRefs = hasReferenceUrls
          ? Array.from(
              new Set(
                (params.referenceImageUrls || [])
                  .map((url) =>
                    typeof url === "string" ? url.trim() : "",
                  )
                  .filter(
                    (url) =>
                      url.length > 0 &&
                      (/^https?:\/\//i.test(url) || url.startsWith("data:")),
                  ),
              ),
            )
          : [];

        const limitedBufferRefs =
          selectedModel === "gpt-image-2" &&
          rawBufferRefs.length > GPT_IMAGE_MAX_REFS
            ? [rawBufferRefs[0], ...rawBufferRefs.slice(-(GPT_IMAGE_MAX_REFS - 1))]
            : rawBufferRefs;

        const limitedUrlRefs =
          selectedModel === "gpt-image-2" &&
          rawUrlRefs.length > GPT_IMAGE_MAX_REFS
            ? [rawUrlRefs[0], ...rawUrlRefs.slice(-(GPT_IMAGE_MAX_REFS - 1))]
            : rawUrlRefs;

        if (selectedModel === "gpt-image-2") {
          let normalizedRefs: Buffer[] = [];
          if (limitedBufferRefs.length > 0) {
            normalizedRefs = await Promise.all(
              limitedBufferRefs.map((buffer) => this._normalizeReferenceBuffer(buffer)),
            );
            fallbackDataUriRefs = normalizedRefs.map((buffer) =>
              this._bufferToDataUri(buffer),
            );
          }

          if (limitedUrlRefs.length > 0) {
            // Prefer direct hosted URLs from the asset library to avoid
            // re-upload failures or payload bloat from data URIs.
            input.image_urls = limitedUrlRefs;
          } else if (normalizedRefs.length > 0) {
            try {
              // Hosted refs are typically more stable for GPT edit requests on Fal.
              input.image_urls = await Promise.all(
                normalizedRefs.map((buffer) => this._uploadReferenceImage(buffer)),
              );
            } catch (uploadError: any) {
              console.warn(
                `FAL reference upload failed, using data URI fallback: ${uploadError?.message || "unknown error"}`,
              );
              input.image_urls = fallbackDataUriRefs;
            }
          }
        } else if (limitedBufferRefs.length > 0) {
          input.image_urls = limitedBufferRefs.map((buffer) =>
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

      let result: any;
      try {
        result = await fal.subscribe(endpoint, {
          input,
          logs: true,
        });
      } catch (firstError: any) {
        const status = this._extractErrorStatus(firstError);
        const usesHostedRefs =
          selectedModel === "gpt-image-2" &&
          Array.isArray(input.image_urls) &&
          input.image_urls.length > 0 &&
          typeof input.image_urls[0] === "string" &&
          !input.image_urls[0].startsWith("data:");
        const usesDataUriRefs =
          selectedModel === "gpt-image-2" &&
          Array.isArray(input.image_urls) &&
          input.image_urls.length > 0 &&
          typeof input.image_urls[0] === "string" &&
          input.image_urls[0].startsWith("data:");

        if (
          status === 422 &&
          usesHostedRefs &&
          isEdit &&
          Array.isArray(fallbackDataUriRefs) &&
          fallbackDataUriRefs.length > 0
        ) {
          console.warn(
            "GPT Image 2 returned 422 with hosted references. Retrying with data URI references.",
          );
          const retryInput = {
            ...input,
            image_urls: fallbackDataUriRefs,
          };
          result = await fal.subscribe(endpoint, {
            input: retryInput,
            logs: true,
          });
        } else if (
          (status === 413 || status === 422) &&
          usesDataUriRefs &&
          isEdit &&
          Array.isArray(params.referenceImages) &&
          params.referenceImages.length > 0
        ) {
          // Fallback for payload-size/validation issues: upload refs and retry.
          console.warn(
            "GPT Image 2 rejected data URI references. Retrying with hosted references.",
          );
          const normalizedRefs = await Promise.all(
            params.referenceImages
              .slice(0, GPT_IMAGE_MAX_REFS)
              .map((buffer) => this._normalizeReferenceBuffer(buffer)),
          );
          const hostedRefs = await Promise.all(
            normalizedRefs.map((buffer) => this._uploadReferenceImage(buffer)),
          );
          const retryInput = {
            ...input,
            image_urls: hostedRefs,
          };
          result = await fal.subscribe(endpoint, {
            input: retryInput,
            logs: true,
          });
        } else {
          throw firstError;
        }
      }

      if (result?.data?.images?.length) {
        const imageUrl = result.data.images[0].url;
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
        });
        return Buffer.from(response.data);
      }

      throw new Error("No image data returned from FAL.");
    } catch (error: any) {
      const status = this._extractErrorStatus(error);
      const details = this._extractErrorDetails(error);
      console.error(
        `FAL Service Error${status ? ` (${status})` : ""}: ${details}`,
      );
      const wrapped: any = new Error(details);
      if (status) wrapped.status = status;
      throw wrapped;
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
