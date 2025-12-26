import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16";
}

interface EditAssetModalProps {
  asset: Asset;
  onClose: () => void;
}

export function EditAssetModal({
  asset: initialAsset,
  onClose,
}: EditAssetModalProps) {
  const queryClient = useQueryClient();

  // === CONVERSATIONAL STATE ===
  // We store the history of edits so users can "Undo" (step back)
  const [history, setHistory] = useState<Asset[]>([initialAsset]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentAsset = history[currentIndex];

  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // === MUTATIONS ===

  // 1. EDIT MUTATION (Gemini 3 Pro)
  const editMutation = useMutation({
    mutationFn: async () => {
      // We always edit the CURRENTLY visible asset
      return apiEndpoints.editAsset({
        assetId: currentAsset.id,
        assetUrl: currentAsset.url,
        prompt: prompt,
        aspectRatio: currentAsset.aspectRatio,
        // We can add logic here to use a separate reference image if needed
        // for now, we focus on the conversational flow (Image + Text -> New Image)
      });
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: (response: any) => {
      const newAsset = response.data.asset;

      // Update History: Remove any "future" history if we were time-traveling, then add new
      const newHistory = history.slice(0, currentIndex + 1);
      newHistory.push(newAsset);

      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);

      setPrompt(""); // Clear prompt for next turn
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => {
      alert("Edit failed: " + err.message);
    },
    onSettled: () => setIsProcessing(false),
  });

  // 2. ANALYZE MUTATION (Gemini 2.5 Flash)
  // "See" the image to help write the prompt
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      // We need to fetch the blob to send it to the analysis endpoint
      const res = await fetch(currentAsset.url);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("image", blob, "current.jpg");
      formData.append(
        "prompt",
        "Describe this image in detail to help me edit it."
      );
      return apiEndpoints.analyzeImage(formData);
    },
    onMutate: () => setIsAnalyzing(true),
    onSuccess: (res: any) => {
      // Gemini 2.5 returns a text description
      // We append it to the prompt so the user can modify it
      setPrompt((prev) => (prev ? prev + "\n\n" : "") + res.data.result);
    },
    onError: (err: any) => alert("Analysis failed: " + err.message),
    onSettled: () => setIsAnalyzing(false),
  });

  // === HANDLERS ===

  const handleUndo = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleRedo = () => {
    if (currentIndex < history.length - 1) setCurrentIndex(currentIndex + 1);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col md:flex-row overflow-hidden shadow-2xl h-[90vh]">
        {/* LEFT: CANVAS AREA */}
        <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative border-r border-gray-800">
          {/* History Controls (Undo/Redo) */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button
              onClick={handleUndo}
              disabled={currentIndex === 0}
              className="p-2 bg-gray-800/80 rounded-full text-white disabled:opacity-30 hover:bg-gray-700 backdrop-blur-md"
              title="Undo"
            >
              ↩️
            </button>
            <span className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-mono backdrop-blur-md flex items-center">
              v{currentIndex + 1} / {history.length}
            </span>
            <button
              onClick={handleRedo}
              disabled={currentIndex === history.length - 1}
              className="p-2 bg-gray-800/80 rounded-full text-white disabled:opacity-30 hover:bg-gray-700 backdrop-blur-md"
              title="Redo"
            >
              ↪️
            </button>
          </div>

          {/* Main Image */}
          <div className="relative max-h-full max-w-full group">
            {isProcessing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 backdrop-blur-sm rounded-lg">
                <div className="flex flex-col items-center gap-3">
                  <LoadingSpinner size="lg" variant="neon" />
                  <span className="text-cyan-300 font-bold animate-pulse">
                    Gemini is Thinking...
                  </span>
                </div>
              </div>
            ) : null}

            <img
              src={currentAsset.url}
              alt="Target"
              className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
            />
          </div>
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="w-full md:w-96 flex flex-col bg-gray-900">
          {/* Header */}
          <div className="p-6 border-b border-gray-800">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              ✨ Studio FX
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Conversational editing powered by Gemini 3 Pro.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Conversation/Prompt Input */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Instruction
                </label>

                {/* Vision Button */}
                <button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={isAnalyzing || isProcessing}
                  className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-500/30 hover:bg-purple-800 flex items-center gap-1"
                >
                  {isAnalyzing ? "Analyzing..." : "👁️ Analyze Image"}
                </button>
              </div>

              <textarea
                className="w-full h-40 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                placeholder="Describe your change (e.g. 'Add a neon sign', 'Make it night time', 'Remove the chair')..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isProcessing}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (prompt.trim()) editMutation.mutate();
                  }
                }}
              />
              <p className="text-[10px] text-gray-500">
                Tip: Be specific. Mention lighting, style, or specific objects.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex flex-col gap-3">
            <button
              onClick={() => editMutation.mutate()}
              disabled={!prompt.trim() || isProcessing}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl text-white font-bold hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                "Refining..."
              ) : (
                <>
                  <span>✨</span> Apply Edit
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full py-2 text-gray-500 hover:text-white text-sm"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
