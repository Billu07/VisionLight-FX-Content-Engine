import sharp from "sharp";
import axios from "axios";
import { cloudinaryClient } from "./config";
import { GeminiService } from "../gemini";
import { FalService } from "../fal";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

// Configure AWS S3 Client for Cloudflare R2
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export { cloudinaryClient };

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
      .png() // 👈 CRITICAL: Must be PNG to preserve alpha for the composite step
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
  apiKeys?: any,
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

    // 2. Call FAL (Passing original buffer directly)
    // Your fal.ts handles the actual aspect_ratio param in the config
    return await FalService.generateOrEditImage({
      prompt: fullPrompt,
      aspectRatio: targetRatioString,
      referenceImages: [originalBuffer], // Passing the raw image, no black bars
      modelType: "quality",
      imageSize: "2K", // Request high res for the expansion
      apiKey: apiKeys?.falApiKey,
    });
  } catch (error: any) {
    console.error("❌ FAL Direct Error:", error.message);
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
  try {
    const bucketName = process.env.R2_BUCKET_NAME || "";
    const publicUrl = process.env.R2_PUBLIC_URL || "";
    
    // We are generating unique keys for R2. We ignore 'p' (which was cloudinary public_id)
    // and instead use UUIDs to guarantee no collisions.
    const uniqueId = crypto.randomUUID();
    let extension = r === "video" ? "mp4" : "jpg";
    let contentType = r === "video" ? "video/mp4" : "image/jpeg";
    
    const fileKey = `visionlight/user_${u}/${r}s/${uniqueId}.${extension}`;

    let bufferToUpload: Buffer;

    if (Buffer.isBuffer(f)) {
      bufferToUpload = f;
    } else if (typeof f === 'string' && f.startsWith('http')) {
      // If a URL was passed, download it first then upload to R2
      const response = await axios.get(f, { responseType: 'arraybuffer' });
      bufferToUpload = Buffer.from(response.data);
      
      // Try to guess mime type from response if available
      if (response.headers['content-type']) {
        contentType = response.headers['content-type'];
        extension = contentType.split('/').pop() || extension;
      }
    } else {
      throw new Error("Unsupported file format for R2 upload. Must be Buffer or URL.");
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: bufferToUpload,
      ContentType: contentType,
    });

    await r2Client.send(command);
    
    const finalUrl = `${publicUrl}/${fileKey}`;
    console.log(`✅ Uploaded ${r} to R2:`, finalUrl);
    return finalUrl;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw error;
  }
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
