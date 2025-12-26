import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "original";
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
  const refFileInput = useRef<HTMLInputElement>(null);

  // Conversation History
  const [history, setHistory] = useState<Asset[]>([initialAsset]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAsset = history[currentIndex];

  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Reference State
  const [referenceAsset, setReferenceAsset] = useState<Asset | null>(null);
  const [showRefSelector, setShowRefSelector] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // Fetch Library Assets (Only if selector is open)
  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    enabled: showRefSelector,
  });

  // 1. EDIT MUTATION
  const editMutation = useMutation({
    mutationFn: async () => {
      return apiEndpoints.editAsset({
        assetId: currentAsset.id,
        assetUrl: currentAsset.url,
        prompt: prompt,
        // ✅ CRITICAL: "original" tells Gemini to NOT crop/resize.
        // It will return an image with the exact same dimensions as the input.
        aspectRatio: "original",
        referenceUrl: referenceAsset?.url,
      });
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: (response: any) => {
      const newAsset = response.data.asset;

      // Add to history
      const newHistory = history.slice(0, currentIndex + 1);
      newHistory.push(newAsset);
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);

      setPrompt("");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => alert("Edit failed: " + err.message),
    onSettled: () => setIsProcessing(false),
  });

  // 2. ANALYZE MUTATION (Vision)
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(currentAsset.url);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("image", blob, "current.jpg");
      formData.append(
        "prompt",
        "Describe the lighting, style, and main subjects of this image."
      );
      return apiEndpoints.analyzeImage(formData);
    },
    onMutate: () => setIsAnalyzing(true),
    onSuccess: (res: any) =>
      setPrompt((prev) => (prev ? prev + "\n\n" : "") + res.data.result),
    onError: (err: any) => alert("Analysis failed: " + err.message),
    onSettled: () => setIsAnalyzing(false),
  });

  // 3. UPLOAD REFERENCE MUTATION
  const uploadRefMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("raw", "true"); // Upload raw for reference
      return apiEndpoints.uploadAssetSync(formData);
    },
    onMutate: () => setIsUploadingRef(true),
    onSuccess: (res: any) => {
      setReferenceAsset(res.data.asset);
      setShowRefSelector(false);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => alert("Reference upload failed: " + err.message),
    onSettled: () => setIsUploadingRef(false),
  });

  // Handlers
  const handleUndo = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };
  const handleRedo = () => {
    if (currentIndex < history.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handleRefFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) uploadRefMutation.mutate(e.target.files[0]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col md:flex-row overflow-hidden shadow-2xl h-[90vh]">
        {/* LEFT: CANVAS AREA */}
        <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative border-r border-gray-800 group">
          {/* History Controls */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button
              onClick={handleUndo}
              disabled={currentIndex === 0}
              className="p-2 bg-gray-800/80 rounded-full text-white disabled:opacity-30 hover:bg-gray-700 backdrop-blur-md"
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
            >
              ↪️
            </button>
          </div>

          {/* Reference Overlay (Picture-in-Picture) */}
          {referenceAsset && (
            <div className="absolute bottom-4 right-4 w-32 border-2 border-purple-500 rounded-lg overflow-hidden bg-gray-800 shadow-2xl z-20">
              <div className="relative aspect-video">
                <img
                  src={referenceAsset.url}
                  className="w-full h-full object-cover opacity-90"
                />
                <button
                  onClick={() => setReferenceAsset(null)}
                  className="absolute top-1 right-1 bg-red-600/80 text-white w-5 h-5 flex items-center justify-center text-xs rounded-full hover:bg-red-500"
                >
                  ✕
                </button>
              </div>
              <div className="bg-purple-900/90 text-[8px] text-center py-0.5 text-white font-bold tracking-wide">
                REFERENCE
              </div>
            </div>
          )}

          {/* Processing Spinner */}
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <LoadingSpinner size="lg" variant="neon" />
                <span className="text-cyan-300 font-bold animate-pulse">
                  Gemini is Thinking...
                </span>
              </div>
            </div>
          )}

          <img
            src={currentAsset.url}
            className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
          />
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="w-full md:w-96 flex flex-col bg-gray-900">
          <div className="p-6 border-b border-gray-800">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Magic Edit
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Conversational editing. Ask to change anything.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Reference Image Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                  Reference (Optional)
                </label>
                {referenceAsset && (
                  <span className="text-[10px] text-green-400">Active</span>
                )}
              </div>

              {!showRefSelector ? (
                <button
                  onClick={() => setShowRefSelector(true)}
                  className={`w-full border-2 border-dashed rounded-xl p-3 flex items-center justify-center gap-2 transition-all ${
                    referenceAsset
                      ? "border-purple-500/50 bg-purple-500/10"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <span className="text-xl">🖼️</span>
                  <span className="text-xs text-gray-300">
                    {referenceAsset
                      ? "Change Reference"
                      : "Add Reference Image"}
                  </span>
                </button>
              ) : (
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 animate-in slide-in-from-top-2">
                  {/* Upload New Option */}
                  <div className="flex gap-2 mb-3 border-b border-gray-800 pb-3">
                    <button
                      onClick={() => refFileInput.current?.click()}
                      disabled={isUploadingRef}
                      className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-white border border-gray-600 flex items-center justify-center gap-1"
                    >
                      {isUploadingRef ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        "Upload from Computer"
                      )}
                    </button>
                    <input
                      type="file"
                      ref={refFileInput}
                      className="hidden"
                      accept="image/*"
                      onChange={handleRefFileUpload}
                    />
                    <button
                      onClick={() => setShowRefSelector(false)}
                      className="px-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 text-xs"
                    >
                      Close
                    </button>
                  </div>

                  {/* Select from Library Option */}
                  <div className="text-[10px] text-gray-500 mb-2 uppercase font-bold">
                    Or Select from Library:
                  </div>
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {Array.isArray(allAssets) &&
                      allAssets.map((a: Asset) => (
                        <img
                          key={a.id}
                          src={a.url}
                          className="w-full h-12 object-cover rounded cursor-pointer border border-transparent hover:border-purple-500"
                          onClick={() => {
                            setReferenceAsset(a);
                            setShowRefSelector(false);
                          }}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Input */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Instruction
                </label>
                <button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={isAnalyzing || isProcessing}
                  className="text-[10px] bg-cyan-900/30 text-cyan-300 px-2 py-1 rounded border border-cyan-500/30 hover:bg-cyan-800/50 flex items-center gap-1"
                >
                  {isAnalyzing ? "Scanning..." : "👁️ Analyze Image"}
                </button>
              </div>
              <textarea
                className="w-full h-40 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                placeholder="E.g. 'Make it night time', 'Remove the cup', 'Style like the reference image'..."
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
                Tip: Press Enter to submit. Changes are applied on top of the
                current image.
              </p>
            </div>
          </div>

          <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex flex-col gap-3">
            <button
              onClick={() => editMutation.mutate()}
              disabled={!prompt.trim() || isProcessing}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? "Refining..." : <span>Apply Edit</span>}
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
