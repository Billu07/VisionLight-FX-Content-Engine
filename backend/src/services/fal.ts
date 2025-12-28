import { fal } from "@fal-ai/client";
import axios from "axios";

// Configure FAL
fal.config({
  credentials: process.env.FAL_KEY, // Ensure this is in your .env
});

export const FalService = {
  /**
   * DRIFT EDITOR: Changes camera angle/zoom of an input image
   */
  async generateDriftAngle(params: {
    imageUrl: string;
    horizontalAngle: number; // 0-360
    verticalAngle: number; // 0-60
    zoom: number; // 0-10
  }): Promise<Buffer> {
    try {
      console.log(
        `🌀 FAL Drift: H:${params.horizontalAngle} V:${params.verticalAngle} Z:${params.zoom}`
      );

      const result: any = await fal.subscribe(
        "fal-ai/flux-2-lora-gallery/multiple-angles",
        {
          input: {
            image_urls: [params.imageUrl],
            horizontal_angle: params.horizontalAngle,
            vertical_angle: params.verticalAngle,
            zoom: params.zoom,
            output_format: "jpeg",
            num_inference_steps: 30, // Balanced for speed/quality
            guidance_scale: 2.5,
          },
          logs: true,
        }
      );

      if (result.data && result.data.images && result.data.images.length > 0) {
        const outputUrl = result.data.images[0].url;

        // Download the result to a buffer so we can upload to Cloudinary
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
