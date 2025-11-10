import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db";
import { generateScript } from "./services/script";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
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

// Generate Script
app.post("/api/generate-script", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const script = await generateScript(prompt);
    res.json({ success: true, script });
  } catch (error: any) {
    console.error("OpenAI Error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate script", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
