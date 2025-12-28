import { fal } from "@fal-ai/client";
import axios from "axios";

// Configure FAL
fal.config({
  credentials: process.env.FAL_KEY,
});

export const FalService = {
  /**
   * DRIFT EDITOR: Full-Power Virtual Camera
   * Uses Flux 2 LoRA with user prompts + parametric control
   */
  async generateDriftAngle(params: {
    imageUrl: string;
    prompt?: string;
    horizontalAngle: number;
    verticalAngle: number;
    zoom: number;
    width?: number;
    height?: number;
  }): Promise<Buffer> {
    try {
      console.log(
        `🌀 FAL Drift | H:${params.horizontalAngle}° V:${params.verticalAngle}° Z:${params.zoom}`
      );

      // Default to square_hd if dimensions aren't provided
      let imageSize: any = "square_hd";
      if (params.width && params.height) {
        imageSize = { width: params.width, height: params.height };
      }

      // 🛠️ FIX: Cast input to 'any' to bypass strict TypeScript check for 'prompt'
      const inputPayload: any = {
        image_urls: [params.imageUrl],

        // We pass the prompt to help the model retain subject identity.
        // Even if the model auto-generates camera tokens, this adds context.
        prompt: params.prompt || "",

        horizontal_angle: params.horizontalAngle,
        vertical_angle: params.verticalAngle,
        zoom: params.zoom,

        image_size: imageSize,
        output_format: "png", // Lossless
        num_inference_steps: 50, // ✅ YES, WE ARE USING 50 STEPS (Max Quality)
        guidance_scale: 2.5,
        lora_scale: 1.0,
        enable_safety_checker: false,
      };

      const result: any = await fal.subscribe(
        "fal-ai/flux-2-lora-gallery/multiple-angles",
        {
          input: inputPayload,
          logs: true,
        }
      );

      if (result.data && result.data.images && result.data.images.length > 0) {
        const outputUrl = result.data.images[0].url;
        const response = await axios.get(outputUrl, {
          responseType: "arraybuffer",
        });
        return Buffer.from(response.data);
      }

      throw new Error("No image returned from FAL Drift");
    } catch (error: any) {
      console.error("FAL Drift Error:", error.message);
      throw error;
    }
  },
};
