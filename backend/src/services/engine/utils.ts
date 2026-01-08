import sharp from "sharp";
import axios from "axios";
import { cloudinaryClient, FAL_KEY } from "./config";
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

// ✅ HELPER: Upload Buffer to Cloudinary (Required for Flux Input)
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

/* 
// ---------------------------------------------------------
// 🔴 GEMINI IMPLEMENTATION (Deprecated / Backup)
// ---------------------------------------------------------
export const resizeWithGemini = async (...) => { ... }
*/

// ✅ HELPER: FLUX FILL (State-of-the-Art Outpainting)
// We keep the function name 'resizeWithGemini' to avoid breaking imports in other files,
// but the logic is now 100% Flux.
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  targetRatioString: string = "16:9"
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Flux Fill (Fal.ai): ${targetRatioString} (${targetWidth}x${targetHeight})...`
    );

    // 1. Prepare Input Image (Original centered on Gray canvas)
    // Flux needs a base image. Gray works best for the "empty" areas.
    const inputCanvas = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 255 },
      },
    })
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

    // 2. Prepare Mask (White = Fill, Black = Keep)
    // We create a white canvas (fill everything) and place a black box (keep) in the center.

    // A. Base White Mask
    const baseMask = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 255 }, // White
      },
    })
      .png()
      .toBuffer();

    // B. Calculate Inner Box Dimensions
    const metadata = await sharp(originalBuffer).metadata();
    const { width: origW = 1, height: origH = 1 } = metadata;

    // Calculate the dimensions of the image when "fit: inside" is applied
    const scale = Math.min(targetWidth / origW, targetHeight / origH);
    const innerW = Math.floor(origW * scale);
    const innerH = Math.floor(origH * scale);

    // C. Create Black Rect
    const blackRect = await sharp({
      create: {
        width: innerW,
        height: innerH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 }, // Black
      },
    })
      .png()
      .toBuffer();

    // D. Composite Black Rect onto White Mask
    const finalMaskBuffer = await sharp(baseMask)
      .composite([{ input: blackRect, gravity: "center" }])
      .png()
      .toBuffer();

    // 3. Upload to Cloudinary (Fal needs public URLs)
    const tempId = `temp_${Date.now()}`;
    // Use a dummy user ID 'system' for temp uploads
    const imageUrl = await uploadToCloudinary(
      inputCanvas,
      `${tempId}_img`,
      "system",
      "temp",
      "image"
    );
    const maskUrl = await uploadToCloudinary(
      finalMaskBuffer,
      `${tempId}_mask`,
      "system",
      "temp",
      "image"
    );

    console.log("📤 Sending to Flux Pro...", { imageUrl, maskUrl });

    // 4. Call Fal.ai (Flux Pro 1.6 Fill)
    // Using sync_mode=true so we don't have to poll
    const result = await axios.post(
      "https://queue.fal.run/fal-ai/flux-pro/v1/fill-finetuned",
      {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt:
          "High quality, photorealistic, seamless extension of the scene. 4k resolution.",
        num_inference_steps: 28,
        guidance_scale: 3.5, // Standard for Flux
        sync_mode: true, // Wait for result
        safety_tolerance: "2",
      },
      {
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 5. Download Result
    if (result.data.images && result.data.images.length > 0) {
      const finalUrl = result.data.images[0].url;
      const response = await axios.get(finalUrl, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } else {
      throw new Error("Flux returned no images.");
    }
  } catch (error: any) {
    console.error("❌ Flux Fill Error:", error.message, error.response?.data);
    // Fallback to Blur if Flux fails (e.g., rate limit)
    return resizeWithBlurFill(originalBuffer, targetWidth, targetHeight);
  }
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
