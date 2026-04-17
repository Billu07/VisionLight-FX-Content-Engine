import express from "express";
import axios from "axios";
import sharp from "sharp";
import { isAllowedProxyImageUrl } from "../lib/app-runtime";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    message: "PicDrift Studio FX Backend - Multi-Tenant",
    version: "5.0.0",
    status: "Healthy",
  });
});

router.get("/api/proxy-image", async (req, res) => {
  const { url, w, q } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL required" });
  }
  if (!isAllowedProxyImageUrl(url)) {
    return res
      .status(403)
      .json({ error: "URL host is not allowed for proxying" });
  }

  const width = typeof w === "string" ? parseInt(w, 10) : undefined;
  if (
    w !== undefined &&
    (width === undefined || Number.isNaN(width) || width < 16 || width > 4096)
  ) {
    return res.status(400).json({ error: "Invalid width parameter" });
  }

  const quality = typeof q === "string" ? parseInt(q, 10) : 80;
  if (
    q !== undefined &&
    (Number.isNaN(quality) || quality < 1 || quality > 100)
  ) {
    return res.status(400).json({ error: "Invalid quality parameter" });
  }

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: width || q !== undefined ? "arraybuffer" : "stream",
      timeout: 15000,
    });

    if (width || q !== undefined) {
      let imageBuffer = response.data;
      let sharpInstance = sharp(imageBuffer);

      if (width) {
        sharpInstance = sharpInstance.resize({
          width,
          withoutEnlargement: true,
        });
      }

      imageBuffer = await sharpInstance.webp({ quality }).toBuffer();

      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(imageBuffer);
    } else {
      res.setHeader(
        "Content-Type",
        response.headers["content-type"] || "image/jpeg",
      );
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      response.data.pipe(res);
    }
  } catch (error: any) {
    console.error("Proxy Error:", error.message);
    res.status(500).json({ error: "Failed to proxy image" });
  }
});

export default router;
