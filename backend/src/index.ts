import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import archiver from "archiver";
import { upload, uploadToCloudinary } from "./utils/fileUpload";

// Load environment variables FIRST
dotenv.config();

console.log("🔧 Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "✅ Loaded" : "❌ Missing",
  airtableBase: process.env.AIRTABLE_BASE_ID ? "✅ Loaded" : "❌ Missing",
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing",
  openai: process.env.OPENAI_API_KEY ? "✅ Loaded" : "❌ Missing",
  google: process.env.GOOGLE_AI_API_KEY ? "✅ Loaded" : "❌ Missing",
  nodeEnv: process.env.NODE_ENV,
});

import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";
import { airtableService } from "./services/airtable";
import { contentEngine } from "./services/contentEngine";

const app = express();
const PORT = process.env.PORT || 4000;

// Enhanced CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://visionlight-frontend.vercel.app",
  "https://*.vercel.app",
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    // --- CRITICAL FIX: Allow frontend to read the filename header ---
    exposedHeaders: ["Content-Disposition", "Content-Length", "Content-Type"],
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "Visionlight FX Backend - Running!",
    version: "3.1.0",
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

// ==================== AUTH ROUTES ====================
app.post("/api/auth/demo-login", async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  try {
    const user = await AuthService.findOrCreateUser(email, name);
    const session = await AuthService.createSession(user.id);
    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
      token: session.token,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Authentication failed" });
  }
});

app.post(
  "/api/auth/logout",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await AuthService.deleteSession(req.token!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/auth/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await airtableService.findUserByEmail(req.user!.email);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
      const user = await airtableService.findUserByEmail(req.user!.email);
      if (!user)
        return res.json({ credits: { video: 0, image: 0, carousel: 0 } });
      res.json({ credits: user.demoCredits });
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
      await airtableService.updateUserCredits(req.user!.id, {
        video: 2,
        image: 2,
        carousel: 2,
      });
      res.json({ success: true, message: "Demo credits reset" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== CONTENT ROUTES ====================
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

//DOWNLOAD PROXY ---
app.get(
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

      // 1. Sanitize Filename
      let cleanTitle = `visionlight-${postId}`;
      if (post.title && post.title.trim().length > 0) {
        // Replace illegal chars with underscore, keep spaces
        cleanTitle = post.title.replace(/[\\/:*?"<>|]/g, "_").trim();
      }

      // 2. Check if it's a Carousel (JSON Array)
      let isCarousel = false;
      let imageUrls: string[] = [];

      if (post.mediaUrl.trim().startsWith("[")) {
        try {
          imageUrls = JSON.parse(post.mediaUrl);
          if (Array.isArray(imageUrls)) isCarousel = true;
        } catch (e) {}
      }

      // 3a. HANDLE CAROUSEL (ZIP DOWNLOAD)
      if (isCarousel) {
        const filename = `${cleanTitle}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );

        const archive = archiver("zip", { zlib: { level: 9 } });

        archive.on("error", (err) => {
          throw err;
        });
        archive.pipe(res);

        // Loop through URLs, fetch stream, add to zip
        for (let i = 0; i < imageUrls.length; i++) {
          const url = imageUrls[i];
          const response = await axios({
            url,
            method: "GET",
            responseType: "stream",
          });
          archive.append(response.data, {
            name: `${cleanTitle}_slide_${i + 1}.jpg`,
          });
        }

        await archive.finalize();
        return;
      }

      // 3b. HANDLE SINGLE VIDEO/IMAGE
      let extension = post.mediaType === "VIDEO" ? "mp4" : "jpg";
      const filename = `${cleanTitle}.${extension}`;

      const response = await axios({
        url: post.mediaUrl,
        method: "GET",
        responseType: "stream",
      });

      res.setHeader("Content-Type", response.headers["content-type"]);
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      response.data.pipe(res);
    } catch (error: any) {
      console.error("Download error:", error);
      // Only send JSON if headers haven't been sent (streaming hasn't started)
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download media" });
      }
    }
  }
);

// ==================== GENERATION WORKFLOW ====================

app.post(
  "/api/generate-media",
  authenticateToken,
  upload.single("referenceImage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      console.log("🎬 /api/generate-media hit");
      const {
        prompt,
        mediaType,
        duration,
        model,
        aspectRatio,
        size,
        width,
        height,
        title,
      } = req.body;
      const referenceImageFile = req.file;

      if (!prompt || !mediaType)
        return res.status(400).json({ error: "Missing required fields" });

      const user = await airtableService.findUserByEmail(req.user!.email);
      if (
        !user ||
        user.demoCredits[mediaType as keyof typeof user.demoCredits] <= 0
      ) {
        return res.status(403).json({ error: "Insufficient credits" });
      }

      let imageReferenceUrl: string | undefined;
      if (referenceImageFile) {
        try {
          imageReferenceUrl = await uploadToCloudinary(referenceImageFile);
        } catch (err) {
          return res
            .status(500)
            .json({ success: false, error: "Image upload failed" });
        }
      }

      const generationParams = {
        mediaType,
        duration: duration ? parseInt(duration) : undefined,
        model,
        aspectRatio,
        size,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        imageReference: imageReferenceUrl,
        hasReferenceImage: !!referenceImageFile,
        timestamp: new Date().toISOString(),
        title: title || "",
        userId: req.user!.id,
      };

      // 1. Create Initial Post
      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        title: title || "",
        mediaType: mediaType.toUpperCase() as any,
        platform: "INSTAGRAM",
        generationParams,
        imageReference: imageReferenceUrl,
        generationStep: "PROMPT_ENHANCEMENT",
        requiresApproval: true,
      });

      // Deduct credits
      const updatedCredits = { ...user.demoCredits };
      updatedCredits[mediaType as keyof typeof user.demoCredits] -= 1;
      await airtableService.updateUserCredits(req.user!.id, updatedCredits);

      res.json({ success: true, postId: post.id });

      // --- BACKGROUND PROCESS ---
      (async () => {
        try {
          await airtableService.updatePost(post.id, {
            status: "PROCESSING",
            progress: 1,
          });

          // 1. Enhance Prompt
          const enhancedPrompt = await contentEngine.enhanceUserPrompt(
            prompt,
            mediaType,
            {
              duration: duration ? parseInt(duration) : 8,
              aspectRatio: aspectRatio || "16:9",
              size: size || "1280x720",
            },
            referenceImageFile?.buffer,
            referenceImageFile?.mimetype
          );

          // 2. DECISION LOGIC: Do we stop for approval?
          // Video ALWAYS needs approval (Director mode).
          // Image/Carousel ONLY needs approval if there is a reference image (Style mixing is unpredictable).
          const isVideo = mediaType === "video";
          const hasRefImage = !!referenceImageFile;

          const shouldPauseForApproval = isVideo || hasRefImage;

          if (shouldPauseForApproval) {
            // --> STOP & WAIT (Updates status to AWAITING_APPROVAL, Frontend shows Modal)
            console.log(`⏸️ Post ${post.id} paused for approval.`);
            await airtableService.updatePost(post.id, {
              enhancedPrompt,
              generationStep: "AWAITING_APPROVAL",
              progress: 2,
            });
          } else {
            // --> AUTO-START (Skip Modal)
            console.log(`⏩ Post ${post.id} auto-starting (Text-Only).`);

            await airtableService.updatePost(post.id, {
              enhancedPrompt, // Use enhanced as final (or raw if enhancement skipped)
              userEditedPrompt: enhancedPrompt,
              generationStep: "GENERATION",
              requiresApproval: false,
              progress: 5, // 5% = Started
            });

            // Trigger Generation immediately
            if (mediaType === "carousel") {
              contentEngine.startCarouselGeneration(
                post.id,
                enhancedPrompt,
                generationParams
              );
            } else {
              contentEngine.startImageGeneration(
                post.id,
                enhancedPrompt,
                generationParams
              );
            }
          }
        } catch (err: any) {
          console.error("Background Workflow Error:", err);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: err.message || "Generation failed",
          });
        }
      })();
    } catch (error: any) {
      console.error("API Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/approve-prompt",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId, finalPrompt } = req.body;
      if (!postId || !finalPrompt)
        return res.status(400).json({ error: "Missing fields" });

      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Access denied" });

      await airtableService.updatePost(postId, {
        userEditedPrompt: finalPrompt,
        generationStep: "GENERATION",
        requiresApproval: false,
        status: "PROCESSING",
        progress: 5,
      });

      const params = {
        ...(post.generationParams || {}),
        userId: req.user!.id,
        imageReference:
          post.imageReference || post.generationParams?.imageReference || "",
        hasReferenceImage: !!(
          post.imageReference || post.generationParams?.imageReference
        ),
        title: post.title,
      };

      const mediaType = post.mediaType?.toLowerCase() || "video";
      if (mediaType === "video")
        contentEngine.startVideoGeneration(postId, finalPrompt, params);
      else if (mediaType === "carousel")
        contentEngine.startCarouselGeneration(postId, finalPrompt, params);
      else contentEngine.startImageGeneration(postId, finalPrompt, params);

      res.json({ success: true, message: "Generation started", postId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/cancel-prompt",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.body;
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Access denied" });

      await airtableService.updatePost(postId, {
        status: "CANCELLED",
        generationStep: "COMPLETED",
        requiresApproval: false,
        progress: 0,
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// --- FIX: SELF-HEALING STATUS CHECK ---
// If frontend polls this and status is stuck, we can implement logic here to double-check external providers in V2.
// For now, we verify the DB state.
app.get(
  "/api/post/:postId/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Denied" });

      // CLEANUP: If it's been processing for > 1 hour, mark failed.
      if (post.status === "PROCESSING") {
        const createdAt = new Date(post.createdAt).getTime();
        const now = new Date().getTime();
        const diffMins = (now - createdAt) / 60000;
        if (diffMins > 60) {
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            error: "Timeout (Server restart)",
          });
          post.status = "FAILED"; // return updated status
        }
      }

      res.json({
        success: true,
        status: post.status,
        progress: post.progress || 0,
        generationStep: post.generationStep,
        mediaUrl: post.mediaUrl,
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
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Denied" });
      res.json({ success: true, post });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Error handling
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error:", error);
  res.status(500).json({ error: "Internal Server Error" });
});

if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

export default app;
