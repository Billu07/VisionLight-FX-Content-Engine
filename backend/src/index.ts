import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db";
import { generateMedia } from "./services/picdrift";
import { generateScript } from "./services/script";
import { ROIService } from "./services/roi";
import { AuthService } from "./services/auth";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Visionlight FX Backend - Running!" });
});

// Test DB
app.get("/api/test-db", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      success: true,
      userCount,
      message: "Prisma + SQLite connected!",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = async (req: any, res: any, next: any) => {
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
app.post("/api/auth/logout", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    await AuthService.deleteSession(token);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Validate session
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
    },
  });
});

// ==================== PROTECTED ROUTES ====================

// Get brand config
app.get("/api/brand-config", authenticateToken, async (req, res) => {
  try {
    const config = await prisma.brandConfig.findUnique({
      where: { userId: req.user.id },
    });
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update brand config
app.put("/api/brand-config", authenticateToken, async (req, res) => {
  const { companyName, primaryColor, secondaryColor, logoUrl } = req.body;

  try {
    const config = await prisma.brandConfig.upsert({
      where: { userId: req.user.id },
      update: { companyName, primaryColor, secondaryColor, logoUrl },
      create: {
        userId: req.user.id,
        companyName,
        primaryColor,
        secondaryColor,
        logoUrl,
      },
    });
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get ROI Metrics
app.get("/api/roi-metrics", authenticateToken, async (req, res) => {
  try {
    const metrics = await ROIService.getMetrics(req.user.id);
    res.json({ success: true, metrics });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate Script
app.post("/api/generate-script", authenticateToken, async (req, res) => {
  const { prompt, mediaType } = req.body;

  if (
    !prompt ||
    !mediaType ||
    !["video", "image", "carousel"].includes(mediaType)
  ) {
    return res
      .status(400)
      .json({ error: "Prompt and valid mediaType are required" });
  }

  try {
    const script = await generateScript({ prompt, mediaType });
    res.json({ success: true, script });
  } catch (error: any) {
    console.error("OpenAI Error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate script", details: error.message });
  }
});

// Save Script as Post
app.post("/api/posts", authenticateToken, async (req, res) => {
  const { prompt, script, platform = "INSTAGRAM" } = req.body;

  if (!prompt || !script) {
    return res.status(400).json({ error: "Prompt and script are required" });
  }

  try {
    const post = await prisma.post.create({
      data: {
        prompt,
        script,
        platform,
        status: "NEW",
        mediaType: null,
        userId: req.user.id,
      },
      include: {
        user: true,
      },
    });

    // Track ROI - Post created
    await ROIService.incrementPostsCreated(req.user.id);

    res.json({ success: true, post });
  } catch (error: any) {
    console.error("DB Error:", error);
    res
      .status(500)
      .json({ error: "Failed to save post", details: error.message });
  }
});

// Generate Media
app.post("/api/generate-media", authenticateToken, async (req, res) => {
  const { postId, provider } = req.body;

  if (!postId || !["sora", "gemini", "bannerbear"].includes(provider)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { user: true },
    });

    if (!post || !post.user) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Verify post belongs to current user
    if (post.userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const credits = post.user.demoCredits as any;
    if (credits[provider] <= 0) {
      return res.status(403).json({ error: "No credits left" });
    }

    // Get image reference from script
    const script = post.script as any;
    const imageReference = script.imageReference || script.prompt;

    const media = await generateMedia(
      provider as any,
      post.prompt,
      imageReference
    );

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        mediaUrl: media.url,
        mediaType: media.type.toUpperCase() as any,
        mediaProvider: media.provider,
        status: "READY",
      },
    });

    // Update user credits
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        demoCredits: {
          ...credits,
          [provider]: credits[provider] - 1,
        },
      },
    });

    // Track ROI - Media generated
    await ROIService.incrementMediaGenerated(req.user.id);

    res.json({ success: true, post: updatedPost, media });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// publish to social media
app.post("/api/publish-post", authenticateToken, async (req, res) => {
  const { postId, platform = "INSTAGRAM" } = req.body;

  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { user: true },
    });

    if (!post || !post.mediaUrl) {
      return res.status(400).json({ error: "Post not ready for publishing" });
    }

    if (post.userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const script = post.script as any;
    const bufferResult = await scheduleBufferPost(
      script.caption,
      script.cta,
      post.mediaUrl,
      post.mediaType?.toLowerCase() as any,
      platform.toLowerCase()
    );

    // Update post status
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        status: bufferResult.success ? "PUBLISHED" : "FAILED",
        bufferPostId: bufferResult.postId,
      },
    });

    res.json({
      success: bufferResult.success,
      post: updatedPost,
      message: bufferResult.message,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all posts (user-specific)
app.get("/api/posts", authenticateToken, async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: { user: true },
    });
    res.json({ success: true, posts });
  } catch (error: any) {
    console.error("Fetch posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Get user credits
app.get("/api/user-credits", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { demoCredits: true },
    });

    if (!user || !user.demoCredits) {
      return res.json({ credits: { sora: 0, gemini: 0, bannerbear: 0 } });
    }

    const credits = user.demoCredits as {
      sora: number;
      gemini: number;
      bannerbear: number;
    };
    res.json({ credits });
  } catch (error: any) {
    console.error("Credits fetch error:", error);
    res.status(500).json({ error: "Failed to fetch credits" });
  }
});

// Reset demo credits (for testing - protected)
app.post("/api/reset-demo-credits", authenticateToken, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        demoCredits: {
          sora: 2,
          gemini: 2,
          bannerbear: 2,
        },
      },
    });
    res.json({ success: true, message: "Demo credits reset" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
  console.log(`🔐 Auth test: http://localhost:${PORT}/api/auth/demo-login`);
});
