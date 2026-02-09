/**
 * Resolves the cost of a generation based on Admin-defined Global Settings
 */
export const calculateGranularCost = (
  params: {
    mediaType: string;
    duration?: number;
    model?: string;
    mode?: string; // For Editor (Standard/Pro/Enhance)
  },
  settings: any, // This will be the GlobalSettings row from DB
) => {
  const { mediaType, duration, model, mode } = params;

  // 1. PICDRIFT (Dashboard)
  if (mediaType === "video" && (model === "kling-2.5" || model === "kling-3")) {
    // Basic duration pricing
    if (duration === 10) return settings.pricePicDrift_10s;
    if (duration === 15) return settings.pricePicDrift_10s * 1.5; // Estimated 15s
    return settings.pricePicDrift_5s;
  }

  // 2. PIC FX (Dashboard)
  if (mediaType === "image") return settings.pricePicFX_Standard;
  if (mediaType === "carousel") return settings.pricePicFX_Carousel;

  // 3. VIDEO FX 1 (Kling)
  if (
    mediaType === "video" &&
    (model === "kie-sora-2" || model === "kie-sora-2-pro")
  ) {
    if (duration === 15) return settings.priceVideoFX1_15s;
    return settings.priceVideoFX1_10s;
  }

  // 4. VIDEO FX 2 (OpenAI/Sora & Veo)
  if (mediaType === "video" && (model === "sora-2" || model === "sora-2-pro" || model === "veo-3")) {
    if (duration === 8) return settings.priceVideoFX2_8s;
    if (duration === 12) return settings.priceVideoFX2_12s; // Veo doesn't do 12, but safe fallback
    return settings.priceVideoFX2_4s;
  }

  // 5. EDITOR TOOLS (Asset Library)
  if (mode === "standard") return settings.priceEditor_Standard;
  if (mode === "pro") return settings.priceEditor_Pro;
  if (mode === "enhance") return settings.priceEditor_Enhance;
  if (mode === "convert") return settings.priceEditor_Convert;
  if (mode === "drift-path") return settings.priceAsset_DriftPath;

  return 1; // Fallback
};

/**
 * Maps the request to the correct Credit Pool
 */
export const getTargetPool = (
  mediaType: string,
  model?: string,
):
  | "creditsPicDrift"
  | "creditsImageFX"
  | "creditsVideoFX1"
  | "creditsVideoFX2" => {
  if (model === "kling-2.5" || model === "kling-3") return "creditsPicDrift";
  if (mediaType === "image" || mediaType === "carousel")
    return "creditsImageFX";
  if (model?.includes("kie-sora")) return "creditsVideoFX1";
  if (model?.includes("sora-2") || model === "veo-3") return "creditsVideoFX2";

  // Editor fallback
  return "creditsImageFX";
};
