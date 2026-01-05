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

// ✅ HELPER: AI Uncropping (Fixed "Blurry Bottom" Issue)
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  targetRatioString: "16:9" | "9:16" | "1:1" = "16:9"
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Gemini Uncrop: ${targetRatioString} (${targetWidth}x${targetHeight})`
    );

    // 1. Create a "Low Res" Guide Background
    // Instead of smooth blur (which looks like bokeh), we create a pixelated stretch.
    // This looks like "bad data" that the AI feels compelled to fix.
    const backgroundGuide = await sharp(originalBuffer)
      .resize({
        width: Math.round(targetWidth / 10),
        height: Math.round(targetHeight / 10),
        fit: "cover",
      }) // Shrink
      .resize({ width: targetWidth, height: targetHeight, kernel: "nearest" }) // Blow up pixelated
      .blur(5) // Slight soften to blend edges
      .modulate({ brightness: 0.7 }) // Darken slightly to de-emphasize
      .toBuffer();

    // 2. Place Sharp Original on Top
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

    // 3. ✅ NEW PROMPT: "Uncrop" logic
    // We explicitly tell it to extend the field of view and fix resolution.
    const fullPrompt = `
    TASK: Uncrop / Image Extension.
    
    INPUT: A central high-quality image placed on a low-resolution placeholder canvas.
    
    INSTRUCTIONS:
    1. EXPAND THE SCENE: The pixelated/blurry outer areas are missing data. You must regenerate them completely.
    2. MATCH RESOLUTION: The new edges must be High Resolution and sharp, matching the center perfectly. Do not leave them blurry.
    3. INFINITE DEPTH: If the image is a landscape, extend the horizon. If it is a portrait, extend the body/background.
    4. NO BORDERS: The final result must look like a single wide-angle photo.
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
