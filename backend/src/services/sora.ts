import OpenAI from "openai";

export class SoraService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.SORA_API_KEY!,
    });
  }

  async generateVideo(
    prompt: string
  ): Promise<{ url: string; type: string; status: string }> {
    try {
      console.log("🚀 Generating Sora video with optimized prompt");

      // Clean and optimize the prompt
      const optimizedPrompt = this.optimizeVideoPrompt(prompt);
      console.log("📝 Optimized prompt:", optimizedPrompt);

      // Start video generation (manual approach)
      let video = await this.openai.videos.create({
        model: "sora-2",
        prompt: optimizedPrompt,
        seconds: "8",
        size: "720x1280",
      });

      console.log("🎬 Video generation started:", video.id);
      let progress = video.progress ?? 0;
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max (10s intervals)

      // Poll until completion
      while (
        (video.status === "in_progress" || video.status === "queued") &&
        attempts < maxAttempts
      ) {
        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Check status
        video = await this.openai.videos.retrieve(video.id);
        progress = video.progress ?? 0;
        attempts++;

        console.log(
          `📊 Video ${video.id}: ${video.status} - ${progress}% (attempt ${attempts}/${maxAttempts})`
        );

        if (video.status === "failed") {
          throw new Error(
            `Video generation failed: ${
              video.error?.message || "Unknown error"
            }`
          );
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error("Video generation timeout - took too long to complete");
      }

      if (video.status === "completed") {
        console.log("✅ Sora video generation completed");

        // For now, return a placeholder - we'll implement download later
        return {
          url: `https://api.openai.com/v1/videos/${video.id}/content`,
          type: "video",
          status: "completed",
        };
      } else {
        throw new Error(`Video generation ended with status: ${video.status}`);
      }
    } catch (error: any) {
      console.error("❌ Sora API Error:", error.message);

      // More specific error messages
      if (error.status === 400) {
        throw new Error(`Sora API: Bad request - ${error.message}`);
      } else if (error.status === 401) {
        throw new Error("Sora API: Invalid API key or unauthorized");
      } else if (error.status === 429) {
        throw new Error("Sora API: Rate limit exceeded");
      } else {
        throw new Error(`Sora API error: ${error.message}`);
      }
    }
  }

  // Alternative: Simple create without polling (faster for testing)
  async generateVideoSimple(
    prompt: string
  ): Promise<{ url: string; type: string; status: string }> {
    try {
      console.log("🚀 Starting Sora video generation (simple mode)");

      const optimizedPrompt = this.optimizeVideoPrompt(prompt);

      const video = await this.openai.videos.create({
        model: "sora-2",
        prompt: optimizedPrompt,
        seconds: "8",
        size: "720x1280",
      });

      console.log("✅ Sora video job created:", video.id);

      // Return immediately with the video ID - frontend can poll status
      return {
        url: `sora-pending:${video.id}`, // Special format to indicate pending
        type: "video/mp4",
        status: video.status,
      };
    } catch (error: any) {
      console.error("❌ Sora video creation error:", error.message);
      throw new Error(`Sora video creation failed: ${error.message}`);
    }
  }

  // Method to check video status (for frontend polling)
  async checkVideoStatus(
    videoId: string
  ): Promise<{ status: string; progress?: number; url?: string }> {
    try {
      const video = await this.openai.videos.retrieve(videoId);

      if (video.status === "completed") {
        return {
          status: "completed",
          progress: 100,
          url: `https://api.openai.com/v1/videos/${videoId}/content`,
        };
      }

      return {
        status: video.status,
        progress: video.progress,
      };
    } catch (error: any) {
      throw new Error(`Failed to check video status: ${error.message}`);
    }
  }

  private optimizeVideoPrompt(prompt: string): string {
    // Clean up the prompt
    let cleaned = prompt
      .replace(/"/g, "'")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 800); // Shorter limit for safety

    return `Cinematic style, high quality, professional lighting: ${cleaned}`;
  }
}
