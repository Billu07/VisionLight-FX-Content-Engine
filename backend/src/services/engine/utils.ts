import sharp from "sharp";
import axios from "axios";
import { cloudinaryClient, FAL_KEY } from "./config";

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

// Helper: Resize with Blur (FALLBACK)
// ✅ Updated to ensure it blurs, so we know if fallback was triggered
export const resizeWithBlurFill = async (
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  console.log("⚠️ Triggering Fallback: Blur Fill");
  try {
    const background = await sharp(buffer)
      .resize({ width, height, fit: "cover" }) // Stretch
      .blur(50) // Strong Blur
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

// ✅ HELPER: FLUX FILL (With Debug Logs)
export const resizeWithGemini = async (
  originalBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  targetRatioString: string = "16:9"
): Promise<Buffer> => {
  try {
    console.log(
      `🚀 STARTING FLUX FILL: ${targetRatioString} (${targetWidth}x${targetHeight})`
    );

    // 1. Check API Key
    if (!FAL_KEY) {
      throw new Error("❌ FAL_KEY is missing in env variables!");
    }

    // 2. Prepare Input Image (Blurred Stretch Context)
    // We fill the void with a blurred stretch so Flux has color context
    console.log("... Preparing Input Canvas");
    const backgroundBase = await sharp(originalBuffer)
      .resize({ width: targetWidth, height: targetHeight, fit: "fill" })
      .blur(40)
      .toBuffer();

    const inputCanvas = await sharp(backgroundBase)
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

    // 3. Prepare Mask (White=Fill, Black=Keep)
    console.log("... Preparing Mask");
    const metadata = await sharp(originalBuffer).metadata();
    const { width: origW = 1, height: origH = 1 } = metadata;

    // Exact inner dimensions
    const scale = Math.min(targetWidth / origW, targetHeight / origH);
    const innerW = Math.floor(origW * scale);
    const innerH = Math.floor(origH * scale);

    // Overlap: We shrink the "Keep" (Black) area by 20px so Flux blends the edges
    const maskPadding = 20;
    const keepW = Math.max(1, innerW - maskPadding);
    const keepH = Math.max(1, innerH - maskPadding);

    const baseMask = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 255 }, // White (Fill)
      },
    })
      .png()
      .toBuffer();

    const blackRect = await sharp({
      create: {
        width: keepW,
        height: keepH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 }, // Black (Keep)
      },
    })
      .png()
      .toBuffer();

    const finalMaskBuffer = await sharp(baseMask)
      .composite([{ input: blackRect, gravity: "center" }])
      .png()
      .toBuffer();

    // 4. Upload to Cloudinary
    console.log("... Uploading resources to Cloudinary");
    const tempId = `temp_${Date.now()}`;
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

    console.log("📤 Sending Request to Fal.ai...", { imageUrl, maskUrl });

    // 5. Call Flux
    const result = await axios.post(
      "https://queue.fal.run/fal-ai/flux-pro/v1/fill-finetuned",
      {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt:
          "High quality, photorealistic, seamless extension of the scene. The new areas must match the center perfectly in lighting and texture.",
        num_inference_steps: 28,
        guidance_scale: 30, // Strict adherence
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

    if (result.data.images && result.data.images.length > 0) {
      console.log("✅ Flux Success! Downloading result...");
      const finalUrl = result.data.images[0].url;
      const response = await axios.get(finalUrl, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } else {
      throw new Error("Flux returned no images.");
    }
  } catch (error: any) {
    console.error("❌ OUTPAINTING FAILED:", error.message);
    if (error.response) {
      console.error("Fal Response Data:", JSON.stringify(error.response.data));
    }
    // Fallback to Blur so we know it failed
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
    { id: "16:9", val: 1.77 },
    { id: "9:16", val: 0.56 },
  ];
  const closest = targets.reduce((prev, curr) =>
    Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
  );
  return closest.id;
};
