import { motion, AnimatePresence } from "framer-motion";

interface StockPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StockPhotosModal({ isOpen, onClose }: StockPhotosModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-[#0f111a] border border-gray-800 rounded-lg w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Minimal Header */}
            <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#0f111a]">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Stock Media Library
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Browse high-quality assets from Pexels
                </p>
              </div>
              <div className="flex items-center gap-4">
                <a 
                  href="https://www.pexels.com/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-medium text-gray-400 hover:text-white transition-colors underline decoration-gray-700 underline-offset-4"
                >
                  Open in Browser
                </a>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors font-mono text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Iframe Container */}
            <div className="flex-1 bg-white relative">
              <iframe
                src="https://www.pexels.com/"
                className="w-full h-full border-0"
                title="Pexels Stock Photos"
                allow="clipboard-write"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
              {/* Overlay hint if Pexels blocks framing (Browser behavior varies) */}
              <div className="absolute inset-0 pointer-events-none hidden">
                 {/* This div is just a placeholder in case we need to show error states later */}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
