import { GoogleGenerativeAI } from "@google/generative-ai";

interface ScriptRequest {
  prompt: string;
  mediaType: "video" | "image" | "carousel";
}

interface ScriptResponse {
  caption: string[];
  cta: string;
  mediaType: string;
  imageReference: string;
}

export async function generateScript({
  prompt,
  mediaType,
}: ScriptRequest): Promise<ScriptResponse> {
  try {
    console.log(`📝 Generating script for ${mediaType}:`, prompt);

    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    const systemPrompt = `You are a professional social media content creator. Generate engaging scripts optimized for ${mediaType} content.

CRITICAL: Return ONLY valid JSON, no other text.

JSON Format:
{
  "caption": ["engaging line 1", "compelling line 2", "story line 3", "emotional line 4"],
  "cta": "action-oriented call to action",
  "mediaType": "${mediaType}",
  "imageReference": "detailed visual description for AI generation with specific colors, composition, lighting"
}

Prompt: "${prompt}"`;

    console.log("Sending request to Gemini API...");

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();

    console.log("Raw Gemini response:", responseText);

    // Clean the response - remove markdown code blocks if present
    let cleanJson = responseText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    console.log("Cleaned JSON:", cleanJson);

    const script = JSON.parse(cleanJson);

    // Validate the response structure
    if (
      !script.caption ||
      !Array.isArray(script.caption) ||
      script.caption.length === 0
    ) {
      throw new Error("Invalid caption format in AI response");
    }
    if (!script.cta || typeof script.cta !== "string") {
      throw new Error("Invalid CTA format in AI response");
    }
    if (!script.imageReference || typeof script.imageReference !== "string") {
      throw new Error("Invalid image reference format in AI response");
    }

    console.log("✅ Script generated successfully");

    return {
      caption: script.caption,
      cta: script.cta,
      mediaType: script.mediaType || mediaType,
      imageReference: script.imageReference,
    };
  } catch (error: any) {
    console.error("❌ Script generation error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    // More specific error handling
    if (
      error.message?.includes("API_KEY_INVALID") ||
      error.message?.includes("401")
    ) {
      throw new Error(
        "Invalid Gemini API key - please check your GEMINI_API_KEY in .env"
      );
    } else if (
      error.message?.includes("QUOTA_EXCEEDED") ||
      error.message?.includes("429")
    ) {
      throw new Error(
        "Gemini API quota exceeded - please check your Google Cloud usage limits"
      );
    } else if (error.message?.includes("not configured")) {
      throw new Error("GEMINI_API_KEY is missing from environment variables");
    } else if (error.name === "SyntaxError") {
      throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
    } else if (error.message?.includes("NETWORK")) {
      throw new Error(
        "Network error connecting to Gemini API - please check your internet connection"
      );
    } else {
      throw new Error(`Script generation failed: ${error.message}`);
    }
  }
}
