import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  static async uploadImage(buffer: Buffer, folder: string = "visionlight") {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: "image",
            quality: "auto",
            fetch_format: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });
  }

  static async uploadVideo(buffer: Buffer, folder: string = "visionlight") {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: "video",
            quality: "auto",
            fetch_format: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });
  }

  static async uploadFromUrl(url: string, folder: string = "visionlight") {
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder,
        resource_type: "auto", // Auto-detect image/video
      });
      return result;
    } catch (error) {
      throw new Error(`Cloudinary upload failed: ${error}`);
    }
  }

  // Generate optimized URLs with transformations
  static getOptimizedUrl(publicId: string, type: "image" | "video" = "image") {
    if (type === "image") {
      return cloudinary.url(publicId, {
        quality: "auto",
        fetch_format: "auto",
        width: 1200,
        crop: "limit",
      });
    } else {
      return cloudinary.url(publicId, {
        resource_type: "video",
        quality: "auto",
        fetch_format: "auto",
      });
    }
  }

  // Generate thumbnail URL
  static getThumbnailUrl(publicId: string, type: "image" | "video" = "image") {
    if (type === "image") {
      return cloudinary.url(publicId, {
        width: 400,
        height: 400,
        crop: "fill",
        quality: "auto",
        fetch_format: "auto",
      });
    } else {
      return cloudinary.url(publicId, {
        resource_type: "video",
        width: 400,
        height: 400,
        crop: "fill",
        quality: "auto",
      });
    }
  }
}
