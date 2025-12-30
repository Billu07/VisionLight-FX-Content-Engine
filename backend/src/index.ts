import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { calculateCost } from "./config/pricing";
import { upload, uploadToCloudinary } from "./utils/fileUpload";

dotenv.config();

console.log("🔧 Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "✅ Loaded" : "❌ Missing",
  airtableBase: process.env.AIRTABLE_BASE_ID ? "✅ Loaded" : "❌ Missing",
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing",
  openai: process.env.OPENAI_API_KEY ? "✅ Loaded" : "❌ Missing",
  google: process.env.GOOGLE_AI_API_KEY ? "✅ Loaded" : "❌ Missing",
  supabase: process.env.SUPABASE_URL ? "✅ Loaded" : "❌ Missing",
});

import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";
import { dbService as airtableService } from "./services/database";
import { contentEngine } from "./services/engine";

const app = express();
const PORT = process.env.PORT || 4000;

// === ADMIN CONFIGURATION ===
const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAILS || "snowfix07@gmail.com";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW.split(",").map((email) => email.trim());

const allowedOrigins = ["https://picdrift.studio", "http://localhost:5173"];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

app.use(
  cors({
    origin: true, // Allow any domain (safer for PWA/Mobile)
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
      console.error("Delete Error:", error);
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

// ✅ Move Post Media to Asset (Timeline -> Library)
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

// ✅ Sync Upload (Magic Edit & Direct Reference)
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
        // Raw Mode: No resizing
        asset = await contentEngine.uploadRawAsset(
          req.file.buffer,
          req.user!.id
        );
      } else {
        // Process Mode: Resize/Outpaint
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

// ✅ Batch Upload
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
        message: `Started processing ${files.length} images. They will appear in your library shortly.`,
      });

      // Background Processing
      (async () => {
        for (const file of files) {
          try {
            await contentEngine.processAndSaveAsset(
              file.buffer,
              req.user!.id,
              aspectRatio || "16:9"
            );
          } catch (e) {
            console.error("Failed to process one asset in batch", e);
          }
        }
      })();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ Edit Asset (Standard/Pro)
app.post(
  "/api/assets/edit",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { prompt, assetUrl, aspectRatio, referenceUrl, mode } = req.body;

      if (!assetUrl || !prompt) {
        return res.status(400).json({ error: "Missing asset or prompt" });
      }

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

// ✅ Start Drift Video Path (Kling)
app.post(
  "/api/assets/drift-video",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { assetUrl, prompt, horizontal, vertical, zoom, aspectRatio } =
        req.body;
      // We pass the user-selected aspect ratio if provided
      const result = await contentEngine.processKlingDrift(
        req.user!.id,
        assetUrl,
        prompt,
        Number(horizontal),
        Number(vertical),
        Number(zoom),
        aspectRatio // 👈 Correctly pass this
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ Check Tool Status (For Drift Polling)
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

// ✅ Save Extracted Frame / Video URL
app.post(
  "/api/assets/save-url",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { url, aspectRatio, type } = req.body;

      if (!url) return res.status(400).json({ error: "URL required" });

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

// ✅ Vision Analysis
app.post(
  "/api/analyze-image",
  authenticateToken,
  upload.single("image"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No image uploaded" });

      const { prompt } = req.body;
      const { GeminiService } = require("./services/gemini");

      const text = await GeminiService.analyzeImageText({
        prompt: prompt || "Describe this image in detail.",
        imageBuffer: req.file.buffer,
      });

      res.json({ success: true, result: text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ Get Assets
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

// ✅ Delete Asset
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

// ==================== CONTENT ROUTES (TIMELINE) ====================
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
      const { postId } = req.params;
      const { title } = req.body;
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Access denied" });

      await airtableService.updatePost(postId, { title });
      res.json({ success: true, message: "Title updated" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ FIXED: Dynamic Download Extension
app.get(
  "/api/posts/:postId/download",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;
      const post = await airtableService.getPostById(postId);

      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Access denied" });
      if (!post.mediaUrl)
        return res.status(404).json({ error: "Media not available" });

      let cleanTitle = `visionlight-${postId}`;
      if (post.title && post.title.trim().length > 0) {
        cleanTitle = post.title.replace(/[\\/:*?"<>|]/g, "_").trim();
      }

      // Check Media Type for extension
      let extension = "mp4";
      const type = post.mediaType ? post.mediaType.toUpperCase() : "VIDEO";

      if (type === "IMAGE") extension = "jpg";
      if (type === "CAROUSEL") extension = "jpg";

      const filename = `${cleanTitle}.${extension}`;

      // Handle Carousel Arrays
      let targetUrl = post.mediaUrl;
      try {
        const parsed = JSON.parse(post.mediaUrl);
        if (Array.isArray(parsed) && parsed.length > 0) targetUrl = parsed[0];
      } catch (e) {}

      const response = await axios({
        url: targetUrl,
        method: "GET",
        responseType: "stream",
      });

      res.setHeader("Content-Type", response.headers["content-type"]);
      if (response.headers["content-length"])
        res.setHeader("Content-Length", response.headers["content-length"]);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      response.data.pipe(res);
    } catch (error: any) {
      console.error("Download error:", error);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to download media" });
    }
  }
);

// ✅ Delete Post (Timeline)
app.delete(
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
  }
);

// ==================== GENERATION WORKFLOW (UNIFIED) ====================
app.post(
  "/api/generate-media",
  authenticateToken,
  upload.array("referenceImages", 5),
  async (req: AuthenticatedRequest, res) => {
    try {
      console.log("🎬 /api/generate-media hit");
      const {
        prompt,
        mediaType, // "video", "image", "carousel"
        duration,
        model,
        aspectRatio,
        resolution,
        size,
        width,
        height,
        title,
      } = req.body;

      const cost = calculateCost(
        mediaType,
        duration ? parseInt(duration) : undefined,
        model
      );

      const user = await airtableService.findUserById(req.user!.id);
      if (!user || user.creditBalance < cost) {
        return res.status(403).json({
          error: `Insufficient credits. Required: ${cost}, Balance: ${
            user?.creditBalance || 0
          }`,
        });
      }

      // Handle Uploads
      const referenceFiles = (req.files as Express.Multer.File[]) || [];
      const uploadedUrls: string[] = [];
      if (referenceFiles.length > 0) {
        try {
          for (const file of referenceFiles) {
            const url = await uploadToCloudinary(file);
            uploadedUrls.push(url);
          }
        } catch (err) {
          return res.status(500).json({ error: "Image upload failed" });
        }
      }
      const primaryRefUrl = uploadedUrls.length > 0 ? uploadedUrls[0] : "";

      const generationParams = {
        mediaType,
        duration: duration ? parseInt(duration) : undefined,
        model,
        aspectRatio,
        imageReference: primaryRefUrl,
        imageReferences: uploadedUrls,
        hasReferenceImage: uploadedUrls.length > 0,
        timestamp: new Date().toISOString(),
        title: title || "",
        userId: req.user!.id,
        cost: cost,
      };

      // 1. Deduct Credits
      await airtableService.deductCredits(req.user!.id, cost);

      // 2. CREATE POST FOR EVERYTHING
      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        title: title || "",
        mediaType: mediaType.toUpperCase() as any,
        platform: "INSTAGRAM",
        generationParams,
        imageReference: primaryRefUrl,
        generationStep: "GENERATION",
        requiresApproval: false,
      });

      // 3. RESPOND
      res.json({ success: true, postId: post.id });

      // 4. TRIGGER PROCESS
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
            contentEngine.startVideoGeneration(
              post.id,
              prompt,
              generationParams
            );
          }
        } catch (err: any) {
          console.error("Background Error:", err);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: "Processing failed",
          });
          await airtableService.refundUserCredit(req.user!.id, cost);
        }
      })();
    } catch (error: any) {
      console.error("API Error:", error);
      res.status(500).json({ error: error.message });
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
  }
);

// 2. JOB CHECK (Active Jobs List)
app.get(
  "/api/jobs/check-active",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const allPosts = await airtableService.getUserPosts(req.user!.id);
      const activePosts = allPosts.filter(
        (p: any) => p.status === "PROCESSING"
      );

      if (activePosts.length === 0) {
        return res.json({ success: true, active: 0 });
      }

      const updates = activePosts.map(async (simplePost: any) => {
        const fullPost = await airtableService.getPostById(simplePost.id);
        if (fullPost && fullPost.status === "PROCESSING") {
          await contentEngine.checkPostStatus(fullPost);
        }
      });

      await Promise.all(updates);
      res.json({ success: true, checked: activePosts.length });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  }
);

app.get(
  "/api/post/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Denied" });
      res.json({ success: true, post });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error:", error);
  res.status(500).json({ error: "Internal Server Error" });
});

if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

export default app;
