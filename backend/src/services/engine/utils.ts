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

// ✅ HELPER: AI Outpainting (Black Bars + Perspective/Scale Locked Prompt)
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

    // 1. Create Solid Black Canvas
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

    // 3. ✅ SCALE-AWARE PROMPTS
    // We explicitly tell the AI to lock the focal length and perspective lines.

    let specificContext = "";

    if (targetRatioString === "9:16" || targetRatioString === "portrait") {
      specificContext = `
      GOAL: Vertical Uncrop.
      ACTION: The central image is a crop. The black bars at TOP and BOTTOM are the rest of the scene.
      Reveal those parts with visually consistent painting.
      `;
    } else if (
      targetRatioString === "16:9" ||
      targetRatioString === "landscape"
    ) {
      specificContext = `
      GOAL: Horizontal Uncrop.
      ACTION: The central image is a crop. The black bars at LEFT and RIGHT are the rest of the scene.
      Reveal the surroundings to the sides with visually consistent painting. You don't create borders, you complete the scene seamlessly.
      `;
    } else {
      specificContext = `
      GOAL: Expand Field of View.
      ACTION: Fill the surrounding black void with the rest of the environment with visually consistent painting.
      `;
    }

    const fullPrompt = `
    TASK: Photorealistic Image Extension (Outpainting).
    INPUT: A photo placed on a black canvas.
    
    ${specificContext}

    GEOMETRY & SCALE RULES (CRITICAL):
    1. LOCK FOCAL LENGTH: Do not change the zoom level. The new areas must have the EXACT SAME pixel scale as the center. 
       - Do NOT make objects in the extension tiny or giant compared to the center.
    2. EXTEND PERSPECTIVE LINES: Follow the vanishing points of the central image. 
       - If there are lines (roads, walls, horizon), continue them straight into the black area.
    3. MATCH DEPTH OF FIELD: If the background in the center is blurry, the new background must also be blurry. If sharp, make it sharp.
    4. NO VISIBLE SEAMS: The transition from the center to the generated area must be invisible.
    5. NO PANELS: This is ONE SINGLE continuous photograph. Do not draw frame lines. Do not duplicate center image.
    6. Don't create borders at the junction of the original image and the painting, you complete the scene, make it look seamless.
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
