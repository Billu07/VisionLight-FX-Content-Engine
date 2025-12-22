export const PRICING_CONFIG = {
  // 1 Credit = $0.10 (approx)

  // STATIC ASSETS
  IMAGE_GEN: 1, // $0.10
  CAROUSEL_GEN: 3, // $0.30 (3 slides)

  // VIDEO CALCULATIONS
  KIE: {
    SECONDS_PER_CREDIT: 6, // 1 credit per 6s
    // 5s = 1 credit
    // 10s = 2 credits
  },

  KLING: {
    COST_PER_SECOND: 1, // High quality, $0.10 per second
    // 5s = 5 credits
    // 10s = 10 credits
  },

  OPENAI: {
    FLAT_RATE: 5, // $0.50 flat rate per generation
  },
};

export const calculateCost = (
  mediaType: string,
  duration?: number,
  model?: string
): number => {
  if (mediaType === "image") return PRICING_CONFIG.IMAGE_GEN;
  if (mediaType === "carousel") return PRICING_CONFIG.CAROUSEL_GEN;

  if (mediaType === "video") {
    const safeDuration = duration || 5;
    const safeModel = (model || "").toLowerCase();

    // 1. KIE (Video FX)
    if (safeModel.includes("kie")) {
      // Math.ceil(10 / 6) = 2 credits
      return Math.ceil(safeDuration / PRICING_CONFIG.KIE.SECONDS_PER_CREDIT);
    }

    // 2. KLING
    if (safeModel.includes("kling")) {
      return safeDuration * PRICING_CONFIG.KLING.COST_PER_SECOND;
    }

    // 3. OPENAI / Fallback
    return PRICING_CONFIG.OPENAI.FLAT_RATE;
  }

  return 100; // Safety high cost for unknown types
};
