import { OpenAI } from "openai";

// Initialize OpenAI with error handling
let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log("✅ OpenAI client initialized");
} catch (error) {
  console.error("❌ OpenAI initialization failed:", error);
}

interface ScriptRequest {
  prompt: string;
  mediaType: "video" | "image" | "carousel";
}

export async function generateScript({ prompt, mediaType }: ScriptRequest) {
  console.log(`🔄 Generating ${mediaType} script for: "${prompt}"`);

  // Check if OpenAI is properly initialized
  if (!openai) {
    console.error("OpenAI client not initialized - check OPENAI_API_KEY");
    return getEnhancedFallback(prompt, mediaType);
  }

  // Check if API key is valid (not placeholder)
  if (
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY.startsWith("sk-") === false
  ) {
    console.warn("OpenAI API key not configured or invalid, using fallback");
    return getEnhancedFallback(prompt, mediaType);
  }

  try {
    // Media-specific system prompts
    const systemPrompts = {
      video: `You are a professional video content creator. Create a detailed script for a 15-second social media video.
      
      Requirements:
      - Create 3 engaging caption lines (max 15 words each)
      - Create 1 strong call-to-action (max 8 words)
      - Provide detailed visual description for video generation
      - Include specific scene descriptions, colors, mood, and style references
      - Optimize for short-form video platforms like Instagram Reels/TikTok
      
      Output ONLY valid JSON format:
      {
        "caption": ["line1", "line2", "line3"],
        "cta": "CTA text here",
        "mediaType": "video",
        "imageReference": "Detailed visual description for video generation"
      }`,

      image: `You are a professional photographer and social media strategist. Create compelling content for a single impactful image.
      
      Requirements:
      - Create 3 engaging caption lines (max 15 words each)
      - Create 1 strong call-to-action (max 8 words)
      - Provide detailed visual description for image generation
      - Include composition, lighting, style, and mood details
      - Optimize for visual platforms like Instagram
      
      Output ONLY valid JSON format:
      {
        "caption": ["line1", "line2", "line3"],
        "cta": "CTA text here",
        "mediaType": "image", 
        "imageReference": "Detailed visual description for image generation"
      }`,

      carousel: `You are a professional content strategist. Create a cohesive story across 4 carousel slides.
      
      Requirements:
      - Create 3 engaging caption lines that work across all slides (max 15 words each)
      - Create 1 strong call-to-action (max 8 words)
      - Provide visual descriptions for 4 connected slides
      - Each slide should advance the story or message
      - Optimize for carousel format on Instagram/LinkedIn
      
      Output ONLY valid JSON format:
      {
        "caption": ["line1", "line2", "line3"],
        "cta": "CTA text here",
        "mediaType": "carousel",
        "imageReference": "Visual descriptions for 4 connected carousel slides"
      }`,
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4", // Fallback to gpt-4 if gpt-4o not available
      messages: [
        {
          role: "system",
          content: systemPrompts[mediaType],
        },
        {
          role: "user",
          content: `Create ${mediaType} content for: ${prompt}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    console.log("✅ OpenAI response received");

    const result = completion.choices[0]?.message?.content;

    if (!result) {
      console.error("No content in OpenAI response");
      throw new Error("No response from OpenAI");
    }

    console.log("📄 Raw OpenAI response:", result);

    let parsedResult;
    try {
      parsedResult = JSON.parse(result);
    } catch (parseError) {
      console.error("Failed to parse OpenAI JSON response:", parseError);
      throw new Error("Invalid JSON response from AI");
    }

    // Validate the response structure
    if (
      !parsedResult.caption ||
      !Array.isArray(parsedResult.caption) ||
      !parsedResult.cta ||
      !parsedResult.imageReference
    ) {
      console.error("Invalid response structure from OpenAI:", parsedResult);
      throw new Error(
        "Invalid response format from AI - missing required fields"
      );
    }

    // Ensure mediaType is set
    parsedResult.mediaType = mediaType;

    console.log("✅ Script generated successfully");
    return parsedResult;
  } catch (error: any) {
    console.error("❌ OpenAI API Error:", error);

    // Enhanced fallback with media-specific data
    console.log("🔄 Using fallback script data for:", mediaType);
    return getEnhancedFallback(prompt, mediaType);
  }
}

function getEnhancedFallback(
  prompt: string,
  mediaType: "video" | "image" | "carousel"
) {
  const fallbacks = {
    video: {
      caption: [
        `Watch the magic of ${prompt.split(" ").slice(0, 3).join(" ")} unfold`,
        "Every frame tells a story worth sharing",
        "Visual experiences that captivate and inspire",
      ],
      cta: "Watch the full story in our reel! 👀",
      mediaType: "video",
      imageReference: `A dynamic 15-second video showing ${prompt}. Smooth camera movements, vibrant colors, cinematic lighting. Include engaging transitions and visual storytelling elements that capture attention quickly.`,
    },
    image: {
      caption: [
        `Capturing the essence of ${prompt.split(" ").slice(0, 2).join(" ")}`,
        "Moments worth remembering forever 📸",
        "Where beauty meets the lens",
      ],
      cta: "Tag someone who needs to see this! 👇",
      mediaType: "image",
      imageReference: `A high-quality, professionally composed image of ${prompt}. Excellent lighting, sharp focus, visually striking composition. Should tell a compelling story in a single frame with strong visual appeal.`,
    },
    carousel: {
      caption: [
        `Discover the story behind ${prompt.split(" ").slice(0, 2).join(" ")}`,
        "Swipe to uncover more insights ➡️",
        "Each slide reveals something new",
      ],
      cta: "Swipe through to learn more! 👆",
      mediaType: "carousel",
      imageReference: `A 4-slide carousel telling a cohesive story about ${prompt}. 
      Slide 1: Eye-catching introduction with main hook. 
      Slide 2: Key information or surprising benefits. 
      Slide 3: Visual demonstration or real examples. 
      Slide 4: Strong conclusion with clear call-to-action. 
      Consistent visual style and branding across all slides.`,
    },
  };

  return fallbacks[mediaType];
}
