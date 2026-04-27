/**
 * Resolves the cost of a generation based on Admin-defined Global Settings
 */
export const PRICE_KEYS = [
  "pricePicDrift_5s",
  "pricePicDrift_10s",
  "pricePicDrift_Plus_5s",
  "pricePicDrift_Plus_10s",
  "pricePicFX_Standard",
  "pricePicFX_Carousel",
  "pricePicFX_Batch",
  "priceEditor_Pro",
  "priceEditor_Enhance",
  "priceEditor_Convert",
  "priceVideoFX1_10s",
  "priceVideoFX1_15s",
  "priceVideoFX2_4s",
  "priceVideoFX2_8s",
  "priceVideoFX2_12s",
  "priceVideoFX3_4s",
  "priceVideoFX3_6s",
  "priceVideoFX3_8s",
  "priceAsset_DriftPath",
] as const;

const normalizeCost = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.round(n));
};

const isDemoPicdriftUser = (user: any) =>
  user?.isDemo === true &&
  user?.view === "PICDRIFT" &&
  user?.creditSystem === "INTERNAL" &&
  (user?.organization?.isDefault === true || !user?.organizationId);

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
    // Kling 3 (PicDrift Plus)
    if (model === "kling-3") {
      if (duration === 10) return settings.pricePicDrift_Plus_10s;
      return settings.pricePicDrift_Plus_5s;
    }
    // Kling 2.5 (Standard)
    if (duration === 10) return settings.pricePicDrift_10s;
    if (duration === 15) return settings.pricePicDrift_10s * 1.5; // Estimated 15s
    return settings.pricePicDrift_5s;
  }

  // 2. PIC FX (Dashboard)
  if (mediaType === "image") return settings.pricePicFX_Standard;
  if (mediaType === "carousel") return settings.pricePicFX_Carousel;
  if (mode === "batch") return settings.pricePicFX_Batch;

  // 3. VIDEO FX 1 (Topaz Upscale)
  if (mediaType === "video" && model === "topaz-upscale-video") {
    const upscaleFactor = Number((params as any)?.upscaleFactor);
    if (Number.isFinite(upscaleFactor) && upscaleFactor >= 4) {
      return settings.priceVideoFX1_15s;
    }
    return settings.priceVideoFX1_10s;
  }

  // 4. VIDEO FX 2 (Seedance Fal)
  if (
    mediaType === "video" &&
    (model === "seedance-fal-2.0" ||
      model === "sora-2" ||
      model === "sora-2-pro")
  ) {
    const normalizedDuration = Number(duration || 4);
    if (normalizedDuration <= 4) return settings.priceVideoFX2_4s;
    if (normalizedDuration <= 8) return settings.priceVideoFX2_8s;
    return settings.priceVideoFX2_12s;
  }

  // 5. VIDEO FX 3 (Veo)
  if (mediaType === "video" && model === "veo-3") {
    if (duration === 6) return settings.priceVideoFX3_6s;
    if (duration === 8) return settings.priceVideoFX3_8s;
    return settings.priceVideoFX3_4s;
  }

  // 6. EDITOR TOOLS (Asset Library)
  if (mode === "standard") return settings.priceEditor_Standard;
  if (mode === "pro") return settings.priceEditor_Pro;
  if (mode === "enhance") return settings.priceEditor_Enhance;
  if (mode === "convert") return settings.priceEditor_Convert;
  if (mode === "drift-path") return settings.priceAsset_DriftPath;

  return 1; // Fallback
};

export const getCost = (user: any, params: any, settings: any) => {
  if (isDemoPicdriftUser(user)) {
    // For Demo Users, PicDrift Plus (kling-3) costs 2, everything else costs 1
    if (params.model === "kling-3") return 2;
    return 1;
  }
  return normalizeCost(calculateGranularCost(params, settings));
};

/**
 * Maps the request to the correct Credit Pool
 */
export const getTargetPool = (
  user: any,
  mediaType: string,
  model?: string,
):
  | "creditsPicDrift"
  | "creditsPicDriftPlus"
  | "creditsImageFX"
  | "creditsVideoFX1"
  | "creditsVideoFX2"
  | "creditsVideoFX3" => {
  if (user?.view === "PICDRIFT") {
    if (mediaType === "image" || mediaType === "carousel") return "creditsImageFX";
    return "creditsPicDrift";
  }

  if (model === "kling-3") return "creditsPicDriftPlus";
  if (model === "kling-2.5") return "creditsPicDrift";
  if (mediaType === "image" || mediaType === "carousel")
    return "creditsImageFX";
  if (model === "topaz-upscale-video")
    return "creditsVideoFX1";
  if (model?.includes("seedance-fal") || model?.includes("sora-2"))
    return "creditsVideoFX2";
  if (model === "veo-3") return "creditsVideoFX3";

  // Editor fallback
  return "creditsImageFX";
};
