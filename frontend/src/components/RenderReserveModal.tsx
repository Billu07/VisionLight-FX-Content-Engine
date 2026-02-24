import { motion, AnimatePresence } from "framer-motion";

interface RenderReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  prices: any;
  isCommercial: boolean;
  user?: any;
}

export function RenderReserveModal({
  isOpen,
  onClose,
  prices,
  isCommercial,
  user,
}: RenderReserveModalProps) {
  if (!isOpen) return null;

  const formatPrice = (price: number) => {
    if (price === undefined || price === null) return "N/A";
    if (user?.view === "PICDRIFT") return "1 Render";
    return isCommercial ? `$${price.toFixed(2)}` : `${price}`;
  };

  const PriceCard = ({ label, value, sublabel }: { label: string; value: any; sublabel?: string }) => (
    <div className="bg-white/[0.03] p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-base font-bold text-white">{formatPrice(value)}</div>
      {sublabel && <div className="text-[9px] text-gray-600 mt-1 uppercase tracking-tighter">{sublabel}</div>}
    </div>
  );

  const SectionHeader = ({ title, colorClass }: { title: string; colorClass: string }) => (
    <div className="flex items-center gap-3 mb-4">
      <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${colorClass}`}>
        {title}
      </h3>
      <div className="h-px flex-1 bg-white/5 ml-2" />
    </div>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#0f1115] border border-white/5 rounded-[2rem] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="px-10 py-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                System Valuation
              </h2>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">
                Operational resource costs for your current tier.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-gray-500 hover:text-white transition-all"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-10 overflow-y-auto custom-scrollbar space-y-16">
            
            {/* PICDRIFT SERIES */}
            <section>
              <SectionHeader title="PicDrift Series" colorClass="text-pink-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <PriceCard label="Standard (5s)" value={prices?.pricePicDrift_5s} sublabel="Pro Performance" />
                <PriceCard label="Standard (10s)" value={prices?.pricePicDrift_10s} sublabel="Pro Performance" />
                <PriceCard label="Plus (5s)" value={prices?.pricePicDrift_Plus_5s} sublabel="Ultra Fidelity" />
                <PriceCard label="Plus (10s)" value={prices?.pricePicDrift_Plus_10s} sublabel="Ultra Fidelity" />
              </div>
            </section>

            {/* VIDEO FX SERIES */}
            <section>
              <SectionHeader title="Video FX Engine" colorClass="text-indigo-400" />
              <div className="space-y-8">
                <div>
                  <div className="text-[9px] font-black text-gray-600 uppercase mb-4 ml-1 tracking-widest">Video FX 1 & 2</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <PriceCard label="FX 1 (10s)" value={prices?.priceVideoFX1_10s} />
                    <PriceCard label="FX 1 (15s)" value={prices?.priceVideoFX1_15s} />
                    <PriceCard label="FX 2 (Base)" value={prices?.priceVideoFX2_4s} />
                    <PriceCard label="FX 2 (Max)" value={prices?.priceVideoFX2_12s} />
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-black text-gray-600 uppercase mb-4 ml-1 tracking-widest">Video FX 3</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <PriceCard label="FX 3 (4s)" value={prices?.priceVideoFX3_4s} />
                    <PriceCard label="FX 3 (6s)" value={prices?.priceVideoFX3_6s} />
                    <PriceCard label="FX 3 (8s)" value={prices?.priceVideoFX3_8s} />
                  </div>
                </div>
              </div>
            </section>

            {/* CREATIVE TOOLS */}
            <section>
              <SectionHeader title="Pic FX & Studio Tools" colorClass="text-violet-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <PriceCard label="Standard Image" value={prices?.pricePicFX_Standard} />
                <PriceCard label="Carousel Batch" value={prices?.pricePicFX_Carousel} />
                <PriceCard label="Drift Path Tool" value={prices?.priceAsset_DriftPath} />
                <PriceCard label="Pro Editor" value={prices?.priceEditor_Pro} />
                <PriceCard label="Enhance / Upscale" value={prices?.priceEditor_Enhance} />
                <PriceCard label="Format Convert" value={prices?.priceEditor_Convert} />
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="px-10 py-8 border-t border-white/5 bg-white/[0.01] flex justify-between items-center">
             <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
               * Resource valuations adjusted by protocol costs.
             </div>
            <button
              onClick={onClose}
              className="px-10 py-3 bg-white text-black hover:bg-gray-200 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all"
            >
              Acknowledge
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
