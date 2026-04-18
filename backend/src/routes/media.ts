import express from "express";
import axios from "axios";
import archiver from "archiver";
import { getCost, getTargetPool } from "../config/pricing";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";
import { dbService as airtableService, prisma, CreditPool } from "../services/database";
import { contentEngine } from "../services/engine";
import { upload, uploadToCloudinary } from "../utils/fileUpload";
import {
  getTenantApiKeys,
  getTenantSettings,
  isSafeExternalUrl,
  normalizeHostname,
  normalizeAssetUrl,
} from "../lib/app-runtime";

const router = express.Router();
const MAX_GENERATION_REFERENCE_IMAGES = 14;

// ==================== ASSET MANAGEMENT ====================
router.post(
  "/api/posts/:postId/to-asset",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await contentEngine.copyPostMediaToAsset(req.params.postId, req.user!.id);
      res.json({ success: true, message: "Saved to Asset Library" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/export/video",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { projectId, editorState } = req.body;

      if (!editorState || !editorState.sequence) {
        return res.status(400).json({ error: "Invalid editor state provided." });
      }
      if (projectId) {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const post = await airtableService.createPost({
        userId: req.user!.id,
        projectId: projectId || undefined,
        prompt: "Exported from editor",
        title: `Export ${new Date().toLocaleDateString()}`,
        mediaType: "VIDEO",
        platform: "EDITOR_EXPORT",
        status: "PROCESSING",
        generationStep: "EXPORT",
      });

      res.status(202).json({ success: true, postId: post.id });

      const apiKeys = await getTenantApiKeys(req.user!.id);
      const engineAny = contentEngine as any;
      if (typeof engineAny.processSequenceExport !== "function") {
        console.error("processSequenceExport is not available in contentEngine");
        await airtableService.updatePost(post.id, {
          status: "FAILED",
          error: "Server failed to process export.",
          progress: 0,
        });
        return;
      }
      engineAny
        .processSequenceExport(post.id, req.user!.id, editorState.sequence, apiKeys)
        .catch(async (err: any) => {
          console.error("Background export failed:", err);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: "Server failed to process export.",
            progress: 0,
          });
        });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/upload-sync",
  authenticateToken,
  upload.single("image"),
  async (req: AuthenticatedRequest, res) => {
    let conversionDeducted = false;
    let conversionCost = 0;
    try {
      if (!req.file) return res.status(400).json({ error: "No image provided" });

      const { aspectRatio, raw, originalAssetId, projectId } = req.body;
      const fileSizeBytes = req.file.size;

      if (projectId) {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (projectId && req.user!.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: req.user!.organizationId },
        });
        if (org) {
          const projectAssets = await prisma.asset.findMany({
            where: { projectId },
            select: { sizeBytes: true },
          });
          const currentTotalBytes = projectAssets.reduce(
            (acc, a) => acc + (a.sizeBytes || 0),
            0,
          );
          const maxBytes = org.maxStorageMb * 1024 * 1024;

          if (currentTotalBytes + fileSizeBytes > maxBytes) {
            return res.status(400).json({
              error: `Storage Limit Exceeded. Your organization is limited to ${org.maxStorageMb}MB per project.`,
            });
          }
        }
      }

      if (raw === "true") {
        const asset = await contentEngine.uploadRawAsset(
          req.file.buffer,
          req.user!.id,
          projectId,
          aspectRatio,
          fileSizeBytes,
        );
        return res.json({ success: true, asset });
      }

      const [settings, user] = await Promise.all([
        getTenantSettings(req.user!.id),
        airtableService.findUserById(req.user!.id),
      ]);

      const cost = getCost(user, { mediaType: "image", mode: "convert" }, settings);
      conversionCost = cost;

      if (user!.creditsImageFX < cost) {
        return res.status(403).json({ error: "Insufficient Image FX credits" });
      }

      await airtableService.deductGranularCredits(req.user!.id, "creditsImageFX", cost);
      conversionDeducted = true;

      const apiKeys = await getTenantApiKeys(req.user!.id);
      const asset = await contentEngine.processAndSaveAsset(
        req.file.buffer,
        req.user!.id,
        aspectRatio || "16:9",
        originalAssetId,
        projectId,
        apiKeys,
      );
      res.json({ success: true, asset });
    } catch (error: any) {
      if (conversionDeducted && conversionCost > 0) {
        await airtableService.refundGranularCredits(
          req.user!.id,
          "creditsImageFX",
          conversionCost,
        );
      }
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/batch",
  authenticateToken,
  upload.array("images", 20),
  async (req: AuthenticatedRequest, res) => {
    let totalDeducted = 0;
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      const { aspectRatio } = req.body;

      if (files.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }

      const [settings, user] = await Promise.all([
        getTenantSettings(req.user!.id),
        airtableService.findUserById(req.user!.id),
      ]);

      const costPerImg = getCost(
        user,
        { mediaType: "image", mode: "batch" },
        settings,
      );
      const totalCost = files.length * costPerImg;

      if (user!.creditsImageFX < totalCost) {
        return res.status(403).json({
          error: `Need ${totalCost} Image FX credits for this batch.`,
        });
      }

      await airtableService.deductGranularCredits(
        req.user!.id,
        "creditsImageFX",
        totalCost,
      );
      totalDeducted = totalCost;

      const apiKeys = await getTenantApiKeys(req.user!.id);
      res.json({
        success: true,
        message: `Processing batch of ${files.length}. Cost: ${totalCost} credits.`,
      });

      (async () => {
        for (const file of files) {
          try {
            await contentEngine.processAndSaveAsset(
              file.buffer,
              req.user!.id,
              aspectRatio || "16:9",
              undefined,
              undefined,
              apiKeys,
            );
          } catch (e) {
            console.error("Failed batch item", e);
            await airtableService.refundGranularCredits(
              req.user!.id,
              "creditsImageFX",
              costPerImg,
            );
          }
        }
      })();
    } catch (error: any) {
      if (totalDeducted > 0) {
        await airtableService.refundGranularCredits(
          req.user!.id,
          "creditsImageFX",
          totalDeducted,
        );
      }
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/edit",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    let charged = false;
    let chargedCost = 0;
    try {
      const {
        prompt,
        assetUrl,
        aspectRatio,
        referenceUrl,
        referenceUrls: rawReferenceUrls,
        mode,
        originalAssetId,
      } = req.body;
      if (!assetUrl || !prompt) {
        return res.status(400).json({ error: "Missing asset or prompt" });
      }

      const referenceUrls = Array.from(
        new Set(
          [
            ...(Array.isArray(rawReferenceUrls) ? rawReferenceUrls : []),
            ...(typeof referenceUrl === "string" ? [referenceUrl] : []),
          ].filter(
            (url): url is string => typeof url === "string" && url.trim().length > 0,
          ),
        ),
      );

      if (referenceUrls.length > 5) {
        return res
          .status(400)
          .json({ error: "A maximum of 5 reference images is supported." });
      }

      const [settings, user] = await Promise.all([
        getTenantSettings(req.user!.id),
        airtableService.findUserById(req.user!.id),
      ]);

      const cost = getCost(user, { mediaType: "image", mode: mode || "pro" }, settings);
      chargedCost = cost;

      if (user!.creditsImageFX < cost) {
        return res.status(403).json({ error: "Insufficient Image FX credits" });
      }

      await airtableService.deductGranularCredits(req.user!.id, "creditsImageFX", cost);
      charged = true;

      const apiKeys = await getTenantApiKeys(req.user!.id);
      const newAsset = await contentEngine.editAsset(
        assetUrl,
        prompt,
        req.user!.id,
        aspectRatio || "16:9",
        referenceUrls,
        mode || "pro",
        originalAssetId,
        apiKeys,
      );

      res.json({ success: true, asset: newAsset });
    } catch (error: any) {
      if (charged && chargedCost > 0) {
        await airtableService.refundGranularCredits(
          req.user!.id,
          "creditsImageFX",
          chargedCost,
        );
      }
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/drift-video",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    let charged = false;
    let chargedCost = 0;
    try {
      const {
        assetUrl,
        prompt,
        horizontal,
        vertical,
        zoom,
        aspectRatio,
        duration,
        generateAudio,
        projectId,
      } = req.body;

      if (projectId) {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const [settings, user] = await Promise.all([
        getTenantSettings(req.user!.id),
        airtableService.findUserById(req.user!.id),
      ]);

      const cost = getCost(
        user,
        { mediaType: "video", mode: "drift-path" },
        settings,
      );
      chargedCost = cost;

      if (user!.creditsPicDrift < cost) {
        return res.status(403).json({ error: "Insufficient PicDrift credits" });
      }

      await airtableService.deductGranularCredits(req.user!.id, "creditsPicDrift", cost);
      charged = true;

      const apiKeys = await getTenantApiKeys(req.user!.id);
      const result = await contentEngine.processKlingDrift(
        req.user!.id,
        assetUrl,
        prompt,
        Number(horizontal),
        Number(vertical),
        Number(zoom),
        aspectRatio,
        duration || "5",
        generateAudio === "true" || generateAudio === true,
        projectId,
        "creditsPicDrift",
        cost,
        apiKeys,
      );
      res.json(result);
    } catch (error: any) {
      if (charged && chargedCost > 0) {
        await airtableService.refundGranularCredits(
          req.user!.id,
          "creditsPicDrift",
          chargedCost,
        );
      }
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/tools/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { statusUrl } = req.body;
      if (!statusUrl || typeof statusUrl !== "string" || !isSafeExternalUrl(statusUrl)) {
        return res.status(400).json({ error: "Invalid status URL" });
      }
      const statusHost = normalizeHostname(new URL(statusUrl).hostname);
      if (!statusHost.endsWith("fal.run")) {
        return res.status(403).json({ error: "Status URL host is not allowed" });
      }
      const apiKeys = await getTenantApiKeys(req.user!.id);
      const status = await contentEngine.checkToolStatus(statusUrl, apiKeys);
      res.json({ success: true, status });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/save-url",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { url, aspectRatio, type, projectId } = req.body;

      if (!url) return res.status(400).json({ error: "URL required" });
      if (typeof url !== "string" || !isSafeExternalUrl(url)) {
        return res.status(400).json({ error: "Invalid or unsafe URL" });
      }

      if (projectId) {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const asset = await airtableService.createAsset(
        req.user!.id,
        url,
        aspectRatio || "16:9",
        type || "IMAGE",
        undefined,
        projectId,
      );

      res.json({ success: true, asset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/enhance",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    let charged = false;
    let chargedCost = 0;
    try {
      const { assetUrl, originalAssetId } = req.body;

      const [settings, user] = await Promise.all([
        getTenantSettings(req.user!.id),
        airtableService.findUserById(req.user!.id),
      ]);

      const cost = getCost(user, { mediaType: "image", mode: "enhance" }, settings);
      chargedCost = cost;

      if (user!.creditsImageFX < cost) {
        return res.status(403).json({ error: "Insufficient Image FX credits" });
      }

      await airtableService.deductGranularCredits(req.user!.id, "creditsImageFX", cost);
      charged = true;

      const apiKeys = await getTenantApiKeys(req.user!.id);
      const asset = await contentEngine.enhanceAsset(
        req.user!.id,
        assetUrl,
        originalAssetId,
        apiKeys,
      );
      res.json({ success: true, asset });
    } catch (error: any) {
      if (charged && chargedCost > 0) {
        await airtableService.refundGranularCredits(
          req.user!.id,
          "creditsImageFX",
          chargedCost,
        );
      }
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/analyze-image",
  authenticateToken,
  upload.single("image"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image uploaded" });

      const { prompt } = req.body;
      const { GeminiService } = require("../services/gemini");

      const text = await GeminiService.analyzeImageText({
        prompt: prompt || "Describe this image in detail.",
        imageBuffer: req.file.buffer,
      });

      res.json({ success: true, result: text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/storyboard",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;

      if (projectId && projectId !== "default") {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const storyboard = await airtableService.getStoryboard(req.user!.id, projectId);
      res.json({ success: true, storyboard });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/storyboard",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { projectId, sequence } = req.body;

      if (projectId && projectId !== "default") {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      await airtableService.updateStoryboard(req.user!.id, sequence, projectId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/assets",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const assets = await airtableService.getUserAssets(req.user!.id, projectId);
      res.json({ success: true, assets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.delete(
  "/api/assets/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const asset = await airtableService.getAssetById(req.params.id);
      if (!asset || asset.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await airtableService.deleteAsset(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/assets/download-zip",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { assetUrls, filename } = req.body;

      if (!assetUrls || !Array.isArray(assetUrls) || assetUrls.length === 0) {
        return res.status(400).json({ error: "No asset URLs provided" });
      }
      if (assetUrls.length > 200) {
        return res.status(400).json({ error: "Too many asset URLs requested" });
      }

      const userAssets = await airtableService.getUserAssets(req.user!.id);
      const allowedUrls = new Set(
        userAssets.map((asset: any) => normalizeAssetUrl(asset.url)),
      );

      const requestedUrls = assetUrls.filter((url: any) => typeof url === "string");
      if (requestedUrls.length !== assetUrls.length) {
        return res.status(400).json({ error: "Invalid asset URL payload" });
      }
      const unsafeUrls = requestedUrls.filter((url: string) => !isSafeExternalUrl(url));
      if (unsafeUrls.length > 0) {
        return res.status(400).json({ error: "One or more asset URLs are unsafe" });
      }

      const unauthorizedUrls = requestedUrls.filter(
        (url: string) => !allowedUrls.has(normalizeAssetUrl(url)),
      );
      if (unauthorizedUrls.length > 0) {
        return res.status(403).json({ error: "One or more assets are not accessible" });
      }

      const zipFilename = filename || `visionlight-storyboard-${Date.now()}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      for (let i = 0; i < requestedUrls.length; i++) {
        try {
          const url = requestedUrls[i];
          const response = await axios({
            url,
            method: "GET",
            responseType: "stream",
            timeout: 10000,
          });
          const ext = url.split(".").pop()?.split("?")[0] || "jpg";
          archive.append(response.data, { name: `image-${i + 1}.${ext}` });
        } catch (e) {
          console.error(`Failed to add asset ${requestedUrls[i]} to zip:`, e);
        }
      }

      await archive.finalize();
    } catch (error: any) {
      console.error("ZIP Download Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate ZIP" });
      }
    }
  },
);

// ==================== CONTENT ROUTES (TIMELINE) ====================
router.get(
  "/api/posts",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const posts = await airtableService.getUserPosts(req.user!.id, projectId);
      res.json({ success: true, posts });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  },
);

router.put(
  "/api/posts/:postId/title",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;
      const { title } = req.body;
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await airtableService.updatePost(postId, { title });
      res.json({ success: true, message: "Title updated" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/posts/:postId/download",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;
      const post = await airtableService.getPostById(postId);

      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!post.mediaUrl) {
        return res.status(404).json({ error: "Media not available" });
      }

      let cleanTitle = `visionlight-${postId}`;
      if (post.title && post.title.trim().length > 0) {
        cleanTitle = post.title.replace(/[\\/:*?"<>|]/g, "_").trim();
      }

      let extension = "mp4";
      const type = post.mediaType ? post.mediaType.toUpperCase() : "VIDEO";
      if (type === "IMAGE") extension = "jpg";
      if (type === "CAROUSEL") extension = "jpg";

      const filename = `${cleanTitle}.${extension}`;

      let targetUrl = post.mediaUrl;
      try {
        const parsed = JSON.parse(post.mediaUrl);
        if (Array.isArray(parsed) && parsed.length > 0) targetUrl = parsed[0];
      } catch {}

      const response = await axios({
        url: targetUrl,
        method: "GET",
        responseType: "stream",
      });

      res.setHeader("Content-Type", response.headers["content-type"]);
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.data.pipe(res);
    } catch (error: any) {
      console.error("Download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download media" });
      }
    }
  },
);

router.delete(
  "/api/posts/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;
      const post = await airtableService.getPostById(postId);

      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await airtableService.deletePost(postId);
      res.json({ success: true, message: "Post deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ==================== GENERATION WORKFLOW (UNIFIED) ====================
router.post(
  "/api/generate-media",
  authenticateToken,
  upload.array("referenceImages", MAX_GENERATION_REFERENCE_IMAGES),
  async (req: AuthenticatedRequest, res) => {
    let charged = false;
    let chargedPool: CreditPool | null = null;
    let chargedCost = 0;
    let createdPostId: string | null = null;
    try {
      console.log("🎬 /api/generate-media hit");
      const {
        prompt,
        mediaType,
        duration,
        model,
        aspectRatio,
        resolution,
        size,
        width,
        height,
        title,
        generateAudio,
        negativePrompt,
        seed,
        autoFix,
        veoMode,
        videoGenerationMode,
        projectId,
      } = req.body;

      console.log("📦 Generation Request Body:", {
        mediaType,
        model,
        duration,
        aspectRatio,
      });

      if (projectId) {
        const project = await airtableService.getProjectById(projectId);
        if (!project || project.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      console.log("🔍 Fetching settings and user for:", req.user!.id);
      const [settings, user] = await Promise.all([
        getTenantSettings(req.user!.id),
        airtableService.findUserById(req.user!.id),
      ]);

      if (!user) {
        console.warn("User not found in DB");
        return res.status(404).json({ error: "User not found" });
      }

      const pool = getTargetPool(user, mediaType, model);
      const cost = getCost(
        user,
        {
          mediaType,
          duration: duration ? parseInt(duration) : undefined,
          model,
        },
        settings,
      );

      const userAny = user as any;
      if (userAny[pool] < cost) {
        return res.status(403).json({
          error: `Insufficient credits in your ${pool.replace("credits", "")} wallet. Required: ${cost}, Current: ${userAny[pool]}`,
        });
      }

      const referenceFiles = (req.files as Express.Multer.File[]) || [];
      const uploadedUrls: string[] = [];
      const uploadedImageUrls: string[] = [];
      const uploadedVideoUrls: string[] = [];
      const uploadedAudioUrls: string[] = [];
      if (referenceFiles.length > 0) {
        try {
          for (const file of referenceFiles) {
            const url = await uploadToCloudinary(file);
            uploadedUrls.push(url);
            if (file.mimetype.startsWith("image/")) uploadedImageUrls.push(url);
            else if (file.mimetype.startsWith("video/")) uploadedVideoUrls.push(url);
            else if (file.mimetype.startsWith("audio/")) uploadedAudioUrls.push(url);
          }
        } catch (err: any) {
          console.error("Upload Error in generate-media:", err);
          return res.status(500).json({ error: "Image upload failed: " + err.message });
        }
      }
      const primaryRefUrl =
        uploadedImageUrls[0] || uploadedVideoUrls[0] || uploadedUrls[0] || "";

      const generationParams = {
        mediaType,
        duration: duration ? parseInt(duration) : undefined,
        model,
        aspectRatio,
        generateAudio,
        negativePrompt,
        seed,
        autoFix,
        veoMode,
        videoGenerationMode,
        imageReference: primaryRefUrl,
        imageReferences: uploadedUrls,
        referenceImageUrls: uploadedImageUrls,
        referenceVideoUrls: uploadedVideoUrls,
        referenceAudioUrls: uploadedAudioUrls,
        hasReferenceImage: uploadedImageUrls.length > 0,
        timestamp: new Date().toISOString(),
        title: title || "",
        userId: req.user!.id,
        chargedPool: pool,
        cost,
      };

      chargedPool = pool;
      chargedCost = cost;
      await airtableService.deductGranularCredits(req.user!.id, pool, cost);
      charged = true;

      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        title: title || "",
        mediaType: (mediaType || "video").toUpperCase() as any,
        platform: "INSTAGRAM",
        projectId: projectId || undefined,
        generationParams,
        imageReference: primaryRefUrl,
        generationStep: "GENERATION",
        requiresApproval: false,
      });
      createdPostId = post.id;

      res.json({ success: true, postId: post.id });

      (async () => {
        try {
          if (mediaType === "carousel") {
            const apiKeys = await getTenantApiKeys(req.user!.id);
            await contentEngine.startCarouselGeneration(
              post.id,
              prompt,
              generationParams,
              apiKeys,
            );
          } else if (mediaType === "image") {
            const apiKeys = await getTenantApiKeys(req.user!.id);
            await contentEngine.startImageGeneration(
              post.id,
              prompt,
              generationParams,
              apiKeys,
            );
          } else {
            const apiKeys = await getTenantApiKeys(req.user!.id);
            contentEngine.startVideoGeneration(
              post.id,
              prompt,
              generationParams,
              apiKeys,
            );
          }
        } catch (err: any) {
          console.error("Background Error:", err);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: "Processing failed",
          });
          await airtableService.refundGranularCredits(req.user!.id, pool, cost);
        }
      })();
    } catch (error: any) {
      if (charged && chargedPool && chargedCost > 0 && !createdPostId) {
        await airtableService.refundGranularCredits(
          req.user!.id,
          chargedPool,
          chargedCost,
        );
      }
      console.error("API Error in /api/generate-media:", error);
      res.status(500).json({
        error: error.message || "Internal server error during generation request",
      });
    }
  },
);

router.get(
  "/api/post/:postId/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      let post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Denied" });
      }

      if (post.status === "PROCESSING") {
        const apiKeys = await getTenantApiKeys(req.user!.id);
        await contentEngine.checkPostStatus(post, apiKeys);
        post = await airtableService.getPostById(req.params.postId);
      }

      res.json({
        success: true,
        status: post?.status,
        progress: post?.progress || 0,
        mediaUrl: post?.mediaUrl,
        error: post?.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/jobs/check-active",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const allPosts = await airtableService.getUserPosts(req.user!.id);
      const activePosts = allPosts.filter((p: any) => p.status === "PROCESSING");

      if (activePosts.length === 0) {
        return res.json({ success: true, active: 0 });
      }

      const updates = activePosts.map(async (simplePost: any) => {
        const fullPost = await airtableService.getPostById(simplePost.id);
        if (fullPost && fullPost.status === "PROCESSING") {
          const apiKeys = await getTenantApiKeys(req.user!.id);
          await contentEngine.checkPostStatus(fullPost, apiKeys);
        }
      });

      await Promise.all(updates);
      res.json({ success: true, checked: activePosts.length });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  },
);

router.get(
  "/api/post/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Denied" });
      }
      res.json({ success: true, post });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
