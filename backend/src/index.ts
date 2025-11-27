import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { jobService } from "./services/JobService";
import { upload, uploadToCloudinary } from "./utils/fileUpload";

// Load environment variables FIRST
dotenv.config();

// Debug environment variables
console.log("🔧 Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "✅ Loaded" : "❌ Missing",
  airtableBase: process.env.AIRTABLE_BASE_ID ? "✅ Loaded" : "❌ Missing",
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing",
  nodeEnv: process.env.NODE_ENV,
});

// Now import other modules
import { generateScript } from "./services/script";
import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";
import { airtableService } from "./services/airtable";

const activeTimeouts = new Map<string, NodeJS.Timeout>();
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
    version: "2.0.0",
    database: "Airtable",
    features: ["Cloudinary", "Generation Parameters", "Two-Workflow System"],
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

// Enhanced Direct Media Generation with Cloudinary and Generation Parameters
app.post(
  "/api/generate-media",
  authenticateToken,
  upload.single("referenceImage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      console.log("🎬 Enhanced /api/generate-media endpoint hit!");

      const {
        prompt,
        mediaType,
        duration,
        model,
        aspectRatio,
        size,
        width,
        height,
      } = req.body;
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

      // Upload reference image to Cloudinary if provided
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

      // Capture ALL generation parameters for second workflow
      const generationParams = {
        mediaType,
        duration: duration ? parseInt(duration) : undefined,
        model,
        aspectRatio,
        size,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        imageReference: imageReferenceUrl, // Store Cloudinary URL, not the file
        hasReferenceImage: !!referenceImageFile,
        timestamp: new Date().toISOString(),
      };

      console.log("📋 Storing generation parameters:", generationParams);

      // Create post with generation parameters
      const post = await airtableService.createPost({
        userId: req.user!.id,
        prompt,
        mediaType: mediaType.toUpperCase() as any,
        platform: "INSTAGRAM",
        generationParams: generationParams, // Store all parameters for second workflow
        imageReference: imageReferenceUrl,
        generationStep: "PROMPT_ENHANCEMENT",
        requiresApproval: true,
      });

      console.log("📝 Post created with generation params:", post.id);

      // Initialize job tracking
      await jobService.createJob(post.id, mediaType);
      await airtableService.updatePost(post.id, {
        status: "NEW",
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
        await jobService.updateJobStatus(
          post.id,
          "failed",
          undefined,
          "Webhook URL not configured"
        );
        return res
          .status(500)
          .json({ error: "Media generation service not configured" });
      }

      // Prepare form data for n8n - include all parameters
      const formData = new FormData();
      formData.append("postId", post.id);
      formData.append("type", mediaType);
      formData.append("prompt", prompt);
      formData.append("userId", req.user!.id);
      formData.append(
        "hasReferenceImage",
        referenceImageFile ? "true" : "false"
      );

      // Add enhanced video parameters
      if (mediaType === "video") {
        if (duration) formData.append("duration", duration.toString());
        if (model) formData.append("model", model);
        if (aspectRatio) formData.append("aspectRatio", aspectRatio);
        if (size) formData.append("size", size);
        if (width) formData.append("width", width);
        if (height) formData.append("height", height);
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
      console.log("🚀 Sending to n8n webhook...");

      axios
        .post(webhookUrl, formData, {
          timeout: 15000,
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then(async (response) => {
          console.log("✅ n8n workflow triggered successfully!");
          await jobService.updateJobStatus(post.id, "processing", 10);
        })
        .catch(async (error) => {
          console.error("❌ Error triggering n8n workflow:", error.message);
          await jobService.updateJobStatus(
            post.id,
            "failed",
            undefined,
            `Failed to start generation: ${error.message}`
          );
        });

      // Return immediate response with job info
      const job = await jobService.getJobStatus(post.id);
      return res.json({
        success: true,
        status: "queued",
        postId: post.id,
        message: "Media generation queued successfully",
        estimatedCompletion: job?.estimatedCompletion,
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

// ==================== PROMPT APPROVAL WORKFLOW ROUTES ====================

app.post("/api/update-enhanced-prompt", async (req, res) => {
  try {
    const { postId, enhancedPrompt, imageReference } = req.body;

    if (!postId || !enhancedPrompt) {
      return res.status(400).json({
        success: false,
        error: "Post ID and enhanced prompt are required",
      });
    }

    console.log("📝 Updating enhanced prompt for post:", postId);

    await airtableService.updatePost(postId, {
      enhancedPrompt,
      imageReference: imageReference || "",
      generationStep: "AWAITING_APPROVAL", // ← This is what triggers the modal
      status: "PROCESSING",
    });

    console.log(
      "✅ Enhanced prompt saved to Airtable - modal should appear soon"
    );

    return res.json({
      success: true,
      message:
        "Enhanced prompt updated - user should see approval modal shortly",
    });
  } catch (error: any) {
    console.error("Error updating enhanced prompt:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== APPROVE PROMPT ENDPOINT ====================
app.post(
  "/api/approve-prompt",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId, finalPrompt } = req.body;

      if (!postId || !finalPrompt) {
        return res
          .status(400)
          .json({ error: "Post ID and final prompt are required" });
      }

      console.log("✅ User approving prompt for post:", postId);

      // Verify user owns this post and get the stored generation parameters
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      console.log("📋 Retrieved post data:", {
        imageReference: post.imageReference,
        hasGenerationParams: !!post.generationParams,
        generationParamsImageRef: post.generationParams?.imageReference,
      });

      // Update with final prompt
      await airtableService.updatePost(postId, {
        userEditedPrompt: finalPrompt,
        generationStep: "GENERATION",
        requiresApproval: false,
        status: "PROCESSING",
      });

      // Update job status
      await jobService.updateJobStatus(
        postId,
        "processing",
        50,
        "Starting final generation with your approved prompt"
      );

      // 🚀 TRIGGER SECOND N8N WORKFLOW
      const secondWorkflowUrl = process.env.N8N_FINAL_GENERATION_WEBHOOK_URL;

      if (!secondWorkflowUrl) {
        console.error("❌ No final generation webhook URL configured");
        await jobService.updateJobStatus(
          postId,
          "failed",
          undefined,
          "Final generation service not configured"
        );
        return res
          .status(500)
          .json({ error: "Generation service not configured" });
      }

      // Get image reference from both possible locations
      const imageReference =
        post.imageReference || post.generationParams?.imageReference || "";
      const hasReferenceImage = !!(
        imageReference && imageReference.startsWith("http")
      );

      // Prepare JSON data for webhook
      const webhookData = {
        // Basic parameters
        postId: postId,
        finalPrompt: finalPrompt,
        mediaType: post.mediaType?.toLowerCase() || "video",
        userId: post.userId,

        // Include ALL generation parameters from the first workflow
        ...(post.generationParams || {}),

        // Add prompt history
        originalPrompt: post.prompt,
        enhancedPrompt: post.enhancedPrompt || "",

        // ✅ CRITICAL: Force include the image reference (overwrite if needed)
        imageReference: imageReference,

        // ✅ CRITICAL: Set hasReferenceImage based on actual image presence
        hasReferenceImage: hasReferenceImage,

        approvalTimestamp: new Date().toISOString(),
      };

      console.log("🚀 Sending to final generation:", {
        postId,
        hasReferenceImage: webhookData.hasReferenceImage,
        imageReference: webhookData.imageReference || "none",
        mediaType: webhookData.mediaType,
      });

      // Send to second n8n workflow as JSON
      axios
        .post(secondWorkflowUrl, webhookData, {
          timeout: 20000,
          headers: {
            "Content-Type": "application/json",
          },
        })
        .then(async (response) => {
          console.log("✅ Final generation workflow triggered successfully!");
          await jobService.updateJobStatus(
            postId,
            "processing",
            60,
            `Final generation started ${
              hasReferenceImage
                ? "with reference image"
                : "without reference image"
            }`
          );
        })
        .catch(async (error) => {
          console.error("❌ Error triggering final generation:", error.message);
          await jobService.updateJobStatus(
            postId,
            "failed",
            undefined,
            `Failed to start final generation: ${error.message}`
          );
        });

      res.json({
        success: true,
        message:
          "Prompt approved. Final generation starting with all your original settings...",
        hasReferenceImage,
      });
    } catch (error: any) {
      console.error("Error approving prompt:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// NEW: Get post details for prompt editing
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
          generationParams: post.generationParams, // Include generation params
          createdAt: post.createdAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// NEW: Cancel prompt approval and mark as failed
app.post(
  "/api/cancel-prompt",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.body;

      if (!postId) {
        return res.status(400).json({ error: "Post ID is required" });
      }

      console.log("❌ User cancelling prompt approval for post:", postId);

      // Verify user owns this post
      const post = await airtableService.getPostById(postId);
      if (!post || post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update post status to failed/cancelled
      await airtableService.updatePost(postId, {
        status: "CANCELLED",
        generationStep: "COMPLETED",
        requiresApproval: false,
      });

      // Update job status
      try {
        await jobService.updateJobStatus(
          postId,
          "failed",
          undefined,
          "User cancelled prompt approval"
        );
      } catch (jobError) {
        console.log("No job tracking found for post:", postId);
      }

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

// ==================== JOB STATUS ENDPOINT ====================

// Get job status
app.get(
  "/api/job-status/:postId",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { postId } = req.params;

      const jobStatus = jobService.getJobStatus(postId);
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
        job: jobStatus,
        post: {
          id: post.id,
          status: post.status,
          mediaUrl: post.mediaUrl,
          updatedAt: post.updatedAt,
        },
      });
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

    console.log("📩 Enhanced media webhook received for post:", postId);

    // Update job status to completed
    await jobService.updateJobStatus(postId, "completed", 100);

    // Update Airtable
    await airtableService.updatePost(postId, {
      mediaUrl: media.url,
      mediaProvider: mediaType === "video" ? "sora" : "gemini",
      status: "READY",
      generationStep: "COMPLETED",
    });

    await ROIService.incrementMediaGenerated(userId);

    console.log("✅ Media generation completed for post:", postId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error("❌ Error in enhanced media-webhook:", err);
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
    console.log(`☁️  File Storage: Cloudinary`);
    console.log(`🔐 Auth: Demo mode enabled`);
  });
}

export default vercelHandler;
