import { fal } from "@fal-ai/client";
import axios from "axios";

// Configure FAL
// Make sure FAL_KEY is in your .env file
fal.config({
  credentials: process.env.FAL_KEY,
});

export const FalService = {
  /**
   * DRIFT EDITOR: Changes camera angle/zoom of an input image
   * utilizing the full capabilities of Flux 2 LoRA.
   */
  async generateDriftAngle(params: {
    imageUrl: string;
    horizontalAngle: number; // 0-360
    verticalAngle: number; // -90 to 90 (We'll map this logically)
    zoom: number; // 0-10
    width?: number; // Preserve Original Aspect Ratio
    height?: number;
  }): Promise<Buffer> {
    try {
      console.log(
        `🌀 FAL Drift | H:${params.horizontalAngle}° V:${params.verticalAngle}° Z:${params.zoom}`
      );

      // Construct Image Size object if dimensions exist
      let imageSize: any = "square_hd"; // Default fallback
      if (params.width && params.height) {
        imageSize = { width: params.width, height: params.height };
      }

      const result: any = await fal.subscribe(
        "fal-ai/flux-2-lora-gallery/multiple-angles",
        {
          input: {
            image_urls: [params.imageUrl],
            horizontal_angle: params.horizontalAngle,
            vertical_angle: params.verticalAngle,
            zoom: params.zoom,

            // 🚀 SAAS QUALITY SETTINGS
            image_size: imageSize,
            output_format: "png", // Lossless quality
            num_inference_steps: 50, // High step count for better detail (default is 40)
            guidance_scale: 2.5, // Optimal for Flux-LoRA adherence
            lora_scale: 1.0, // Full effect strength
            enable_safety_checker: false, // Prevent false positives on artistic content
          },
          logs: true,
        }
      );

      if (result.data && result.data.images && result.data.images.length > 0) {
        const outputUrl = result.data.images[0].url;

        // Download the result immediately to buffer
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
