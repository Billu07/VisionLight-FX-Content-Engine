import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface GeminiImageResponse {
  url: string;
  credit: string;
}

export async function generateGeminiImage(
  prompt: string,
  imageReference: string
): Promise<GeminiImageResponse> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith("placeholder")) {
    console.warn("Gemini API key not configured, using demo images");
    return getDemoImage(prompt);
  }

  try {
    // For now, we'll use a placeholder image generation service
    // You can replace this with actual Gemini image generation when available
    const enhancedPrompt = `${prompt}. ${imageReference}. High quality, social media optimized, professional photography.`;

    return await generateImageFromDescription(enhancedPrompt);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return getDemoImage(prompt);
  }
}

async function generateImageFromDescription(
  description: string
): Promise<GeminiImageResponse> {
  // Use Unsplash as a fallback until Gemini image generation is available
  try {
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const unsplashResponse = await axios.get(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(
          description.split(" ").slice(0, 3).join(" ")
        )}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`
      );

      if (unsplashResponse.data) {
        return {
          url: unsplashResponse.data.urls.regular,
          credit: `Photo by ${unsplashResponse.data.user.name} on Unsplash`,
        };
      }
    }
  } catch (error) {
    console.error("Unsplash fallback failed:", error);
  }

  return getDemoImage(description);
}

function getDemoImage(prompt: string): GeminiImageResponse {
  const keywords = prompt.toLowerCase();

  if (keywords.includes("beach") || keywords.includes("ocean")) {
    return {
      url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&h=1080&fit=crop",
      credit: "Demo beach image",
    };
  } else if (keywords.includes("office") || keywords.includes("business")) {
    return {
      url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1080&h=1080&fit=crop",
      credit: "Demo office image",
    };
  } else if (keywords.includes("mountain") || keywords.includes("nature")) {
    return {
      url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1080&h=1080&fit=crop",
      credit: "Demo nature image",
    };
  } else {
    return {
      url: `https://picsum.photos/1080/1080?random=${Date.now()}`,
      credit: "Demo AI-generated image",
    };
  }
}
