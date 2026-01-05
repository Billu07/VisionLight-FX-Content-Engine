import sharp from "sharp";
import axios from "axios";
import { cloudinaryClient } from "./config";
import { GeminiService } from "../gemini";

export const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

export const resizeStrict = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  return await sharp(buffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .toFormat("jpeg", { quality: 95 })
    .toBuffer();
};

export const resizeWithBlurFill = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  try {
    const background = await sharp(buffer)
      .resize({ width, height, fit: "cover" })
      .blur(40)
      .toBuffer();

    const foreground = await sharp(buffer)
      .resize({
        width,
        height,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    return await sharp(background)
      .composite([{ input: foreground, gravity: "center" }])
      .toFormat("jpeg")
      .toBuffer();
  } catch (e) {
    return buffer;
  }
};

// ✅ HELPER: AI Outpainting (FIXED: "Mirrored Glitch" Strategy)
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  targetRatioString: string = "16:9"
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Gemini Outpaint: ${targetRatioString} (${targetWidth}x${targetHeight})`
    );

    // 1. Calculate Padding Dimensions
    const metadata = await sharp(originalBuffer).metadata();
    const origW = metadata.width || 1000;
    const origH = metadata.height || 1000;

    // We use a 'contain' strategy on a transparent background first
    // Then we fill the transparency with a MIRROR of the image
    // This creates a seamless color transition at the edge, stopping the "Frame" effect.

    // Step A: Create the canvas filled with the image stretched/mirrored (approximate via blur/flop)
    // A simple robust way in Sharp without complex tiling is to use 'extend' with 'mirror'
    // but Sharp's extend doesn't always support 'mirror' mode in all versions perfectly for layout.
    // So we use a resizing trick:

    const backgroundGuide = await sharp(originalBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "fill", // Stretch it distored
      })
      .blur(10) // Light blur to obscure details but keep exact colors
      .toBuffer();

    // 2. Place Original Image in Center
    const compositeBuffer = await sharp(backgroundGuide)
      .composite([
        {
          input: await sharp(originalBuffer)
            .resize({ width: targetWidth, height: targetHeight, fit: "inside" })
            .toBuffer(),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer();

    // 3. ✅ NEW PROMPT STRATEGY: "Uncrop / Glitch Fix"
    // We explicitly tell Gemini that the outer area is "distorted" and needs "reconstruction".
    // This breaks the "3-panel" hallucination because it sees the outer area as *broken* parts of the same image.

    let instructions = "";

    if (targetRatioString === "9:16" || targetRatioString === "portrait") {
      instructions = `
      TASK: Uncrop to Portrait.
      INPUT: A central photo surrounded by distorted/stretched background data.
      ACTION: Regenerate the top and bottom areas. Replace the distorted pixels with realistic sky/ceiling (top) and ground/floor (bottom).
      `;
    } else if (
      targetRatioString === "16:9" ||
      targetRatioString === "landscape"
    ) {
      instructions = `
      TASK: Uncrop to Landscape.
      INPUT: A central photo surrounded by distorted/stretched background data.
      ACTION: Regenerate the left and right sides. Replace the distorted pixels with realistic scenery extensions.
      `;
    } else {
      instructions = `TASK: Expand Image. Fill the outer areas naturally.`;
    }

    const fullPrompt = `
    ${instructions}
    
    CRITICAL RULES:
    1. SEAMLESS: The transition from the sharp center to the new edges must be invisible.
    2. SINGLE IMAGE: The final result must look like ONE continuous photo. Do NOT create panels, borders, or split screens.
    3. MATCH TEXTURE: If the center is a photo, the edges must be photorealistic. If art, match the art style.
    4. FIX DISTORTION: The outer areas are placeholders. You must overwrite them completely.
    `;

    return await GeminiService.generateOrEditImage({
      prompt: fullPrompt,
      aspectRatio: targetRatioString,
      referenceImages: [compositeBuffer],
      modelType: "quality",
    });
  } catch (error: any) {
    console.error("❌ Gemini Resize Error:", error.message);
    throw error;
  }
};

export const uploadToCloudinary = async (
  f: any,
  p: string,
  u: string,
  t: string,
  r: string
): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const options = {
      resource_type: r as "auto" | "image" | "video" | "raw",
      folder: `visionlight/user_${u}/${r}s`,
      public_id: p,
      overwrite: true,
      context: { caption: t, alt: t },
    };
    if (Buffer.isBuffer(f)) {
      cloudinaryClient.uploader
        .upload_stream(options, (err, res) =>
          err ? reject(err) : resolve(res!.secure_url)
        )
        .end(f);
    } else {
      cloudinaryClient.uploader.upload(
        f,
        { ...options, timeout: 120000 },
        (err, res) => (err ? reject(err) : resolve(res!.secure_url))
      );
    }
  });
};

export const downloadAndOptimizeImages = async (
  urls: string[]
): Promise<Buffer[]> => {
  if (urls.length === 0) return [];
  const promises = urls.map(async (rawUrl) => {
    try {
      const url = getOptimizedUrl(rawUrl);
      const res = await axios.get(url, { responseType: "arraybuffer" });
      return await sharp(res.data)
        .resize(1024, 1024, { fit: "inside" })
        .toFormat("jpeg", { quality: 80 })
        .toBuffer();
    } catch (e) {
      return null;
    }
  });
  const results = await Promise.all(promises);
  return results.filter((buf): buf is Buffer => buf !== null);
};

export const getClosestAspectRatio = (
  width: number,
  height: number
): string => {
  const ratio = width / height;
  const targets = [
    { id: "1:1", val: 1.0 },
    { id: "16:9", val: 1.77 },
    { id: "9:16", val: 0.56 },
  ];
  const closest = targets.reduce((prev, curr) =>
    Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
  );
  return closest.id;
};
