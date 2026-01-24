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
  height: number,
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
  height: number,
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

// ✅ HELPER: Direct Prompting (No Canvas Hacks)
// We rely on Gemini 3's native ability to uncrop/resize based on instructions.
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number, // (Unused but kept for signature compatibility)
  targetHeight: number, // (Unused but kept for signature compatibility)
  targetRatioString: string = "16:9",
): Promise<Buffer> => {
  try {
    console.log(`✨ Gemini Direct Outpaint: Target ${targetRatioString}`);

    let instruction = "";

    // 1. Construct Specific "Uncrop" Prompt
    if (targetRatioString === "9:16" || targetRatioString === "portrait") {
      instruction = `
      TASK: Convert this image to Vertical Portrait (9:16).
      ACTION: Expand the field of view vertically.
      - Generate more sky/ceiling above and ground/floor below.
      - Keep the original subject centered and unchanged.
      - Ensure the new areas seamlessly match the lighting and perspective of the original.
      `;
    } else if (
      targetRatioString === "16:9" ||
      targetRatioString === "landscape"
    ) {
      instruction = `
      TASK: Convert this image to Wide Landscape (16:9).
      ACTION: Expand the field of view horizontally.
      - Widen the scene to the left and right.
      - Keep the original subject centered and unchanged.
      - Ensure the new scenery matches the environment perfectly.
      `;
    } else {
      instruction = `
      TASK: Expand the image canvas to a Square (1:1).
      ACTION: Reveal more of the surroundings on all sides without altering the central subject.
      `;
    }

    const fullPrompt = `
    ${instruction}
    
    STRICT CONSTRAINT: 
    Do NOT crop the original subject. Do NOT distort or squash the image.
    The output must be a single, continuous image. Do NOT create panels, borders, or split-screens.
    You are revealing the "rest of the photo" that was outside the frame.
    High fidelity, photorealistic style.
    `;

    // 2. Call Gemini (Passing original buffer directly)
    // Your gemini.ts handles the actual aspect_ratio param in the config
    return await GeminiService.generateOrEditImage({
      prompt: fullPrompt,
      aspectRatio: targetRatioString,
      referenceImages: [originalBuffer], // Passing the raw image, no black bars
      modelType: "quality",
      imageSize: "2K", // Request high res for the expansion
    });
  } catch (error: any) {
    console.error("❌ Gemini Direct Error:", error.message);
    throw error;
  }
};

// Helper: Upload
export const uploadToCloudinary = async (
  f: any,
  p: string,
  u: string,
  t: string,
  r: string,
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
          err ? reject(err) : resolve(res!.secure_url),
        )
        .end(f);
    } else {
      cloudinaryClient.uploader.upload(
        f,
        { ...options, timeout: 120000 },
        (err, res) => (err ? reject(err) : resolve(res!.secure_url)),
      );
    }
  });
};

// Helper: Download
export const downloadAndOptimizeImages = async (
  urls: string[],
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
  height: number,
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
    Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev,
  );
  return closest.id;
};
