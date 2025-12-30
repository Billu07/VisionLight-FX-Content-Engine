import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export const GeminiService = {
  /**
   * CORE GENERATION & EDITING
   * Now supports explicit Image Size (1K, 2K, 4K) to preserve high resolution.
   */
  async generateOrEditImage(params: {
    prompt: string;
    aspectRatio?: string;
    referenceImages?: Buffer[];
    modelType?: "speed" | "quality";
    useGrounding?: boolean;
    imageSize?: "1K" | "2K" | "4K"; // 👈 NEW: Allow explicit size request
  }): Promise<Buffer> {
    // 1. Model Selection
    const modelId =
      params.modelType === "speed"
        ? "gemini-2.5-flash-image"
        : "gemini-3-pro-image-preview";

    console.log(
      `🍌 Gemini Engine: ${modelId} | Ratio: ${params.aspectRatio} | Size: ${
        params.imageSize || "Default"
      }`
    );

    // 2. Payload
    const parts: any[] = [{ text: params.prompt }];

    if (params.referenceImages && params.referenceImages.length > 0) {
      params.referenceImages.forEach((buf) => {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: buf.toString("base64"),
          },
        });
      });
    }

    // 3. Configuration
    let config: any = {
      responseModalities: ["IMAGE"],
      tools:
        params.useGrounding && modelId.includes("pro")
          ? [{ googleSearch: {} }]
          : undefined,
    };

    // Only apply image config if we have a valid ratio (calculated by contentEngine)
    if (params.aspectRatio && params.aspectRatio !== "original") {
      config.imageConfig = {
        aspectRatio: params.aspectRatio,
        // 🚀 CRITICAL FIX: Use requested size, or default to 2K for Pro
        imageSize:
          params.imageSize || (modelId.includes("pro") ? "2K" : undefined),
      };
    }

    try {
      const response = await client.models.generateContent({
        model: modelId,
        contents: [{ parts }],
        config: config,
      });

      const imagePart = response.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inlineData
      );

      if (imagePart?.inlineData?.data) {
        return Buffer.from(imagePart.inlineData.data, "base64");
      }
      throw new Error("No image data returned from Gemini.");
    } catch (error: any) {
      console.error("Gemini Service Error:", error.message);
      throw error;
    }
  },

  /**
   * VISION ANALYSIS (Text Output)
   */
  async analyzeImageText(params: {
    prompt: string;
    imageBuffer: Buffer;
  }): Promise<string> {
    const modelId = "gemini-2.5-flash";

    try {
      const response = await client.models.generateContent({
        model: modelId,
        contents: [
          {
            parts: [
              { text: params.prompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: params.imageBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
      });

      return (
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No analysis generated."
      );
    } catch (error: any) {
      console.error("Gemini Analysis Error:", error.message);
      throw error;
    }
  },
};
