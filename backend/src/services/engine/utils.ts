import sharp from "sharp";
import axios from "axios";
import { cloudinaryClient } from "./config";
import { GeminiService } from "../gemini";

// Helper: Fix Cloudinary URLs
export const getOptimizedUrl = (url: string) => {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_1280,c_limit,q_auto,f_jpg/");
  }
  return url;
};

// Helper: Resize Strict
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

// Helper: Resize with Blur (Fallback)
export const resizeWithBlurFill = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  try {
    const background = await sharp(buffer)
      .resize({ width, height, fit: "cover" }) // Stretch to fill
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
      .toFormat("jpeg", { quality: 95 })
      .toBuffer();
  } catch (e) {
    return buffer; // Fallback
  }
};

// ✅ HELPER: AI Outpainting (FIXED: "Blurred Context" Strategy)
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  targetRatioString: "16:9" | "9:16" | "1:1" = "16:9"
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Gemini Outpaint: ${targetRatioString} (${targetWidth}x${targetHeight})`
    );

    // 1. Create a "Blurred Context" Background
    // Instead of black bars, we stretch the original image to fill the screen
    // and blur it. This gives the AI color cues and prevents the "Panel" effect.
    const backgroundGuide = await sharp(originalBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "cover", // Forces image to fill the whole area
      })
      .blur(30) // Blur enough so it looks like "background", but keeps colors
      .toBuffer();

    // 2. Place Original Sharp Image on Top
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

    const fullPrompt = `
    TASK: Photo Restoration & Extension.
    INPUT: A high-quality central subject surrounded by low-quality blurry edges.
    
    INSTRUCTIONS:
    1. UN-BLUR THE EDGES: Re-draw the blurry outer areas to match the sharpness, texture, and lighting of the center perfectly.
    2. SEAMLESS EXTENSION: The final result must look like ONE single continuous photograph taken with a wide-angle lens.
    3. NO PANELS OR FRAMES: Do not create split screens. Do not draw borders. The image must be uniform.
    4. PRESERVE CENTER: The sharp central subject is perfect. Do not change it. Only fix the surroundings.
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

// Helper: Upload
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

// Helper: Download
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

// Helper: Ratio Matcher
export const getClosestAspectRatio = (
  width: number,
  height: number
): string => {
  const ratio = width / height;
  const targets = [
    { id: "1:1", val: 1.0 },
    { id: "4:3", val: 1.33 },
    { id: "3:4", val: 0.75 },
    { id: "3:2", val: 1.5 },
    { id: "2:3", val: 0.66 },
    { id: "16:9", val: 1.77 },
    { id: "9:16", val: 0.56 },
    { id: "21:9", val: 2.33 },
    { id: "5:4", val: 1.25 },
    { id: "4:5", val: 0.8 },
  ];
  const closest = targets.reduce((prev, curr) =>
    Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
  );
  return closest.id;
};
