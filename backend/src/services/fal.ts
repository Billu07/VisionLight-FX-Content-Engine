import { fal } from "@fal-ai/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Configure FAL
fal.config({
  credentials: process.env.FAL_KEY,
});

export const FalService = {
  /**
   */
  async upscaleImage(params: { imageUrl: string }): Promise<Buffer> {
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
