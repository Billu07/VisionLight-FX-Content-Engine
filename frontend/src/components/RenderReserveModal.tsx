import { motion, AnimatePresence } from "framer-motion";

interface RenderReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  prices: any;
  isCommercial: boolean;
}

export function RenderReserveModal({
  isOpen,
  onClose,
  prices,
  isCommercial,
}: RenderReserveModalProps) {
  if (!isOpen) return null;

  const formatPrice = (price: number) => {
    if (price === undefined || price === null) return "N/A";
    return isCommercial ? `$${price.toFixed(2)}` : `${price} Credits`;
  };

  const PriceCard = ({ label, value, sublabel }: { label: string; value: any; sublabel?: string }) => (
    <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10 hover:border-white/20 transition-all">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{formatPrice(value)}</div>
      {sublabel && <div className="text-[10px] text-gray-500 mt-1 italic">{sublabel}</div>}
    </div>
  );

  const SectionHeader = ({ icon, title, colorClass }: { icon: string; title: string; colorClass: string }) => (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xl opacity-80">{icon}</span>
      <h3 className={`text-sm font-bold uppercase tracking-[0.2em] ${colorClass}`}>
        {title}
      </h3>
      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent ml-2" />
    </div>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="bg-[#0f1115] border border-white/10 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div>
              <h2 className="text-xl font-medium text-white tracking-tight">
                Render Reserve
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Transparent pricing for your creative workflow.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-8 overflow-y-auto custom-scrollbar space-y-12">
            
            {/* PICDRIFT SERIES */}
            <section>
              <SectionHeader icon="📸" title="PicDrift Series" colorClass="text-pink-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <PriceCard label="Standard (5s)" value={prices?.pricePicDrift_5s} sublabel="Pro Performance" />
                <PriceCard label="Standard (10s)" value={prices?.pricePicDrift_10s} sublabel="Pro Performance" />
                <PriceCard label="Plus (5s)" value={prices?.pricePicDrift_Plus_5s} sublabel="Ultra Fidelity" />
                <PriceCard label="Plus (10s)" value={prices?.pricePicDrift_Plus_10s} sublabel="Ultra Fidelity" />
              </div>
            </section>

            {/* VIDEO FX SERIES */}
            <section>
              <SectionHeader icon="🎬" title="Video FX Engine" colorClass="text-blue-400" />
              <div className="space-y-6">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-3 ml-1">Video FX 1 & 2</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <PriceCard label="FX 1 (10s)" value={prices?.priceVideoFX1_10s} />
                    <PriceCard label="FX 1 (15s)" value={prices?.priceVideoFX1_15s} />
                    <PriceCard label="FX 2 (4s/8s)" value={prices?.priceVideoFX2_4s} />
                    <PriceCard label="FX 2 (12s)" value={prices?.priceVideoFX2_12s} />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-3 ml-1">Video FX 3</div>
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
              <SectionHeader icon="🎨" title="Pic FX & Studio Tools" colorClass="text-violet-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <PriceCard label="Standard Image" value={prices?.pricePicFX_Standard} />
                <PriceCard label="Carousel (14 images)" value={prices?.pricePicFX_Carousel} />
                <PriceCard label="Drift Path Tool" value={prices?.priceAsset_DriftPath} />
                <PriceCard label="Magic Editor" value={prices?.priceEditor_Standard} />
                <PriceCard label="Pro Editor" value={prices?.priceEditor_Pro} />
                <PriceCard label="Enhance / Upscale" value={prices?.priceEditor_Enhance} />
                <PriceCard label="Format Convert" value={prices?.priceEditor_Convert} />
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-white/5 bg-white/[0.02] flex justify-between items-center">
             <div className="text-xs text-gray-500">
               * Prices are subject to change based on provider costs.
             </div>
            <button
              onClick={onClose}
              className="px-8 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all border border-white/10"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
