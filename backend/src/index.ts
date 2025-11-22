import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables FIRST
dotenv.config();

// Debug environment variables
console.log("🔧 Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "✅ Loaded" : "❌ Missing",
  airtableBase: process.env.AIRTABLE_BASE_ID ? "✅ Loaded" : "❌ Missing",
  nodeEnv: process.env.NODE_ENV,
});

// Now import other modules
import { generateScript } from "./services/script";
import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";
import { airtableService } from "./services/airtable";

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage() });

// Enhanced CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://visionlight-fx.vercel.app",
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
    version: "2.0.0",
    database: "Airtable",
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

// Create Post
app.post(
  "/api/posts",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    const {
      prompt,
      mediaType = "IMAGE",
      platform = "INSTAGRAM",
      script,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    try {
      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        mediaType: mediaType.toUpperCase() as any,
        platform,
        script,
      });

      await ROIService.incrementPostsCreated(req.user!.id);

      res.json({ success: true, post });
    } catch (error: any) {
      console.error("Create post error:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  }
);

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

// Generate Script
app.post(
  "/api/generate-script",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    const { prompt, mediaType } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (!["video", "image", "carousel"].includes(mediaType)) {
      return res.status(400).json({ error: "Valid mediaType is required" });
    }

    try {
      const script = await generateScript({
        prompt: prompt.trim(),
        mediaType,
      });

      res.json({ success: true, script });
    } catch (error: any) {
      console.error("Script generation error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Direct Media Generation (async fire-and-forget to n8n)
app.post(
  "/api/generate-media",
  authenticateToken,
  upload.single("referenceImage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { prompt, mediaType, duration } = req.body;
      const referenceImageFile = req.file;

      if (!prompt || !mediaType) {
        return res
          .status(400)
          .json({ error: "Prompt and mediaType are required" });
      }

      // Check user credits
      const user = await airtableService.findUserByEmail(req.user!.email);
      if (
        !user ||
        user.demoCredits[mediaType as keyof typeof user.demoCredits] <= 0
      ) {
        return res
          .status(403)
          .json({ error: "No credits available for this media type" });
      }

      // Create post with PROCESSING status immediately
      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        mediaType: mediaType.toUpperCase() as any,
        platform: "INSTAGRAM",
      });

      // Update post status to PROCESSING
      await airtableService.updatePost(post.id, {
        status: "PROCESSING",
      });

      // Deduct credit immediately
      const updatedCredits = { ...user.demoCredits };
      updatedCredits[mediaType as keyof typeof user.demoCredits] -= 1;
      await airtableService.updateUserCredits(req.user!.id, updatedCredits);

      const webhookUrl =
        mediaType === "video"
          ? process.env.N8N_SORA_WEBHOOK_URL
          : process.env.N8N_GEMINI_WEBHOOK_URL;

      if (!webhookUrl) {
        // If no webhook URL, mark as failed
        await airtableService.updatePost(post.id, {
          status: "FAILED",
        });
        return res
          .status(500)
          .json({ error: "Media generation service not configured" });
      }

      // Prepare form data for n8n
      const formData = new FormData();
      formData.append("postId", post.id);
      formData.append("type", mediaType);
      formData.append("prompt", prompt);
      formData.append("userId", req.user!.id);
      formData.append(
        "hasReferenceImage",
        referenceImageFile ? "true" : "false"
      );

      if (mediaType === "video" && duration) {
        formData.append("duration", duration.toString());
      }

      if (referenceImageFile) {
        formData.append(
          "referenceImage",
          new Blob([referenceImageFile.buffer], {
            type: referenceImageFile.mimetype,
          }),
          referenceImageFile.originalname
        );
      }

      // Fire and forget to n8n
      axios
        .post(webhookUrl, formData, {
          timeout: 5000,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        })
        .then(() => {
          console.log("✅ n8n workflow triggered for post", post.id);
        })
        .catch((err) => {
          console.error("❌ Error triggering n8n workflow:", err.message);
          // Mark as failed if webhook call fails
          airtableService.updatePost(post.id, {
            status: "FAILED",
          });
        });

      return res.json({
        success: true,
        status: "processing",
        postId: post.id,
        message: "Media generation started",
      });
    } catch (error: any) {
      console.error("Media generation error:", error);
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

// ==================== MEDIA READY WEBHOOK (called by n8n) ====================

app.post("/api/media-webhook", async (req, res) => {
  try {
    const { postId, media, mediaType, userId } = req.body;

    if (!postId || !media || !media.url || !mediaType || !userId) {
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    console.log("📩 Media webhook received for post:", postId);

    await airtableService.updatePost(postId, {
      mediaUrl: media.url,
      mediaProvider: mediaType === "video" ? "sora" : "gemini",
      status: "READY",
    });

    await ROIService.incrementMediaGenerated(userId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error("❌ Error in media-webhook:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Global error handler - must be last
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
    console.log(`🔐 Auth: Demo mode enabled`);
  });
}

export default vercelHandler;
