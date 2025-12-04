import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { upload, uploadToCloudinary } from "./utils/fileUpload";

// Load environment variables FIRST
dotenv.config();

// Debug environment variables
console.log("🔧 Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "✅ Loaded" : "❌ Missing",
  airtableBase: process.env.AIRTABLE_BASE_ID ? "✅ Loaded" : "❌ Missing",
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing",
  openai: process.env.OPENAI_API_KEY ? "✅ Loaded" : "❌ Missing",
  google: process.env.GOOGLE_AI_API_KEY ? "✅ Loaded" : "❌ Missing",
  nodeEnv: process.env.NODE_ENV,
});

// Import Services
import { generateScript } from "./services/script";
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
  "https://*.ngrok.io",
  "https://*.ngrok-free.app",
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
        console.log("🔒 CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "Visionlight FX Backend - Running!",
    version: "3.0.0",
    features: ["Native Content Engine", "Sora/Gemini Integration"],
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

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const user = await AuthService.validateSession(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
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
    console.error("Auth error:", error);
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
      console.error("Fetch posts error:", error);
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

// --- FIX: DOWNLOAD PROXY WITH WORKING FILENAME ---
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

      // 1. Determine Extension
      let extension = "mp4";
      if (post.mediaType === "IMAGE") extension = "jpg";
      if (post.mediaType === "CAROUSEL") extension = "jpg";

      // 2. Sanitize Filename (Less Aggressive)
      // Start with default
      let filename = `visionlight-${postId}.${extension}`;

      if (post.title && post.title.trim().length > 0) {
        // Allow alphanumerics, spaces, dashes, underscores, parentheses, brackets
        const safeTitle = post.title
          .replace(/[^a-zA-Z0-9 \-_\(\)\[\]]/g, "")
          .trim();
        if (safeTitle.length > 0) {
          filename = `${safeTitle}.${extension}`;
        }
      }

      // 3. Stream with Headers
      const response = await axios({
        url: post.mediaUrl,
        method: "GET",
        responseType: "stream",
      });

      // Set Headers
      res.setHeader("Content-Type", response.headers["content-type"]);
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }

      // IMPORTANT: Use quotes around filename to support spaces!
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      // Pipe
      response.data.pipe(res);
    } catch (error: any) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Failed to download media" });
    }
  }
);

// --- SOCIAL PUBLISH (MOCK) ---
app.post(
  "/api/posts/publish",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId, platform } = req.body;
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Access denied" });

      // Mock Publishing Delay
      await new Promise((r) => setTimeout(r, 1500));

      await airtableService.updatePost(postId, { status: "PUBLISHED" });
      res.json({
        success: true,
        message: `Published to ${platform || "Social Media"}`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== WORKFLOW 1: START GENERATION ====================
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

      // Deduct credits immediately
      const updatedCredits = { ...user.demoCredits };
      updatedCredits[mediaType as keyof typeof user.demoCredits] -= 1;
      await airtableService.updateUserCredits(req.user!.id, updatedCredits);

      // Respond to UI immediately
      res.json({ success: true, postId: post.id });

      // --- ASYNC BACKGROUND PROCESSING ---
      (async () => {
        try {
          // Update status to Processing
          await airtableService.updatePost(post.id, {
            status: "PROCESSING",
            progress: 1,
          });

          // 1. Enhance Prompt (Returns raw for Image/Carousel, Enhanced for Video)
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

          // --- CRITICAL LOGIC SPLIT ---
          if (mediaType === "video") {
            // VIDEO: Pause for Approval
            await airtableService.updatePost(post.id, {
              enhancedPrompt,
              generationStep: "AWAITING_APPROVAL", // Triggers Modal
              progress: 2,
            });
            console.log(`⏸️ Post ${post.id} waiting for video approval.`);
          } else {
            // IMAGE / CAROUSEL: Skip Approval, Auto-Generate
            console.log(
              `⏩ Post ${post.id} auto-starting generation (Image/Carousel).`
            );

            await airtableService.updatePost(post.id, {
              enhancedPrompt, // This is just the raw prompt
              userEditedPrompt: enhancedPrompt, // Auto-confirm
              generationStep: "GENERATION",
              requiresApproval: false,
              progress: 5, // Started
            });

            // Start appropriate workflow
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

// ==================== WORKFLOW 2: APPROVE & GENERATE ====================
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

      const imageReference =
        post.imageReference || post.generationParams?.imageReference || "";
      const hasReferenceImage = !!(
        imageReference && imageReference.startsWith("http")
      );

      const params = {
        ...(post.generationParams || {}),
        userId: req.user!.id,
        imageReference,
        hasReferenceImage,
        title: post.title,
      };

      // TRIGGER ASYNC WORKFLOW 2

      // 5. ROUTING LOGIC: Video vs Image vs Carousel
      const mediaType = post.mediaType?.toLowerCase() || "video";

      if (mediaType === "video") {
        contentEngine.startVideoGeneration(postId, finalPrompt, params);
      } else if (mediaType === "carousel") {
        // NEW: Call Carousel Workflow
        contentEngine.startCarouselGeneration(postId, finalPrompt, params);
      } else {
        contentEngine.startImageGeneration(postId, finalPrompt, params);
      }

      res.json({ success: true, message: "Generation started", postId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Cancel
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

// Status check
app.get(
  "/api/post/:postId/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const post = await airtableService.getPostById(req.params.postId);
      if (!post || post.userId !== req.user!.id)
        return res.status(403).json({ error: "Denied" });
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

// Post Details
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
