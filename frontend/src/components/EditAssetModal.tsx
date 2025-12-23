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

export function EditAssetModal({ asset, onClose }: EditAssetModalProps) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const editMutation = useMutation({
    mutationFn: async () => {
      return apiEndpoints.editAsset({
        assetId: asset.id,
        assetUrl: asset.url,
        prompt: prompt,
        aspectRatio: asset.aspectRatio,
      });
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      alert(" Image edited successfully! It has been saved as a new asset.");
      onClose();
    },
    onError: (err: any) => {
      alert("Edit failed: " + err.message);
      setIsProcessing(false);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl flex flex-col md:flex-row overflow-hidden shadow-2xl">
        {/* IMAGE PREVIEW */}
        <div className="flex-1 bg-black flex items-center justify-center p-4">
          <img
            src={asset.url}
            alt="Original"
            className="max-h-[50vh] md:max-h-[400px] object-contain rounded-lg border border-gray-800"
          />
        </div>

        {/* CONTROLS */}
        <div className="w-full md:w-80 p-6 flex flex-col gap-4 border-l border-gray-800">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Edit with AI</h3>
            <p className="text-xs text-gray-400">
              Describe changes, style transfers, or element additions.
            </p>
          </div>

          <textarea
            className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none"
            placeholder="E.g., 'Add a vintage filter', 'Put a wizard hat on the cat', 'Make it look like a Van Gogh painting'..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isProcessing}
          />

          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={() => editMutation.mutate()}
              disabled={!prompt.trim() || isProcessing}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-lg text-white font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <LoadingSpinner size="sm" variant="light" />
              ) : (
                "Generate Edit"
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full py-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
