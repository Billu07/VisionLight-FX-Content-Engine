import multer from "multer";
import { Request } from "express";
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

// Configure multer for file uploads
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: any) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed"), false);
    }
  },
});

export const uploadToCloudinary = async (
  file: Express.Multer.File
): Promise<string> => {
  try {
    const bucketName = process.env.R2_BUCKET_NAME || "";
    const publicUrl = process.env.R2_PUBLIC_URL || "";
    
    // Generate a unique file name
    let fileExtension = "jpg";
    if (file.originalname && file.originalname.includes(".")) {
      fileExtension = file.originalname.split('.').pop() || "jpg";
    } else if (file.mimetype) {
      fileExtension = file.mimetype.split('/').pop() || "jpg";
    }
    const uniqueId = crypto.randomUUID();
    const fileKey = `visionlight-reference-images/${uniqueId}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await r2Client.send(command);
    
    const finalUrl = `${publicUrl}/${fileKey}`;
    console.log("✅ File uploaded to R2:", finalUrl);
    return finalUrl;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw error;
  }
};
