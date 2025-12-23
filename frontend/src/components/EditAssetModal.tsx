import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  // Reference Image State
  const [referenceAsset, setReferenceAsset] = useState<Asset | null>(null);
  const [showRefSelector, setShowRefSelector] = useState(false);

  // Fetch all assets to choose a reference from
  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    // Only fetch if the drawer is open to save bandwidth
    enabled: showRefSelector,
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      return apiEndpoints.editAsset({
        assetId: asset.id,
        assetUrl: asset.url,
        prompt: prompt,
        aspectRatio: asset.aspectRatio,
        referenceUrl: referenceAsset?.url, // 👈 Send reference if selected
      });
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      alert("Success! New asset created.");
      onClose();
    },
    onError: (err: any) => {
      alert("Edit failed: " + err.message);
      setIsProcessing(false);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col md:flex-row overflow-hidden shadow-2xl h-[85vh]">
        {/* LEFT: CANVAS AREA */}
        <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative border-r border-gray-800">
          {/* Main Image */}
          <div className="relative max-h-[80%] max-w-full group">
            <img
              src={asset.url}
              alt="Target"
              className="max-h-full object-contain rounded-lg border border-gray-700"
            />
            <span className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
              TARGET
            </span>
          </div>

          {/* Reference Image Overlay (Bottom Right) */}
          {referenceAsset && (
            <div className="absolute bottom-4 right-4 w-40 border-2 border-purple-500 rounded-lg overflow-hidden bg-gray-800 shadow-2xl z-10">
              <div className="relative aspect-video">
                <img
                  src={referenceAsset.url}
                  className="w-full h-full object-cover opacity-90"
                />
                <button
                  onClick={() => setReferenceAsset(null)}
                  className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 flex items-center justify-center text-xs rounded-full hover:bg-red-500"
                >
                  ✕
                </button>
              </div>
              <div className="bg-purple-900/90 text-[10px] text-center py-1 text-white font-bold tracking-wide">
                REFERENCE
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="w-full md:w-96 flex flex-col bg-gray-900">
          {/* Header */}
          <div className="p-6 border-b border-gray-800">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span></span> Your Edit Studio
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Advanced multi-image editing & style transfer.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. Reference Selector */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                  Reference Image (Optional)
                </label>
                <button
                  onClick={() => setShowRefSelector(!showRefSelector)}
                  className="text-xs text-gray-400 hover:text-white underline"
                >
                  {showRefSelector
                    ? "Close Library"
                    : referenceAsset
                    ? "Change"
                    : "Select Image"}
                </button>
              </div>

              {showRefSelector ? (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar bg-gray-950 p-2 rounded-lg border border-gray-800">
                  {Array.isArray(allAssets) &&
                    allAssets.map((a: Asset) => (
                      <img
                        key={a.id}
                        src={a.url}
                        className={`w-full h-16 object-cover rounded cursor-pointer border-2 transition-all ${
                          referenceAsset?.id === a.id
                            ? "border-purple-500 opacity-100"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                        onClick={() => {
                          setReferenceAsset(a);
                          setShowRefSelector(false);
                        }}
                      />
                    ))}
                </div>
              ) : (
                <div
                  onClick={() => setShowRefSelector(true)}
                  className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    referenceAsset
                      ? "border-purple-500/50 bg-purple-500/10"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                >
                  {referenceAsset ? (
                    <div className="text-center">
                      <span className="text-purple-300 text-sm font-bold">
                        Image Selected
                      </span>
                      <p className="text-[10px] text-gray-400">
                        Click to change
                      </p>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <span className="text-2xl block mb-1">🖼️</span>
                      <span className="text-xs">Select Reference</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Instructions
              </label>
              <textarea
                className="w-full h-40 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed"
                placeholder={
                  referenceAsset
                    ? "E.g., 'Turn the character to match the angle of the reference image', 'Apply the texture from the reference to the target'..."
                    : "E.g., 'Add a red hat', 'Change background to Mars', 'Make it look like an oil painting'..."
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isProcessing}
              />
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
                <LoadingSpinner size="sm" variant="light" />
              ) : (
                "Generate New Asset"
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full py-2 text-gray-500 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
