import { AnimatePresence, motion } from "framer-motion";

interface RenderReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  prices: any;
  isCommercial: boolean;
  user?: any;
}

type ReserveItem = {
  label: string;
  key: string;
  wallet: string;
  note?: string;
};

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export function RenderReserveModal({
  isOpen,
  onClose,
  prices,
  isCommercial,
  user,
}: RenderReserveModalProps) {
  if (!isOpen) return null;

  const formatPrice = (value: any) => {
    const numeric = toNumber(value);
    if (numeric === null) return "N/A";
    if (isCommercial) return `$${numeric.toFixed(2)}`;
    const compact = Number.isInteger(numeric)
      ? numeric.toString()
      : numeric.toFixed(2);
    return `${compact} renders`;
  };

  const Section = ({
    title,
    subtitle,
    items,
    accent,
  }: {
    title: string;
    subtitle: string;
    items: ReserveItem[];
    accent: string;
  }) => (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${accent}`} />
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">
          {title}
        </h3>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{subtitle}</p>

      <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={`px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              index === items.length - 1 ? "" : "border-b border-white/6"
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{item.label}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-[0.08em]">
                Wallet: {item.wallet}
              </div>
              {item.note && (
                <div className="text-[11px] text-gray-400 mt-2">{item.note}</div>
              )}
            </div>
            <div className="shrink-0">
              <div className="text-lg font-black text-white tabular-nums">
                {formatPrice(prices?.[item.key])}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] text-right">
                Per Render
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const motionAndDrift: ReserveItem[] = [
    {
      label: "PicDrift Standard  -  5s",
      key: "pricePicDrift_5s",
      wallet: "PicDrift",
    },
    {
      label: "PicDrift Standard  -  10s",
      key: "pricePicDrift_10s",
      wallet: "PicDrift",
    },
    {
      label: "Kling 3.0  -  5s",
      key: "pricePicDrift_Plus_5s",
      wallet: "PicDrift+",
    },
    {
      label: "Kling 3.0  -  10s",
      key: "pricePicDrift_Plus_10s",
      wallet: "PicDrift+",
    },
    {
      label: "3DX Drift Path",
      key: "priceAsset_DriftPath",
      wallet: "Image FX",
      note: "Used when extracting camera path data from a source frame.",
    },
  ];

  const videoEngines: ReserveItem[] = [
    {
      label: "Topaz Upscale · 2x",
      key: "priceVideoFX1_10s",
      wallet: "Topaz Upscale",
      note: "Current UI default: 1080p.",
    },
    {
      label: "Topaz Upscale · 4x",
      key: "priceVideoFX1_15s",
      wallet: "Topaz Upscale",
    },
    {
      label: "Seedance 2.0 FAL · 4s",
      key: "priceVideoFX2_4s",
      wallet: "Seedance 2.0 FAL",
      note: "Resolution support in UI: 480p, 720p.",
    },
    {
      label: "Seedance 2.0 FAL · 8s",
      key: "priceVideoFX2_8s",
      wallet: "Seedance 2.0 FAL",
    },
    {
      label: "Seedance 2.0 FAL · 12s",
      key: "priceVideoFX2_12s",
      wallet: "Seedance 2.0 FAL",
    },
    {
      label: "Video FX 3 · 4s",
      key: "priceVideoFX3_4s",
      wallet: "Video FX 3",
    },
    {
      label: "Video FX 3 · 6s",
      key: "priceVideoFX3_6s",
      wallet: "Video FX 3",
    },
    {
      label: "Video FX 3 · 8s",
      key: "priceVideoFX3_8s",
      wallet: "Video FX 3",
    },
  ];

  const imageAndEditor: ReserveItem[] = [
    {
      label: "Pic FX Standard",
      key: "pricePicFX_Standard",
      wallet: "Image FX",
    },
    {
      label: "Pic FX Carousel",
      key: "pricePicFX_Carousel",
      wallet: "Image FX",
    },
    {
      label: "Pic FX Batch",
      key: "pricePicFX_Batch",
      wallet: "Image FX",
    },
    {
      label: "Pic FX Editor",
      key: "priceEditor_Pro",
      wallet: "Image FX",
    },
    {
      label: "Enhance / Upscale",
      key: "priceEditor_Enhance",
      wallet: "Image FX",
    },
    {
      label: "Format Convert",
      key: "priceEditor_Convert",
      wallet: "Image FX",
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg p-3 sm:p-5"
      >
        <div className="h-full w-full flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative w-full max-w-6xl max-h-[92vh] rounded-[2rem] overflow-hidden border border-white/10 bg-gradient-to-b from-[#10131a] to-[#0a0d13] shadow-[0_30px_120px_rgba(0,0,0,0.6)]"
          >
            <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

            <div className="relative px-6 sm:px-10 pt-7 sm:pt-9 pb-6 border-b border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300 font-black">
                    Render Reserve
                  </div>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Cost Matrix
                  </h2>
                  <p className="mt-3 text-sm text-gray-400 max-w-3xl">
                    Per-render valuation across engines and tools. This view maps each
                    operation to its wallet so pricing context remains consistent.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="h-10 w-10 rounded-full border border-white/15 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close modal"
                >
                  x
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-200 font-bold">
                    Billing Mode
                  </div>
                  <div className="text-sm text-white font-semibold mt-1">
                    {isCommercial ? "Commercial (USD pricing)" : "Render Reserve (unit pricing)"}
                  </div>
                </div>
                <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-indigo-200 font-bold">
                    Policy Note
                  </div>
                  <div className="text-sm text-white font-semibold mt-1">
                    Tenant overrides may adjust final debit at generation time.
                  </div>
                </div>
              </div>
            </div>

            <div className="relative px-6 sm:px-10 py-6 sm:py-8 overflow-y-auto custom-scrollbar space-y-10 max-h-[calc(92vh-210px)]">
              <Section
                title="Motion And Drift"
                subtitle="PicDrift operations and path extraction costs."
                items={motionAndDrift}
                accent="bg-pink-400"
              />
              <Section
                title="Video Engines"
                subtitle="Topaz Upscale, Seedance 2.0 FAL, and Video FX 3 tiers."
                items={videoEngines}
                accent="bg-cyan-400"
              />
              <Section
                title="Image And Editor"
                subtitle="Pic FX generation and asset editor operations."
                items={imageAndEditor}
                accent="bg-violet-400"
              />
            </div>

            <div className="px-6 sm:px-10 py-5 border-t border-white/10 bg-black/20 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="text-[11px] text-gray-400">
                User scope: <span className="text-gray-200 font-semibold">{user?.view || "GENERAL"}</span>
              </div>
              <button
                onClick={onClose}
                className="px-7 py-2.5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-[0.14em] hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}





