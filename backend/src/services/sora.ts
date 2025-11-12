import axios from "axios";

const SORA_API_KEY = process.env.SORA_API_KEY;

interface SoraVideoResponse {
  id: string;
  status: string;
  video_url?: string;
  error?: string;
}

export async function generateSoraVideo(
  prompt: string,
  imageReference: string
): Promise<{ url: string; credit: string }> {
  if (!SORA_API_KEY || SORA_API_KEY.startsWith("placeholder")) {
    console.warn("Sora API key not configured, using demo videos");
    return getDemoVideo(prompt);
  }

  try {
    // Combine user prompt with AI-generated image reference for better results
    const enhancedPrompt = `${prompt}. ${imageReference}. High quality, 15 seconds, social media optimized.`;

    const response = await axios.post(
      "https://api.openai.com/v1/video/generations",
      {
        model: "sora-2.0",
        prompt: enhancedPrompt,
        duration: 15, // 15 seconds for social media
        size: "1280x720", // 720p for social media
        style: "natural", // Natural style for authentic content
      },
      {
        headers: {
          Authorization: `Bearer ${SORA_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const videoData: SoraVideoResponse = response.data;

    if (videoData.status === "completed" && videoData.video_url) {
      return {
        url: videoData.video_url,
        credit: "Generated with Sora 2",
      };
    } else {
      throw new Error(videoData.error || "Video generation failed");
    }
  } catch (error: any) {
    console.error("Sora API Error:", error.response?.data || error.message);
    return getDemoVideo(prompt);
  }
}

function getDemoVideo(prompt: string) {
  // Return high-quality demo videos based on prompt
  const keywords = prompt.toLowerCase();

  if (
    keywords.includes("beach") ||
    keywords.includes("ocean") ||
    keywords.includes("sunset")
  ) {
    return {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      credit: "Demo beach video",
    };
  } else if (
    keywords.includes("city") ||
    keywords.includes("urban") ||
    keywords.includes("street")
  ) {
    return {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      credit: "Demo city video",
    };
  } else if (
    keywords.includes("nature") ||
    keywords.includes("mountain") ||
    keywords.includes("forest")
  ) {
    return {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      credit: "Demo nature video",
    };
  } else {
    return {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      credit: "Demo video content",
    };
  }
}
