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

// Helper: Resize with Blur
export const resizeWithBlurFill = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  try {
    const background = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    })
      .png()
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
    return await sharp(buffer)
      .resize(width, height, { fit: "cover", position: "center" })
      .toFormat("jpeg")
      .toBuffer();
  }
};

// ✅ HELPER: AI Outpainting (Black Bars + Seam-Blending Prompt)
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  targetRatioString: string = "16:9"
): Promise<Buffer> => {
  try {
    console.log(
      `✨ Gemini Outpaint: ${targetRatioString} (${targetWidth}x${targetHeight})...`
    );

    // 1. Create Solid Black Canvas
    const backgroundGuide = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 }, // Solid Black
      },
    })
      .png()
      .toBuffer();

    // 2. Composite original image centered
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

    // 3. Logic: Determine Direction
    const isPortrait = targetHeight > targetWidth;
    const direction = isPortrait ? "vertical" : "horizontal";

    // 4. ✅ REFINED PROMPT: Focus on "Invisible Seams"
    const fullPrompt = `
    TASK: Seamless Image Outpainting.
    INPUT: A photograph placed centrally on a black background.
    
    INSTRUCTIONS:
    1. FILL THE BLACK VOID: Completely overwrite the black ${direction} bars with realistic scenery that extends from the central image.
    2. DISSOLVE THE BORDER: There must be NO VISIBLE LINE or SEAM between the original image and the generated extension. Blend the pixels perfectly.
    3. MATCH THE CENTER: The new areas must match the focus, noise, grain, and lighting of the central photo exactly.
    4. SINGLE CONTINUOUS SHOT: The final result must look like ONE single photo taken with a wider lens. 
    5. NO PANELS/FRAMES: Do not create a comic-book style layout. Do not draw lines separating the center from the edges.
    6. PRESERVE SUBJECT: Keep the central subject exactly as it is, but merge the background smoothly.
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
