import { SoraService } from "./sora";
import { GeminiService } from "./gemini";
import { BannerbearService } from "./bannerbear";

export async function generateMedia(
  provider: "sora" | "gemini" | "bannerbear",
  prompt: string,
  imageReference: string,
  postId: string
): Promise<{ url: string; type: string; provider: string; status: string }> {
  try {
    console.log(`🔄 Generating media with ${provider} for post: ${postId}`);

    let result;

    switch (provider) {
      case "sora":
        const soraService = new SoraService();
        // Use simple mode for now to avoid long polling
        result = await soraService.generateVideoSimple(
          imageReference || prompt
        );
        break;

      case "gemini":
        const geminiService = new GeminiService();
        result = await geminiService.generateImage(imageReference || prompt);
        result.status = "completed";
        break;

      case "bannerbear":
        const bannerbearService = new BannerbearService();
        result = await bannerbearService.generateCarousel(prompt);
        result.status = "completed";
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log(
      `✅ ${provider} media generation initiated for post: ${postId}`
    );
    return {
      ...result,
      provider,
    };
  } catch (error: any) {
    console.error(
      `❌ Media generation error for ${provider} on post ${postId}:`,
      error.message
    );
    throw error;
  }
}
