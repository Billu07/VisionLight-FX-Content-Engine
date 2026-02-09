import { motion, AnimatePresence } from "framer-motion";

interface RenderReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  prices: any; // Using any for flexibility with the backend response
  isCommercial: boolean;
}

export function RenderReserveModal({
  isOpen,
  onClose,
  prices,
  isCommercial,
}: RenderReserveModalProps) {
  if (!isOpen) return null;

  // Helper to format price
  const formatPrice = (price: number) => {
    if (price === undefined || price === null) return "N/A";
    return isCommercial ? `$${price.toFixed(2)}` : `${price} Credits`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gray-800/50">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  📊 Render Reserve Pricing
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Cost breakdown per generation type.
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
              {/* PICDRIFT */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">📸</span>
                  <h3 className="text-lg font-bold text-pink-400 uppercase tracking-wider">
                    PicDrift
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-pink-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Standard (5s)
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.pricePicDrift_5s)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-pink-500/20">
                    <div className="text-sm text-gray-400 mb-1">Long (10s)</div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.pricePicDrift_10s)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-pink-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Drift Path Tool
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceAsset_DriftPath)}
                    </div>
                  </div>
                </div>
              </section>

              {/* PIC FX */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎨</span>
                  <h3 className="text-lg font-bold text-violet-400 uppercase tracking-wider">
                    Pic FX
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Standard Image
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.pricePicFX_Standard)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">Carousel</div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.pricePicFX_Carousel)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Batch (Per Image)
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.pricePicFX_Batch)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Magic Editor
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceEditor_Standard)}
                    </div>
                  </div>
                   <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Pro Editor
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceEditor_Pro)}
                    </div>
                  </div>
                   <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Enhance / Upscale
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceEditor_Enhance)}
                    </div>
                  </div>
                   <div className="bg-gray-800/50 p-4 rounded-xl border border-violet-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Format Convert
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceEditor_Convert)}
                    </div>
                  </div>
                </div>
              </section>

              {/* VIDEO FX 1 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎬</span>
                  <h3 className="text-lg font-bold text-blue-400 uppercase tracking-wider">
                    Video FX 1
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-blue-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Standard (10s)
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceVideoFX1_10s)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-blue-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Extended (15s)
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceVideoFX1_15s)}
                    </div>
                  </div>
                </div>
              </section>

              {/* VIDEO FX 2 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎥</span>
                  <h3 className="text-lg font-bold text-cyan-400 uppercase tracking-wider">
                    Video FX 2
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-cyan-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Short (4s/8s)
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceVideoFX2_4s)}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-cyan-500/20">
                    <div className="text-sm text-gray-400 mb-1">
                      Long (12s)
                    </div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(prices?.priceVideoFX2_12s)}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 bg-gray-800/50 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
