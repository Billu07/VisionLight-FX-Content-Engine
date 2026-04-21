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
  const { url, w, q, download, filename } = req.query;
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

    const shouldDownload = download === "1" || download === "true";
    if (shouldDownload) {
      const rawName =
        typeof filename === "string" && filename.trim().length > 0
          ? filename.trim()
          : "image.jpg";
      const safeName = rawName.replace(/[^\w.\- ]+/g, "_");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    }

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

router.get("/api/proxy-video", async (req, res) => {
  const { url, download, filename } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL required" });
  }
  if (!isAllowedProxyImageUrl(url)) {
    return res
      .status(403)
      .json({ error: "URL host is not allowed for proxying" });
  }

  try {
    const range = req.headers.range;
    const upstream = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: 30000,
      headers: range ? { Range: range } : undefined,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    res.status(upstream.status);
    const passthroughHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
    ] as const;

    for (const header of passthroughHeaders) {
      const value = upstream.headers[header];
      if (value) res.setHeader(header, value);
    }

    if (!upstream.headers["accept-ranges"]) {
      res.setHeader("accept-ranges", "bytes");
    }

    const shouldDownload = download === "1" || download === "true";
    if (shouldDownload) {
      const rawName =
        typeof filename === "string" && filename.trim().length > 0
          ? filename.trim()
          : "video.mp4";
      const safeName = rawName.replace(/[^\w.\- ]+/g, "_");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    upstream.data.pipe(res);
  } catch (error: any) {
    console.error("Video Proxy Error:", error.message);
    res.status(500).json({ error: "Failed to proxy video" });
  }
});

export default router;
