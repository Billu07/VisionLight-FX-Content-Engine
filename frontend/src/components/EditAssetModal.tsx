import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { DriftFrameExtractor } from "./DriftFrameExtractor";
import { LoadingSpinner } from "./LoadingSpinner";
import { ProgressBar } from "./ProgressBar";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "original";
  type?: "IMAGE" | "VIDEO";
}

interface EditAssetModalProps {
  asset: Asset;
  onClose: () => void;
}

type EditorMode = "standard" | "pro" | "drift";

const DRIFT_PRESETS = [
  { label: "Front", h: 0, v: 0, z: 5, icon: "⏹️" },
  { label: "Side R", h: 90, v: 0, z: 5, icon: "➡️" },
  { label: "Side L", h: 270, v: 0, z: 5, icon: "⬅️" },
  { label: "Top", h: 0, v: 60, z: 5, icon: "⬇️" },
  { label: "Back", h: 180, v: 0, z: 5, icon: "↩️" },
  { label: "Macro", h: 30, v: 15, z: 9, icon: "🔍" },
];

export function EditAssetModal({
  asset: initialAsset,
  onClose,
}: EditAssetModalProps) {
  const queryClient = useQueryClient();
  const refFileInput = useRef<HTMLInputElement>(null);

  // History & State
  const [history, setHistory] = useState<Asset[]>([initialAsset]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAsset = history[currentIndex];

  const [activeTab, setActiveTab] = useState<EditorMode>("pro");
  const [isProcessing, setIsProcessing] = useState(false);

  // Text Edit State
  const [prompt, setPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [referenceAsset, setReferenceAsset] = useState<Asset | null>(null);
  const [showRefSelector, setShowRefSelector] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // Drift State
  const [driftParams, setDriftParams] = useState({
    horizontal: 0,
    vertical: 0,
    zoom: 5,
  });

  // Drift Video & Polling State
  const [driftVideoUrl, setDriftVideoUrl] = useState<string | null>(null);
  const [driftStatusMsg, setDriftStatusMsg] = useState("Processing...");
  const [driftProgress, setDriftProgress] = useState(0);

  // ✅ NEW: Track the specific Post ID for this Drift job
  const [driftPostId, setDriftPostId] = useState<string | null>(null);

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    enabled: showRefSelector,
  });

  // 1. RECOVERY LOGIC: Check if we were polling a post before refresh
  useEffect(() => {
    const pendingPostId = localStorage.getItem(
      `active_drift_post_${currentAsset.id}`
    );
    if (pendingPostId) {
      console.log("🔄 Found pending Drift Post, resuming polling...");
      setActiveTab("drift");
      setDriftPostId(pendingPostId);
      setIsProcessing(true);
    }
  }, [currentAsset.id]);

  // 2. POLLING EFFECT: Watch the Post ID (Like Regular PicDrift)
  useEffect(() => {
    if (!driftPostId) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiEndpoints.getPostStatus(driftPostId);
        const { status, progress, mediaUrl, error } = res.data;

        if (status === "PROCESSING") {
          setDriftStatusMsg(`Rendering Path... ${progress}%`);
          setDriftProgress(progress);
        } else if (status === "READY" || status === "COMPLETED") {
          clearInterval(interval);
          setDriftProgress(100);
          setDriftStatusMsg("Loading Video...");

          // Clean up local storage
          localStorage.removeItem(`active_drift_post_${currentAsset.id}`);
          setDriftPostId(null);

          // ✅ Show the video so user can extract frame
          setDriftVideoUrl(mediaUrl);
          setIsProcessing(false);

          // Refresh library (optional, if you want the video to appear there too)
          queryClient.invalidateQueries({ queryKey: ["assets"] });
        } else if (status === "FAILED") {
          clearInterval(interval);
          localStorage.removeItem(`active_drift_post_${currentAsset.id}`);
          setDriftPostId(null);
          setIsProcessing(false);
          alert("Drift Generation Failed: " + (error || "Unknown error"));
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, [driftPostId, currentAsset.id, queryClient]);

  // === MUTATION 1: TEXT EDIT ===
  const textEditMutation = useMutation({
    mutationFn: async () => {
      return apiEndpoints.editAsset({
        assetId: currentAsset.id,
        assetUrl: currentAsset.url,
        prompt: prompt,
        aspectRatio: "original",
        referenceUrl: referenceAsset?.url,
        mode: activeTab as "standard" | "pro",
      });
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: (res: any) => handleSuccess(res.data.asset),
    onError: (err: any) => alert("Edit failed: " + err.message),
    onSettled: () => setIsProcessing(false),
  });

  // === MUTATION 2: DRIFT PATH START (Updated) ===
  const driftStartMutation = useMutation({
    mutationFn: async () => {
      // ✅ This now calls the updated backend route that creates a POST
      return apiEndpoints.startDriftVideo({
        assetUrl: currentAsset.url,
        prompt: prompt,
        horizontal: driftParams.horizontal,
        vertical: driftParams.vertical,
        zoom: driftParams.zoom,
      });
    },
    onMutate: () => {
      setIsProcessing(true);
      setDriftStatusMsg("Initiating Drift Engine...");
      setDriftProgress(5);
    },
    onSuccess: (res: any) => {
      // ✅ We receive a postId now
      const newPostId = res.data.postId;
      console.log("✅ Drift Job Started. Post ID:", newPostId);

      setDriftPostId(newPostId);
      localStorage.setItem(`active_drift_post_${currentAsset.id}`, newPostId);
    },
    onError: (err: any) => {
      alert("Drift Start Failed: " + err.message);
      setIsProcessing(false);
    },
  });

  // EXTRACT FRAME HANDLER (Saves the specific frame user selected)
  const handleFrameExtraction = async (blob: Blob) => {
    const file = new File([blob], "drift_frame.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", file);
    formData.append("raw", "true"); // Prevent resizing, keep exact frame

    try {
      setIsProcessing(true);
      setDriftStatusMsg("Saving extracted frame...");
      const res = await apiEndpoints.uploadAssetSync(formData);
      if (res.data.success) {
        handleSuccess(res.data.asset); // Add to history
        setDriftVideoUrl(null); // Close video player, back to editor
      }
    } catch (e: any) {
      alert("Failed to save frame: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuccess = (newAsset: Asset) => {
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(newAsset);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
    if (activeTab !== "drift") setPrompt("");
    queryClient.invalidateQueries({ queryKey: ["assets"] });
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(currentAsset.url);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("image", blob, "current.jpg");
      formData.append("prompt", "Describe subject, lighting, and style.");
      return apiEndpoints.analyzeImage(formData);
    },
    onMutate: () => setIsAnalyzing(true),
    onSuccess: (res: any) =>
      setPrompt((prev) => (prev ? prev + "\n" : "") + res.data.result),
    onSettled: () => setIsAnalyzing(false),
  });

  const uploadRefMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("raw", "true");
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
        {/* LEFT: CANVAS */}
        <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative border-r border-gray-800 group">
          {/* If Drift Video is Ready, Show Extractor */}
          {driftVideoUrl ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <DriftFrameExtractor
                videoUrl={driftVideoUrl}
                onExtract={handleFrameExtraction}
                onCancel={() => setDriftVideoUrl(null)}
              />
            </div>
          ) : (
            <>
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button
                  onClick={handleUndo}
                  disabled={currentIndex === 0}
                  className="p-2 bg-gray-800/80 rounded-full text-white disabled:opacity-30 hover:bg-gray-700 backdrop-blur-md"
                >
                  ↩️
                </button>
                <span className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-mono backdrop-blur-md flex items-center">
                  v{currentIndex + 1}
                </span>
                <button
                  onClick={handleRedo}
                  disabled={currentIndex === history.length - 1}
                  className="p-2 bg-gray-800/80 rounded-full text-white disabled:opacity-30 hover:bg-gray-700 backdrop-blur-md"
                >
                  ↪️
                </button>
              </div>

              {referenceAsset && activeTab !== "drift" && (
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

              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-30 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-4 w-full max-w-sm px-6">
                    {/* ✅ PROGRESS BAR FOR DRIFT */}
                    {activeTab === "drift" && driftPostId ? (
                      <ProgressBar
                        progress={driftProgress}
                        label={driftStatusMsg}
                      />
                    ) : (
                      // STANDARD SPINNER FOR OTHERS
                      <>
                        <LoadingSpinner size="lg" variant="neon" />
                        <span className="text-cyan-300 font-bold animate-pulse mt-4">
                          {driftStatusMsg === "Processing..."
                            ? "Processing..."
                            : driftStatusMsg}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <img
                src={currentAsset.url}
                className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
              />
            </>
          )}
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="w-full md:w-96 flex flex-col bg-gray-900">
          <div className="p-4 border-b border-gray-800 bg-gray-950">
            <div className="flex bg-gray-900 p-1 rounded-xl">
              {[
                { id: "standard", label: "Standard", icon: "⚡" },
                { id: "pro", label: "Pro", icon: "🧠" },
                { id: "drift", label: "Drift", icon: "🌀" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setActiveTab(mode.id as any)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex flex-col items-center gap-1 ${
                    activeTab === mode.id
                      ? "bg-cyan-600 text-white shadow-lg"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* === MODE: STANDARD / PRO === */}
            {activeTab !== "drift" && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                      Reference
                    </label>
                  </div>
                  {!showRefSelector ? (
                    <button
                      onClick={() => setShowRefSelector(true)}
                      className={`w-full border border-dashed rounded-xl p-3 flex items-center justify-center gap-2 transition-all ${
                        referenceAsset
                          ? "border-purple-500/50 bg-purple-500/10"
                          : "border-gray-700 hover:border-gray-500"
                      }`}
                    >
                      <span className="text-xs text-gray-300">
                        {referenceAsset ? "Change Reference" : "Add Reference"}
                      </span>
                    </button>
                  ) : (
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 animate-in slide-in-from-top-2">
                      <div className="flex gap-2 mb-3 border-b border-gray-800 pb-3">
                        <button
                          onClick={() => refFileInput.current?.click()}
                          disabled={isUploadingRef}
                          className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-white border border-gray-600 flex items-center justify-center gap-1"
                        >
                          {isUploadingRef ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            "Local"
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
                      <div className="text-[10px] text-gray-500 mb-2 uppercase font-bold">
                        Library:
                      </div>
                      <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
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
              </>
            )}

            {/* === MODE: DRIFT === */}
            {activeTab === "drift" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-3 gap-2">
                  {DRIFT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() =>
                        setDriftParams({
                          horizontal: preset.h,
                          vertical: preset.v,
                          zoom: preset.z,
                        })
                      }
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-2 text-center transition-all active:scale-95"
                    >
                      <span className="text-[10px] text-gray-300 font-bold block">
                        {preset.label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                  <h4 className="text-sm font-bold text-white mb-4">
                    Camera Controls
                  </h4>

                  {/* Horizontal */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Orbit</span>
                      <span className="text-cyan-400">
                        {driftParams.horizontal}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={driftParams.horizontal}
                      onChange={(e) =>
                        setDriftParams((p) => ({
                          ...p,
                          horizontal: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  {/* Vertical */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Elevation</span>
                      <span className="text-cyan-400">
                        {driftParams.vertical}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="1"
                      value={driftParams.vertical}
                      onChange={(e) =>
                        setDriftParams((p) => ({
                          ...p,
                          vertical: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  {/* Zoom */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Zoom</span>
                      <span className="text-cyan-400">{driftParams.zoom}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={driftParams.zoom}
                      onChange={(e) =>
                        setDriftParams((p) => ({
                          ...p,
                          zoom: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-green-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SHARED PROMPT INPUT */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  {activeTab === "drift"
                    ? "Subject Description"
                    : "Instruction"}
                </label>
                <button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={isAnalyzing || isProcessing}
                  className="text-[10px] bg-cyan-900/30 text-cyan-300 px-2 py-1 rounded border border-cyan-500/30 hover:bg-cyan-800/50"
                >
                  {isAnalyzing ? "Scanning..." : "Analyze Image"}
                </button>
              </div>
              <textarea
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                placeholder={
                  activeTab === "drift"
                    ? "e.g. 'A silver robot' (Helps maintain identity)"
                    : "e.g. 'Make it night time', 'Add neon lights'..."
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isProcessing}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (activeTab === "drift") driftStartMutation.mutate();
                    else if (prompt.trim()) textEditMutation.mutate();
                  }
                }}
              />
            </div>
          </div>

          <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex flex-col gap-3">
            {activeTab === "drift" ? (
              <button
                onClick={() => driftStartMutation.mutate()}
                disabled={isProcessing || !!driftPostId}
                className="w-full py-4 bg-gradient-to-r from-rose-600 to-orange-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? "Working..." : <span>🌀 Generate Path</span>}
              </button>
            ) : (
              <button
                onClick={() => textEditMutation.mutate()}
                disabled={!prompt.trim() || isProcessing}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? "Refining..." : <span>Apply Edit</span>}
              </button>
            )}
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
