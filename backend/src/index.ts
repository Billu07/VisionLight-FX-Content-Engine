import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { calculateCost } from "./config/pricing";
import { upload, uploadToCloudinary } from "./utils/fileUpload";

dotenv.config();

// Log environment status
console.log("🔧 Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "✅ Loaded" : "❌ Missing",
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing",
  openai: process.env.OPENAI_API_KEY ? "✅ Loaded" : "❌ Missing",
});

import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";
import { dbService as airtableService } from "./services/database";
import { contentEngine } from "./services/contentEngine";

const app = express();
const PORT = process.env.PORT || 4000;

const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAILS || "snowfix07@gmail.com";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW.split(",").map((email) => email.trim());

// ✅ CRITICAL FIX: Allow all origins to prevent "Infinite Loading"
app.use(
  cors({
    origin: true, // Allow any domain to connect
    credentials: true,
    exposedHeaders: ["Content-Disposition", "Content-Length", "Content-Type"],
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Visionlight FX Backend - Stable",
    version: "4.5.0",
    status: "Healthy",
  });
});

// ==================== AUTHENTICATION MIDDLEWARE ====================
interface AuthenticatedRequest extends Request {
  user?: any;
  token?: string;
}

const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const user = await AuthService.validateSession(token);
    if (!user)
      return res.status(401).json({ error: "Invalid or expired token" });

    req.user = user;
    req.token = token;
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== ADMIN MIDDLEWARE ====================
const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.email || !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: "Access Denied: Admins only." });
  }
  next();
};

// ==================== NOTIFICATION ROUTES ====================
app.post(
  "/api/request-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.createCreditRequest(
        req.user.id,
        req.user.email,
        req.user.name
      );
      res.json({ success: true, message: "Request sent to admin." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/admin/requests",
  authenticateToken,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const requests = await airtableService.getPendingCreditRequests();
      res.json({ success: true, requests });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.put(
  "/api/admin/requests/:id/resolve",
  authenticateToken,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.resolveCreditRequest(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== ADMIN MANAGEMENT ROUTES ====================
app.post(
  "/api/admin/create-user",
  authenticateToken,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { email, password, name } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    try {
      const newUser = await AuthService.createSystemUser(
        email,
        password,
        name || "New User"
      );
      res.json({ success: true, user: newUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/admin/users",
  authenticateToken,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const users = await airtableService.getAllUsers();
      res.json({ success: true, users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.put(
  "/api/admin/users/:userId",
  authenticateToken,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { userId } = req.params;
    const { creditBalance, addCredits, creditSystem, name } = req.body;

    try {
      if (addCredits) {
        await airtableService.addCredits(userId, parseInt(addCredits));
      } else if (creditBalance !== undefined) {
        await airtableService.adminUpdateUser(userId, { creditBalance });
      }

      const otherUpdates: any = {};
      if (creditSystem) otherUpdates.creditSystem = creditSystem;
      if (name) otherUpdates.name = name;

      if (Object.keys(otherUpdates).length > 0) {
        await airtableService.adminUpdateUser(userId, otherUpdates);
      }

      res.json({ success: true, message: "User updated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  "/api/admin/users/:userId",
  authenticateToken,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { userId } = req.params;
    try {
      const userToDelete = await airtableService.findUserById(userId);
      if (!userToDelete)
        return res.status(404).json({ error: "User not found" });

      await AuthService.deleteSupabaseUserByEmail(userToDelete.email);
      await airtableService.deleteUser(userId);

      res.json({ success: true, message: "User deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== AUTH ROUTES ====================
app.get(
  "/api/auth/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    res.json({ success: true, user: req.user });
  }
);

// ==================== DATA ROUTES ====================
app.get(
  "/api/brand-config",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const config = await airtableService.getBrandConfig(req.user!.id);
      res.json({ success: true, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.put(
  "/api/brand-config",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    const { companyName, primaryColor, secondaryColor, logoUrl } = req.body;
    try {
      const config = await airtableService.upsertBrandConfig({
        userId: req.user!.id,
        companyName,
        primaryColor,
        secondaryColor,
        logoUrl,
      });
      res.json({ success: true, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/roi-metrics",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = await ROIService.getMetrics(req.user!.id);
      res.json({ success: true, metrics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/user-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await airtableService.findUserById(req.user!.id);
      if (!user) return res.json({ credits: 0 });
      res.json({ credits: user.creditBalance });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  }
);

app.post(
  "/api/reset-demo-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.adminUpdateUser(req.user!.id, {
        creditBalance: 20,
      });
      res.json({ success: true, message: "Demo credits reset to 20" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== ASSET MANAGEMENT ====================
app.post(
  "/api/posts/:postId/to-asset",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await contentEngine.copyPostMediaToAsset(req.params.postId, req.user!.id);
      res.json({ success: true, message: "Saved to Asset Library" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/assets/upload-sync",
  authenticateToken,
  upload.single("image"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No image provided" });

      const { aspectRatio, raw } = req.body;
      let asset;

      if (raw === "true") {
        asset = await contentEngine.uploadRawAsset(
          req.file.buffer,
          req.user!.id
        );
      } else {
        asset = await contentEngine.processAndSaveAsset(
          req.file.buffer,
          req.user!.id,
          aspectRatio || "16:9"
        );
      }
      res.json({ success: true, asset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/assets/batch",
  authenticateToken,
  upload.array("images", 20),
  async (req: AuthenticatedRequest, res) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      const { aspectRatio } = req.body;

      if (files.length === 0)
        return res.status(400).json({ error: "No images provided" });

      res.json({
        success: true,
        message: `Started processing ${files.length} images.`,
      });

      (async () => {
        for (const file of files) {
          try {
            await contentEngine.processAndSaveAsset(
              file.buffer,
              req.user!.id,
              aspectRatio || "16:9"
            );
          } catch (e) {
            console.error("Batch processing error", e);
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/assets/edit",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { prompt, assetUrl, aspectRatio, referenceUrl, mode } = req.body;
      const newAsset = await contentEngine.editAsset(
        assetUrl,
        prompt,
        req.user!.id,
        aspectRatio || "16:9",
        referenceUrl,
        mode || "pro"
      );
      res.json({ success: true, asset: newAsset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ DRIFT VIDEO (Fixed Aspect Ratio handling)
app.post(
  "/api/assets/drift-video",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { assetUrl, prompt, horizontal, vertical, zoom, aspectRatio } =
        req.body;
      const userId = req.user!.id;
      const cost = 5;

      const user = await airtableService.findUserById(userId);
      if (!user || user.creditBalance < cost) {
        return res.status(403).json({ error: "Insufficient credits" });
      }

      const cleanPrompt = prompt || `Drift H${horizontal} V${vertical}`;
      const generationParams = {
        horizontal,
        vertical,
        zoom,
        assetUrl,
        aspectRatio: aspectRatio || "16:9",
        source: "DRIFT_EDITOR",
        cost,
      };

      await airtableService.deductCredits(userId, cost);

      const post = await airtableService.createPost({
        userId,
        title: "Drift Generation",
        prompt: cleanPrompt,
        mediaType: "VIDEO",
        mediaProvider: "kling",
        platform: "Internal",
        status: "PROCESSING",
        generationParams,
        generationStep: "GENERATION",
        requiresApproval: false,
        imageReference: assetUrl,
      });

      // Background process
      (async () => {
        try {
          const result = await contentEngine.processKlingDrift(
            userId,
            assetUrl,
            prompt,
            Number(horizontal),
            Number(vertical),
            Number(zoom),
            aspectRatio
          );

          await airtableService.updatePost(post.id, {
            generationParams: {
              ...generationParams,
              externalId: result.requestId,
              statusUrl: result.statusUrl,
            },
          });
        } catch (e: any) {
          console.error("Drift Failed:", e);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: e.message,
          });
          await airtableService.refundUserCredit(userId, cost);
        }
      })();

      res.json({ success: true, postId: post.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/tools/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { statusUrl } = req.body;
      const status = await contentEngine.checkToolStatus(statusUrl);
      res.json({ success: true, status });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/assets/save-url",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { url, aspectRatio, type } = req.body;
      const asset = await airtableService.createAsset(
        req.user!.id,
        url,
        aspectRatio || "16:9",
        type || "IMAGE"
      );
      res.json({ success: true, asset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/analyze-image",
  authenticateToken,
  upload.single("image"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image" });
      const { prompt } = req.body;
      const { GeminiService } = require("./services/gemini");
      const text = await GeminiService.analyzeImageText({
        prompt: prompt || "Describe this image.",
        imageBuffer: req.file.buffer,
      });
      res.json({ success: true, result: text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ NEW: Enhance Asset
app.post(
  "/api/assets/enhance",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { assetUrl } = req.body;
      const asset = await contentEngine.enhanceAsset(req.user!.id, assetUrl);
      res.json({ success: true, asset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/assets",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const assets = await airtableService.getUserAssets(req.user!.id);
      res.json({ success: true, assets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  "/api/assets/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.deleteAsset(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/posts",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const posts = await airtableService.getUserPosts(req.user!.id);
      res.json({ success: true, posts });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  }
);

app.put(
  "/api/posts/:postId/title",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.updatePost(req.params.postId, {
        title: req.body.title,
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  "/api/posts/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.deletePost(req.params.postId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/posts/:postId/download",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      if (!post || !post.mediaUrl)
        return res.status(404).json({ error: "No media" });

      let targetUrl = post.mediaUrl;
      try {
        const parsed = JSON.parse(post.mediaUrl);
        if (Array.isArray(parsed)) targetUrl = parsed[0];
      } catch (e) {}

      const response = await axios({
        url: targetUrl,
        method: "GET",
        responseType: "stream",
      });
      res.setHeader("Content-Type", response.headers["content-type"]);
      response.data.pipe(res);
    } catch (error: any) {
      res.status(500).json({ error: "Download failed" });
    }
  }
);

// === GENERATION ===
app.post(
  "/api/generate-media",
  authenticateToken,
  upload.array("referenceImages", 5),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { prompt, mediaType, duration, model, aspectRatio, title } =
        req.body;
      const cost = calculateCost(mediaType, duration, model);
      const user = await airtableService.findUserById(req.user!.id);

      if (!user || user.creditBalance < cost) {
        return res.status(403).json({ error: "Insufficient credits" });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      const uploadedUrls = [];
      for (const f of files) uploadedUrls.push(await uploadToCloudinary(f));

      const generationParams = {
        mediaType,
        duration,
        model,
        aspectRatio,
        imageReferences: uploadedUrls,
        imageReference: uploadedUrls[0] || "",
        cost,
      };

      await airtableService.deductCredits(req.user!.id, cost);

      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        title,
        mediaType: mediaType.toUpperCase(),
        platform: "INSTAGRAM",
        generationParams,
        generationStep: "GENERATION",
      });

      res.json({ success: true, postId: post.id });

      // Trigger Logic
      (async () => {
        try {
          if (mediaType === "carousel") {
            await contentEngine.startCarouselGeneration(
              post.id,
              prompt,
              generationParams
            );
          } else if (mediaType === "image") {
            await contentEngine.startImageGeneration(
              post.id,
              prompt,
              generationParams
            );
          } else {
            await contentEngine.startVideoGeneration(
              post.id,
              prompt,
              generationParams
            );
          }
        } catch (err: any) {
          console.error("Gen failed:", err);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: err.message,
          });
          await airtableService.refundUserCredit(req.user!.id, cost);
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/jobs/check-active",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const posts = await airtableService.getUserPosts(req.user!.id);
      const active = posts.filter((p: any) => p.status === "PROCESSING");

      const updates = active.map((p: any) => contentEngine.checkPostStatus(p));
      await Promise.all(updates);

      res.json({ success: true, checked: active.length });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  }
);

// ✅ POST STATUS (Active Polling)
app.get(
  "/api/post/:postId/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      let post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Denied" });

      if (post.status === "PROCESSING") {
        await contentEngine.checkPostStatus(post);
        post = await airtableService.getPostById(req.params.postId);
        if (!post) return res.status(404).json({ error: "Post lost" });
      }

      res.json({
        success: true,
        status: post.status,
        progress: post.progress || 0,
        mediaUrl: post.mediaUrl,
        error: post.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/post/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      res.json({ success: true, post });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.use((req, res) => res.status(404).json({ error: "Not Found" }));

if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

export default app;
