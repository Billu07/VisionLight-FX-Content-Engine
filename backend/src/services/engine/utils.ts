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

// ✅ HELPER: AI Outpainting (Context-Aware Logic)
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

    // 1. Create a Solid Black Canvas (The "Void")
    // Black works best IF the prompt explicitly identifies it as "empty space to fill"
    const backgroundGuide = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    })
      .png()
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

    // 3. ✅ CONTEXT-AWARE PROMPTS
    // We treat Portrait vs Landscape differently to stop the "3-panel" hallucination.

    let instructions = "";

    if (targetRatioString === "9:16" || targetRatioString === "portrait") {
      // VERTICAL LOGIC
      instructions = `
      TASK: Vertical Image Expansion (Tall Format).
      INPUT: A central image with BLACK BARS at the TOP and BOTTOM.
      ACTION:
      - EXTEND VERTICALLY: You must generate new content for the top (sky/ceiling) and bottom (ground/floor).
      - CONTINUITY: The new top/bottom areas must seamlessly connect to the center.
      - NO PANELS: Do NOT create a triptych. This is ONE single tall image.
      `;
    } else if (
      targetRatioString === "16:9" ||
      targetRatioString === "landscape"
    ) {
      // HORIZONTAL LOGIC
      instructions = `
      TASK: Horizontal Image Expansion (Wide Format).
      INPUT: A central image with BLACK BARS on the LEFT and RIGHT.
      ACTION:
      - EXTEND HORIZONTALLY: You must generate new content for the left and right sides.
      - CONTINUITY: Widen the horizon or scene naturally.
      - NO PANELS: Do NOT create a split-screen. This is ONE single wide image.
      `;
    } else {
      // SQUARE/GENERAL LOGIC
      instructions = `
      TASK: Image Uncropping.
      INPUT: An image centered on a black background.
      ACTION: Fill the black background with natural scene extensions that match the center.
      - NO FRAMES: The result must look like a full-frame photograph.
      `;
    }

    const fullPrompt = `
    ${instructions}
    
    STRICT RULES:
    1. PRESERVE THE CENTER: The central rectangular image is the source of truth. Do not modify the subject inside it.
    2. MATCH LIGHTING: The generated extensions must match the lighting direction of the source.
    3. HIGH FIDELITY: Generate photorealistic textures for the new areas.
    `;

    return await GeminiService.generateOrEditImage({
      prompt: fullPrompt,
      aspectRatio: targetRatioString,
      referenceImages: [compositeBuffer],
      modelType: "quality", // Ensures Gemini 3 Pro
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
