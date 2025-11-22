import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });
  }

  async generateImage(prompt: string): Promise<{ url: string; type: string }> {
    try {
      console.log("🎨 Generating Gemini image with prompt:", prompt);

      // For Gemini Flash 2.0, we use the model to generate image descriptions
      // and then potentially use another service for actual image generation
      // For now, we'll use a placeholder approach since direct image generation
      // might require Imagen or another Google service

      const enhancedPrompt = await this.enhanceImagePrompt(prompt);

      // In a real implementation, you'd call Google's Image Generation API here
      // For now, we return a descriptive success response
      const imageDescription = await this.generateImageDescription(
        enhancedPrompt
      );

      return {
        url: `https://visionlight-fx.com/generated/${Date.now()}.jpg?prompt=${encodeURIComponent(
          imageDescription
        )}`,
        type: "image",
      };
    } catch (error: any) {
      console.error("❌ Gemini image generation error:", error);

      if (error.message?.includes("API_KEY_INVALID")) {
        throw new Error(
          "Invalid Gemini API key - please check your credentials"
        );
      } else if (error.message?.includes("QUOTA_EXCEEDED")) {
        throw new Error(
          "Gemini API quota exceeded - please check your usage limits"
        );
      } else {
        throw new Error(`Image generation failed: ${error.message}`);
      }
    }
  }

  private async enhanceImagePrompt(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(
        `Enhance this image generation prompt for better visual results. Make it descriptive, vivid, and optimized for AI image generation. Return only the enhanced prompt: "${prompt}"`
      );

      const enhanced = result.response.text().trim();
      return enhanced || prompt; // Fallback to original if empty
    } catch (error) {
      console.warn("Prompt enhancement failed, using original:", error);
      return prompt;
    }
  }

  private async generateImageDescription(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(
        `Create a detailed visual description for this prompt that would be perfect for AI image generation. Be specific about colors, composition, lighting, and style: "${prompt}"`
      );

      return result.response.text().trim();
    } catch (error) {
      console.warn("Image description generation failed:", error);
      return prompt;
    }
  }

  async generateScript(prompt: string, mediaType: string): Promise<any> {
    try {
      const result = await this.model.generateContent(
        `Create a social media script for ${mediaType} content. Prompt: "${prompt}"
        
        Return JSON format:
        {
          "caption": ["line1", "line2", "line3"],
          "cta": "call to action text",
          "imageReference": "detailed visual description"
        }`
      );

      const text = result.response.text();
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error("Invalid response format from Gemini");
    } catch (error: any) {
      throw new Error(`Script generation failed: ${error.message}`);
    }
  }
}
