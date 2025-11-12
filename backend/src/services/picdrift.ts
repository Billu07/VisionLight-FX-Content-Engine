type Provider = "sora" | "gemini" | "bannerbear";

interface MediaResult {
  url: string;
  type: "video" | "image" | "carousel";
  provider: string;
  processingTime: number;
  credit?: string;
}

export async function generateMedia(
  provider: Provider,
  prompt: string,
  imageReference: string
): Promise<MediaResult> {
  console.log(`🔄 Generating ${provider} media for: "${prompt}"`);

  const startTime = Date.now();

  try {
    let result: MediaResult;

    // Dynamically import services to handle missing files
    let serviceModule;

    switch (provider) {
      case "sora":
        try {
          serviceModule = await import("./sora");
          const videoResult = await serviceModule.generateSoraVideo(
            prompt,
            imageReference
          );
          result = {
            url: videoResult.url,
            type: "video",
            provider: "sora",
            processingTime: Date.now() - startTime,
            credit: videoResult.credit,
          };
        } catch (error) {
          console.warn("Sora service not available, using fallback");
          result = await getEnhancedFallback(provider, prompt, imageReference);
        }
        break;

      case "gemini":
        try {
          serviceModule = await import("./gemini");
          const imageResult = await serviceModule.generateGeminiImage(
            prompt,
            imageReference
          );
          result = {
            url: imageResult.url,
            type: "image",
            provider: "gemini",
            processingTime: Date.now() - startTime,
            credit: imageResult.credit,
          };
        } catch (error) {
          console.warn("Gemini service not available, using fallback");
          result = await getEnhancedFallback(provider, prompt, imageReference);
        }
        break;

      case "bannerbear":
        try {
          serviceModule = await import("./bannerbear");
          const carouselResult = await serviceModule.generateBannerbearCarousel(
            prompt,
            imageReference
          );
          result = {
            url: carouselResult.url,
            type: "carousel",
            provider: "bannerbear",
            processingTime: Date.now() - startTime,
            credit: carouselResult.credit,
          };
        } catch (error) {
          console.warn("Bannerbear service not available, using fallback");
          result = await getEnhancedFallback(provider, prompt, imageReference);
        }
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log(`✅ ${provider} media generated in ${result.processingTime}ms`);
    return result;
  } catch (error: any) {
    console.error(`❌ ${provider} media generation failed:`, error);

    // Enhanced fallback with better demo content
    const fallbackResult: MediaResult = await getEnhancedFallback(
      provider,
      prompt,
      imageReference
    );
    return fallbackResult;
  }
}

async function getEnhancedFallback(
  provider: Provider,
  prompt: string,
  imageReference: string
): Promise<MediaResult> {
  const startTime = Date.now();

  const fallbacks = {
    sora: {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      type: "video" as const,
      provider: "sora",
      credit: "Demo video content",
    },
    gemini: {
      url: `https://picsum.photos/1080/1080?random=${Date.now()}&text=${encodeURIComponent(
        prompt.slice(0, 20)
      )}`,
      type: "image" as const,
      provider: "gemini",
      credit: "Demo AI-generated image",
    },
    bannerbear: {
      url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=600&fit=crop",
      type: "carousel" as const,
      provider: "bannerbear",
      credit: "Demo carousel template",
    },
  };

  return {
    ...fallbacks[provider],
    processingTime: Date.now() - startTime,
  };
}
