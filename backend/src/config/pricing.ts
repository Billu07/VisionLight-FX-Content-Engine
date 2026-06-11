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

export const COST_KEYS = [
  "costPicDrift_5s",
  "costPicDrift_10s",
  "costPicDrift_Plus_5s",
  "costPicDrift_Plus_10s",
  "costPicFX_Standard",
  "costPicFX_Nano",
  "costPicFX_Gpt2",
  "costPicFX_Carousel",
  "costPicFX_Batch",
  "costEditor_Pro",
  "costEditor_Enhance",
  "costEditor_Convert",
  "costVideoFX1_10s",
  "costVideoFX1_15s",
  "costVideoFX2_4s",
  "costVideoFX2_8s",
  "costVideoFX2_12s",
  "costVideoFX3_4s",
  "costVideoFX3_6s",
  "costVideoFX3_8s",
  "costAsset_DriftPath",
] as const;

export const DEFAULT_FAL_PRICING: Record<
  (typeof PRICE_KEYS)[number],
  number
> = {
  // These are platform credit deductions (integer credits per render), not USD.
  pricePicDrift_5s: 1,
  pricePicDrift_10s: 2,
  pricePicDrift_Plus_5s: 2,
  pricePicDrift_Plus_10s: 3,
  pricePicFX_Standard: 1,
  pricePicFX_Carousel: 3,
  pricePicFX_Batch: 1,
  priceEditor_Pro: 4,
  priceEditor_Enhance: 1,
  priceEditor_Convert: 1,
  priceVideoFX1_10s: 4,
  priceVideoFX1_15s: 3,
  priceVideoFX2_4s: 6,
  priceVideoFX2_8s: 4,
  priceVideoFX2_12s: 6,
  priceVideoFX3_4s: 4,
  priceVideoFX3_6s: 5,
  priceVideoFX3_8s: 6,
  priceAsset_DriftPath: 2,
};

export const DEFAULT_PROVIDER_COSTS: Record<
  (typeof COST_KEYS)[number],
  number
> = {
  costPicDrift_5s: 0.35,
  costPicDrift_10s: 0.7,
  costPicDrift_Plus_5s: 0.56,
  costPicDrift_Plus_10s: 1.12,
  costPicFX_Standard: 0.08,
  costPicFX_Nano: 0.12,
  costPicFX_Gpt2: 0.155,
  costPicFX_Carousel: 0.2,
  costPicFX_Batch: 0.08,
  costEditor_Pro: 0.1,
  costEditor_Enhance: 0.12,
  costEditor_Convert: 0.08,
  costVideoFX1_10s: 0.2,
  costVideoFX1_15s: 0.3,
  costVideoFX2_4s: 1.21,
  costVideoFX2_8s: 2.42,
  costVideoFX2_12s: 3.63,
  costVideoFX3_4s: 1.6,
  costVideoFX3_6s: 2.4,
  costVideoFX3_8s: 3.2,
  costAsset_DriftPath: 0.35,
};

const normalizeCost = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 0;
  // Guard against accidental decimal USD values landing in credit fields.
  return Math.max(1, Math.round(n));
};

const isDemoPicdriftUser = (user: any) =>
  user?.isDemo === true &&
  user?.view === "PICDRIFT" &&
  user?.creditSystem === "INTERNAL" &&
  (user?.organization?.isDefault === true || !user?.organizationId);

export const ADMIN_CREDIT_LIMITS_MARKER = "[ADMIN_CREDIT_LIMITS_ENABLED]";

export const hasAdminCreditLimitsEnabled = (user: any) => {
  const role = String(user?.role || "").toUpperCase();
  if (role !== "ADMIN" && role !== "SUPERADMIN") return true;
  return String(user?.adminNotes || "").includes(ADMIN_CREDIT_LIMITS_MARKER);
};

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

  // 5. Veo 3.1
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
  if (!hasAdminCreditLimitsEnabled(user)) {
    return 0;
  }
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
