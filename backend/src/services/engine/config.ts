import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import OpenAI from "openai";

dotenv.config();

// AI Clients
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const cloudinaryClient = cloudinary;

// Constants
export const AI_TIMEOUT = 120000;
export const VIDEO_UPLOAD_TIMEOUT = 600000;

// Third Party APIs
export const KIE_BASE_URL = "https://api.kie.ai/api/v1";
export const KIE_API_KEY = process.env.KIE_AI_API_KEY;

export const FAL_KEY = process.env.FAL_KEY;
export const FAL_BASE_PATH =
  "https://queue.fal.run/fal-ai/kling-video/v2.5-turbo";
export const FAL_TOPAZ_PATH =
  "https://queue.fal.run/fal-ai/topaz/upscale/image";
