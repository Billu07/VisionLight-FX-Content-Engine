// backend/src/index.ts
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
import { generateScript } from "./services/script"; // (Kept if you still use text scripts)
import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";
import { airtableService } from "./services/airtable";
import { contentEngine } from "./services/contentEngine"; // <--- THE NEW ENGINE

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
    version: "3.0.0 (Native Workflow Edition)",
    database: "Airtable",
    features: [
      "Cloudinary",
      "Native Content Engine",
      "Sora/Gemini Integration",
    ],
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

// ==================== AUTHENTICATION ROUTES ====================

// Demo Signup/Login
app.post("/api/auth/demo-login", async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await AuthService.findOrCreateUser(email, name);
    const session = await AuthService.createSession(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token: session.token,
    });
  } catch (error: any) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Logout
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

// Validate session
app.get(
  "/api/auth/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await airtableService.findUserByEmail(req.user!.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== PROTECTED ROUTES ====================

// Get brand config
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

// Update brand config
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

// Get ROI Metrics
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

// ==================== POST & MEDIA GENERATION ROUTES ====================

// Get user posts
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

// Update post title
app.put(
  "/api/posts/:postId/title",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;
      const { title } = req.body;

      const post = await airtableService.getPostById(postId);

      // Verify user owns this post
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await airtableService.updatePost(postId, { title });

      res.json({ success: true, message: "Title updated" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Helper for content types
const getContentType = (mediaType: string) => {
  switch (mediaType) {
    case "VIDEO":
      return "video/mp4";
    case "IMAGE":
      return "image/jpeg";
    case "CAROUSEL":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
};

// Download with custom filename
app.get(
  "/api/posts/:postId/download",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;
      const post = await airtableService.getPostById(postId);

      // Verify user owns this post
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!post.mediaUrl) {
        return res.status(404).json({ error: "Media not available" });
      }

      // Determine Extension
      let extension = "mp4";
      if (post.mediaType === "IMAGE") extension = "jpg";
      if (post.mediaType === "CAROUSEL") extension = "jpg";

      // Sanitize Filename: Allow alphanumeric, spaces, dashes, underscores.
      // E.g. "My Cool Video!" -> "My Cool Video.mp4"
      let cleanTitle = "visionlight-" + postId;

      if (post.title) {
        // Replace non-safe characters with nothing, keep spaces/dashes
        cleanTitle = post.title.replace(/[^a-zA-Z0-9 \-_]/g, "").trim();
        // Fallback if the title becomes empty after sanitization
        if (cleanTitle.length === 0) cleanTitle = "visionlight-" + postId;
      }

      const filename = `${cleanTitle}.${extension}`;

      // Fetch the file from Cloudinary as a stream
      const response = await axios({
        url: post.mediaUrl,
        method: "GET",
        responseType: "stream",
      });

      // Set headers for browser download
      res.setHeader("Content-Type", response.headers["content-type"]);
      res.setHeader("Content-Length", response.headers["content-length"]);
      // Quotes around filename handle spaces correctly
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      // Pipe stream to response
      response.data.pipe(res);
    } catch (error: any) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Failed to download media" });
    }
  }
);

// ==================== WORKFLOW 1 REPLACEMENT: PROMPT ENHANCEMENT ====================
// This endpoint starts the prompt enhancement process (replaces n8n Workflow 1)
app.post(
  "/api/generate-media",
  authenticateToken,
  upload.single("referenceImage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      console.log("🎬 Native /api/generate-media endpoint hit!");

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

      if (!prompt || !mediaType) {
        return res
          .status(400)
          .json({ error: "Prompt and mediaType are required" });
      }

      // 1. Check user credits
      const user = await airtableService.findUserByEmail(req.user!.email);
      if (
        !user ||
        user.demoCredits[mediaType as keyof typeof user.demoCredits] <= 0
      ) {
        return res
          .status(403)
          .json({ error: "No credits available for this media type" });
      }

      // 2. Upload reference image to Cloudinary if provided (Persistence)
      let imageReferenceUrl: string | undefined;
      if (referenceImageFile) {
        try {
          imageReferenceUrl = await uploadToCloudinary(referenceImageFile);
          console.log(
            "📸 Reference image uploaded to Cloudinary:",
            imageReferenceUrl
          );
        } catch (uploadError) {
          console.error("❌ Failed to upload reference image:", uploadError);
          return res.status(500).json({
            success: false,
            error: "Failed to upload reference image",
          });
        }
      }

      // 3. Capture generation parameters
      const generationParams = {
        mediaType,
        duration: duration ? parseInt(duration) : undefined,
        model,
        aspectRatio,
        size,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        imageReference: imageReferenceUrl, // Store Cloudinary URL
        hasReferenceImage: !!referenceImageFile,
        timestamp: new Date().toISOString(),
      };

      // 4. Create post in Airtable
      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        title: title || "",
        mediaType: mediaType.toUpperCase() as any,
        platform: "INSTAGRAM",
        generationParams: generationParams,
        imageReference: imageReferenceUrl,
        generationStep: "PROMPT_ENHANCEMENT",
        requiresApproval: true,
      });

      // 5. Update post with initial progress
      await airtableService.updatePost(post.id, {
        status: "PROCESSING", // Changed from NEW to PROCESSING immediately
        progress: 1,
      });

      // 6. Deduct credit immediately
      const updatedCredits = { ...user.demoCredits };
      updatedCredits[mediaType as keyof typeof user.demoCredits] -= 1;
      await airtableService.updateUserCredits(req.user!.id, updatedCredits);

      // 7. TRIGGER NATIVE WORKFLOW 1 (Async/Background)
      // Logic: Enhance prompt using GPT-4o / GPT-4o-mini logic defined in contentEngine
      console.log(
        `🚀 Starting background prompt enhancement for Post: ${post.id}`
      );

      (async () => {
        try {
          // Replicate "Workflow 1" Logic
          const enhancedPrompt = await contentEngine.enhanceUserPrompt(
            prompt,
            mediaType,
            duration ? parseInt(duration) : 8, // Default 8s
            referenceImageFile?.buffer, // Pass Buffer directly for analysis (faster than downloading URL)
            referenceImageFile?.mimetype
          );

          console.log(`✨ Prompt enhanced successfully for ${post.id}`);

          // Update Airtable to trigger the "Approval Modal" on frontend
          await airtableService.updatePost(post.id, {
            enhancedPrompt: enhancedPrompt,
            generationStep: "AWAITING_APPROVAL",
            progress: 2, // 2% means enhancement done, waiting for user
          });
        } catch (err: any) {
          console.error("❌ Enhancement Workflow Failed:", err);
          await airtableService.updatePost(post.id, {
            status: "FAILED",
            progress: 0,
            error: err.message || "Prompt enhancement failed",
          });
        }
      })();

      // Return immediate response to UI
      return res.json({
        success: true,
        postId: post.id,
        message: "Media generation queued successfully",
      });
    } catch (error: any) {
      console.error("💥 Media generation error:", error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// Get user credits
app.get(
  "/api/user-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await airtableService.findUserByEmail(req.user!.email);

      if (!user) {
        return res.json({ credits: { video: 0, image: 0, carousel: 0 } });
      }

      res.json({ credits: user.demoCredits });
    } catch (error: any) {
      console.error("Credits fetch error:", error);
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  }
);

// Reset demo credits
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

// ==================== WORKFLOW 2 REPLACEMENT: APPROVE PROMPT ====================
app.post(
  "/api/approve-prompt",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      // 1. Receive data (Note: finalPrompt comes from UI, user could have chosen Original or Enhanced)
      const { postId, finalPrompt } = req.body;

      if (!postId || !finalPrompt) {
        return res
          .status(400)
          .json({ error: "Post ID and final prompt are required" });
      }

      console.log("✅ User approved prompt for post:", postId);

      // 2. Verify Ownership
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // 3. Update Status to 'PROCESSING'
      await airtableService.updatePost(postId, {
        userEditedPrompt: finalPrompt, // Save the choice
        generationStep: "GENERATION",
        requiresApproval: false,
        status: "PROCESSING",
        progress: 5,
      });

      // 4. Prepare Logic Params
      const imageReference =
        post.imageReference || post.generationParams?.imageReference || "";
      const hasReferenceImage = !!(
        imageReference && imageReference.startsWith("http")
      );

      const params = {
        ...(post.generationParams || {}),
        userId: req.user!.id,
        imageReference: imageReference,
        hasReferenceImage: hasReferenceImage,
        title: post.title, // Pass title for metadata
      };

      // 5. ROUTING LOGIC: Video vs Image
      const mediaType = post.mediaType?.toLowerCase() || "video";

      if (mediaType === "video") {
        // -> Workflow 2a: Video
        contentEngine.startVideoGeneration(postId, finalPrompt, params);

        res.json({
          success: true,
          message: "Video generation started...",
          postId: postId,
        });
      } else {
        // -> Workflow 2b: Image (Gemini 2.5)
        contentEngine.startImageGeneration(postId, finalPrompt, params);

        res.json({
          success: true,
          message: "Image generation started...",
          postId: postId,
        });
      }
    } catch (error: any) {
      console.error("Error approving prompt:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get post details for prompt editing
app.get(
  "/api/post/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;

      const post = await airtableService.getPostById(postId);

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Verify user owns this post
      if (post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json({
        success: true,
        post: {
          id: post.id,
          prompt: post.prompt,
          enhancedPrompt: post.enhancedPrompt,
          imageReference: post.imageReference,
          userEditedPrompt: post.userEditedPrompt,
          generationStep: post.generationStep,
          requiresApproval: post.requiresApproval,
          mediaType: post.mediaType,
          status: post.status,
          progress: post.progress,
          generationParams: post.generationParams,
          createdAt: post.createdAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Cancel prompt approval and mark as failed
app.post(
  "/api/cancel-prompt",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.body;

      if (!postId) {
        return res.status(400).json({ error: "Post ID is required" });
      }

      console.log("❌ User cancelled prompt for post:", postId);

      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await airtableService.updatePost(postId, {
        status: "CANCELLED",
        generationStep: "COMPLETED",
        requiresApproval: false,
        progress: 0,
      });

      res.json({
        success: true,
        message: "Prompt approval cancelled",
      });
    } catch (error: any) {
      console.error("Error cancelling prompt:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Post Status Verification
app.get(
  "/api/post/:postId/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;

      const post = await airtableService.getPostById(postId);

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Verify user owns this post
      if (post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json({
        success: true,
        status: post.status,
        progress: post.progress || 0,
        generationStep: post.generationStep,
        mediaUrl: post.mediaUrl,
        requiresApproval: post.requiresApproval,
        lastUpdated: post.updatedAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Global error handler
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error Handler:", error);
  res.status(error.status || 500).json({
    success: false,
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Internal Server Error",
  });
});

// For Vercel deployment
const vercelHandler = app;

// Only listen on PORT if we're not in a serverless environment
if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🚀 Visionlight FX Backend running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📊 Database: Airtable`);
    console.log(`☁️  File Storage: Cloudinary`);
    console.log(`🧠 AI Engine: Native (OpenAI + Gemini)`);
  });
}

export default vercelHandler;
