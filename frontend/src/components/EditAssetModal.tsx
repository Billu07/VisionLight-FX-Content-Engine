import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { apiEndpoints } from "../lib/api";
import { DriftFrameExtractor } from "./DriftFrameExtractor";
import { LoadingSpinner } from "./LoadingSpinner";
import { ProgressBar } from "./ProgressBar";
import drift_icon from "../assets/drift_icon.png";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "original" | "1:1" | "custom";
  type?: "IMAGE" | "VIDEO";
  originalAssetId?: string | null;
}

interface EditAssetModalProps {
  asset: Asset;
  onClose: () => void;
  initialVideoUrl?: string;
  onEditSuccess?: (originalId: string, newAsset: Asset) => void;
}

type EditorMode = "pro" | "drift" | "convert";

interface DriftPreset {
  label: string;
  h: number;
  v: number;
  z: number;
  icon: string;
}

const DRIFT_PRESETS: DriftPreset[] = [
  { label: "Orbit Right", h: 5, v: 0, z: 0, icon: "↪️" },
  { label: "Orbit Left", h: -5, v: 0, z: 0, icon: "↩️" },
  { label: "Dolly Right", h: 3, v: 0, z: 0, icon: "➡️" },
  { label: "Dolly Left", h: -3, v: 0, z: 0, icon: "⬅️" },
  { label: "Crane Up", h: 0, v: 5, z: 0, icon: "⬆️" },
  { label: "Crane Down", h: 0, v: -5, z: 0, icon: "⬇️" },
  { label: "Zoom In", h: 0, v: 0, z: 5, icon: "🔍" },
];

export function EditAssetModal({
  asset: initialAsset,
  onClose,
  initialVideoUrl,
  onEditSuccess,
}: EditAssetModalProps) {
  const queryClient = useQueryClient();
  const refFileInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<Asset[]>([initialAsset]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAsset = history[currentIndex];

  const [activeTab, setActiveTab] = useState<EditorMode>(
    initialVideoUrl ? "drift" : "pro",
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // Text Edit State
  const [prompt, setPrompt] = useState("");
  const [referenceAsset, setReferenceAsset] = useState<Asset | null>(null);
  const [showRefSelector, setShowRefSelector] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // Convert Tab State
  const [convertTargetRatio, setConvertTargetRatio] = useState<
    "16:9" | "9:16" | "1:1"
  >("16:9");
  const [convertMode, setConvertMode] = useState<"auto" | "custom">("auto");

  // Drift State
  const [driftParams, setDriftParams] = useState({
    horizontal: 0,
    vertical: 0,
    zoom: 0,
  });

  const [driftVideoUrl, setDriftVideoUrl] = useState<string | null>(
    initialVideoUrl || null,
  );
  const [driftStatusMsg, setDriftStatusMsg] = useState("Processing...");
  const [driftProgress, setDriftProgress] = useState(0);
  const [driftPostId, setDriftPostId] = useState<string | null>(null);

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    enabled: showRefSelector,
  });

  // 1. RECOVERY LOGIC
  useEffect(() => {
    const pendingPostId = localStorage.getItem(
      `active_drift_post_${currentAsset.id}`,
    );
    if (pendingPostId) {
      setActiveTab("drift");
      setDriftPostId(pendingPostId);
      setIsProcessing(true);
    }
  }, [currentAsset.id]);

  // 2. POLLING LOGIC
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

          localStorage.removeItem(`active_drift_post_${currentAsset.id}`);
          setDriftPostId(null);
          setDriftVideoUrl(mediaUrl);
          setIsProcessing(false);

          queryClient.invalidateQueries({ queryKey: ["assets"] });
        } else if (status === "FAILED") {
          clearInterval(interval);
          localStorage.removeItem(`active_drift_post_${currentAsset.id}`);
          setDriftPostId(null);
          setIsProcessing(false);
          alert("Drift Generation Failed: " + (error || "Unknown error"));
        }
      } catch (e: any) {
        if (e.message?.includes("404") || e.response?.status === 404) {
          clearInterval(interval);
          localStorage.removeItem(`active_drift_post_${currentAsset.id}`);
          setDriftPostId(null);
          setIsProcessing(false);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [driftPostId, currentAsset.id, queryClient]);

  // === MUTATION 1: TEXT EDIT ===
  const textEditMutation = useMutation({
    mutationFn: async (customRatio?: string) => {
      // ✅ Identify the root parent to ensure it leaves the "Originals" tab
      const rootId = currentAsset.originalAssetId || currentAsset.id;

      return apiEndpoints.editAsset({
        assetId: currentAsset.id,
        originalAssetId: rootId, // 👈 Added this
        assetUrl: currentAsset.url,
        prompt: prompt,
        aspectRatio: customRatio || "original",
        referenceUrl: referenceAsset?.url,
        mode: activeTab as "standard" | "pro",
      });
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: (res: any) => handleSuccess(res.data.asset),
    onError: (err: any) => alert("Edit failed: " + err.message),
    onSettled: () => setIsProcessing(false),
  });

  // === MUTATION 2: ENHANCE ===
  const enhanceMutation = useMutation({
    mutationFn: async () => {
      // ✅ Identify the root parent
      const rootId = currentAsset.originalAssetId || currentAsset.id;

      return apiEndpoints.enhanceAsset({
        assetUrl: currentAsset.url,
        originalAssetId: rootId, // 👈 Added this
      });
    },
    onMutate: () => setIsEnhancing(true),
    onSuccess: (res: any) => {
      handleSuccess(res.data.asset);
      alert("Image Enhanced Successfully! ✨");
    },
    onError: (err: any) => alert("Enhancement failed: " + err.message),
    onSettled: () => setIsEnhancing(false),
  });

  // === MUTATION 3: RATIO CONVERSION (Auto Only) ===
  const ratioMutation = useMutation({
    mutationFn: async (targetRatio: string) => {
      // 1. Fetch current image as Blob
      const response = await fetch(currentAsset.url);
      const blob = await response.blob();
      const file = new File([blob], "convert.jpg", { type: "image/jpeg" });

      // 2. Upload to Sync Endpoint
      const formData = new FormData();
      formData.append("image", file);
      formData.append("raw", "false"); // Force Processing
      formData.append("aspectRatio", targetRatio);

      if (currentAsset.originalAssetId) {
        formData.append("originalAssetId", currentAsset.originalAssetId);
      } else {
        formData.append("originalAssetId", currentAsset.id);
      }

      return apiEndpoints.uploadAssetSync(formData);
    },
    onMutate: () => {
      setIsProcessing(true);
      setIsConverting(true);
      setDriftStatusMsg("Creating Your View...");
    },
    onSuccess: (res: any) => {
      handleSuccess(res.data.asset);
    },
    onError: (err: any) => alert("Conversion failed: " + err.message),
    onSettled: () => {
      setIsProcessing(false);
      setIsConverting(false);
    },
  });

  // === MUTATION 4: DRIFT START ===
  const driftStartMutation = useMutation({
    mutationFn: async () => {
      return apiEndpoints.startDriftVideo({
        assetUrl: currentAsset.url,
        prompt: prompt,
        horizontal: driftParams.horizontal,
        vertical: driftParams.vertical,
        zoom: driftParams.zoom,
        aspectRatio: currentAsset.aspectRatio,
      });
    },
    onMutate: () => {
      setIsProcessing(true);
      setDriftStatusMsg("Initiating Drift Engine...");
      setDriftProgress(5);
    },
    onSuccess: (res: any) => {
      const newPostId = res.data.postId;
      setDriftPostId(newPostId);
      localStorage.setItem(`active_drift_post_${currentAsset.id}`, newPostId);
    },
    onError: (err: any) => {
      alert("Drift Start Failed: " + err.message);
      setIsProcessing(false);
    },
  });

  // FRAME EXTRACTION
  const handleFrameExtraction = async (blob: Blob) => {
    const file = new File([blob], "drift_frame.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", file);
    formData.append("raw", "true");

    try {
      setIsProcessing(true);
      setDriftStatusMsg("Saving frame...");
      const res = await apiEndpoints.uploadAssetSync(formData);
      if (res.data.success) {
        handleSuccess(res.data.asset);
        setDriftVideoUrl(null);
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
    if (onEditSuccess) onEditSuccess(initialAsset.id, newAsset);
    queryClient.invalidateQueries({ queryKey: ["assets"] });
  };

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

  // Handle Convert Action
  const handleConvertAction = () => {
    if (convertMode === "auto") {
      ratioMutation.mutate(convertTargetRatio);
    } else {
      // Custom prompt convert uses Text Edit mutation but with target ratio
      if (!prompt.trim()) return alert("Please enter a prompt");
      textEditMutation.mutate(convertTargetRatio);
    }
  };

  const handleCrop = async () => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = Math.floor(completedCrop.width * scaleX);
    canvas.height = Math.floor(completedCrop.height * scaleY);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("image", file);
      formData.append("raw", "true");
      
      const activeProject = localStorage.getItem("visionlight_active_project");
      if (activeProject) formData.append("projectId", activeProject);
      
      setIsProcessing(true);
      try {
        const res = await apiEndpoints.uploadAssetSync(formData);
        if (res.data.success) {
          handleSuccess(res.data.asset);
          setIsCropping(false);
          setCrop(undefined);
          setCompletedCrop(undefined);
        }
      } catch (err: any) {
        alert("Crop failed: " + err.message);
      } finally {
        setIsProcessing(false);
      }
    }, "image/jpeg", 0.95);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col md:flex-row overflow-hidden shadow-2xl h-[90vh] relative">
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors font-bold border border-white/20"
        >
          ✕
        </button>

        {/* LEFT: CANVAS */}
        <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative border-r border-gray-800 group">
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
              {/* Undo/Redo */}
              <div className="absolute top-4 right-4 z-10 flex gap-2">
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

              {referenceAsset &&
                activeTab !== "drift" &&
                activeTab !== "convert" && (
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
                    {activeTab === "drift" && driftPostId ? (
                      <ProgressBar
                        progress={driftProgress}
                        label={driftStatusMsg}
                      />
                    ) : (
                      <>
                        <LoadingSpinner size="lg" variant="neon" />
                        <span className="text-cyan-300 font-bold animate-pulse mt-4">
                          {driftStatusMsg}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {isCropping ? (
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  className="max-h-[80vh] flex items-center justify-center"
                >
                  <img
                    ref={imgRef}
                    src={currentAsset.url}
                    className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
                    crossOrigin="anonymous"
                  />
                </ReactCrop>
              ) : (
                <img
                  src={currentAsset.url}
                  className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
                  crossOrigin="anonymous"
                />
              )}
            </>
          )}
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="w-full md:w-96 flex flex-col bg-gray-900">
          <div className="p-4 border-b border-gray-800 bg-gray-950">
            <div className="flex bg-gray-900 p-1 rounded-xl">
              {[
                { id: "pro", label: "Pro", icon: "🧠" },
                { id: "convert", label: "Convert", icon: "📐" },
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
            {/* ACTIONS: Crop / Enhance */}
            {activeTab !== "drift" && activeTab !== "convert" && (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsCropping(true)}
                  disabled={isProcessing || isEnhancing}
                  className="flex-1 text-xs bg-gray-800 text-cyan-300 px-3 py-2 rounded-lg border border-cyan-500/30 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <span>✂️</span> Crop
                </button>

                <button
                  onClick={() => enhanceMutation.mutate()}
                  disabled={isProcessing || isEnhancing}
                  className="flex-1 text-xs bg-gradient-to-r from-amber-600/20 to-orange-600/20 text-orange-300 px-3 py-2 rounded-lg border border-orange-500/30 hover:bg-orange-900/20 transition-colors flex items-center justify-center gap-2"
                >
                  {isEnhancing ? (
                    <LoadingSpinner size="sm" variant="light" />
                  ) : (
                    <span>
                      Enhance
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* CONVERT UI */}
            {activeTab === "convert" && (
              <div className="space-y-6 animate-in fade-in">
                {/* 1. Select Ratio */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Destination Ratio
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "16:9", label: "Landscape" },
                      { id: "9:16", label: "Portrait" },
                      { id: "1:1", label: "Square" },
                    ].map((ratio) => (
                      <button
                        key={ratio.id}
                        onClick={() => setConvertTargetRatio(ratio.id as any)}
                        className={`py-3 text-xs font-bold rounded-lg border transition-all ${
                          convertTargetRatio === ratio.id
                            ? "bg-purple-600 border-purple-500 text-white"
                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                        }`}
                      >
                        {ratio.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Mode Select */}
                <div className="bg-gray-800/50 p-1 rounded-lg flex border border-gray-700">
                  <button
                    onClick={() => setConvertMode("auto")}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                      convertMode === "auto"
                        ? "bg-gray-700 text-white shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    ⚡ Auto Convert
                  </button>
                  <button
                    onClick={() => setConvertMode("custom")}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                      convertMode === "custom"
                        ? "bg-gray-700 text-white shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    ✏️ Custom Prompt
                  </button>
                </div>

                {/* 3. Custom Prompt Input */}
                {convertMode === "custom" && (
                  <div className="animate-in slide-in-from-top-2">
                    <textarea
                      className="w-full h-24 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                      placeholder="e.g. 'Expand the sky and add clouds'"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </div>
                )}

                {/* 4. Action Button */}
                <button
                  onClick={handleConvertAction}
                  disabled={isProcessing || isConverting}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isConverting ? (
                    <>
                      <LoadingSpinner size="sm" variant="light" />
                      <span>Converting...</span>
                    </>
                  ) : (
                    <span>
                      🔄 Convert to {convertTargetRatio}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* PRO UI */}
            {activeTab === "pro" && (
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

                {/* Prompt Box */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Instruction
                    </label>
                  </div>
                  <textarea
                    className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                    placeholder="e.g. 'Make it night time', 'Add neon lights'..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isProcessing}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (prompt.trim()) textEditMutation.mutate(undefined);
                      }
                    }}
                  />
                </div>
              </>
            )}

            {/* DRIFT UI */}
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
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-2 text-center transition-all active:scale-95 flex flex-col items-center"
                    >
                      <span className="text-lg">{preset.icon}</span>
                      <span className="text-[9px] text-gray-300 font-bold block mt-1">
                        {preset.label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                  <h4 className="text-sm font-bold text-white mb-4">
                    Camera Rig
                  </h4>

                  {/* Horizontal */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Orbit (H)</span>
                      <span className="text-cyan-400">
                        {driftParams.horizontal}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="10"
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
                    <div className="flex justify-between text-[8px] text-gray-600">
                      <span>Left</span>
                      <span>Center</span>
                      <span>Right</span>
                    </div>
                  </div>

                  {/* Vertical */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Elevation (V)</span>
                      <span className="text-purple-400">
                        {driftParams.vertical}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="10"
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
                    <div className="flex justify-between text-[8px] text-gray-600">
                      <span>Down</span>
                      <span>Center</span>
                      <span>Up</span>
                    </div>
                  </div>

                  {/* Zoom */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Zoom (Z)</span>
                      <span className="text-green-400">{driftParams.zoom}</span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="10"
                      step="0.5"
                      value={driftParams.zoom}
                      onChange={(e) =>
                        setDriftParams((p) => ({
                          ...p,
                          zoom: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-green-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-gray-600">
                      <span>Out</span>
                      <span>Neutral</span>
                      <span>In</span>
                    </div>
                  </div>
                </div>

                {/* Prompt Box */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Subject Description (Optional)
                    </label>
                  </div>
                  <textarea
                    className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                    placeholder="e.g. 'A silver robot' (Helps maintain identity)"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isProcessing}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        driftStartMutation.mutate();
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex flex-col gap-3">
            {isCropping ? (
              <>
                <button
                  onClick={handleCrop}
                  disabled={!completedCrop?.width || !completedCrop?.height || isProcessing}
                  className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? "Cropping..." : "Confirm Crop"}
                </button>
                <button
                  onClick={() => {
                    setIsCropping(false);
                    setCrop(undefined);
                  }}
                  disabled={isProcessing}
                  className="w-full py-2 text-gray-500 hover:text-white text-sm"
                >
                  Cancel Crop
                </button>
              </>
            ) : activeTab === "drift" ? (
              <button
                onClick={() => driftStartMutation.mutate()}
                disabled={isProcessing || !!driftPostId}
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-violet-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isProcessing ? (
                  "Processing Path..."
                ) : (
                  <>
                    <img src={drift_icon} alt="Logo" className="h-5 w-auto" />
                    <span>
                      Generate Path
                    </span>
                  </>
                )}
              </button>
            ) : activeTab === "convert" ? (
              // Convert button handled in Convert UI block
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="w-full py-2 text-gray-500 hover:text-white text-sm"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => textEditMutation.mutate(undefined)}
                disabled={!prompt.trim() || isProcessing}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  "Refining..."
                ) : (
                  <span>
                    Apply Edit
                  </span>
                )}
              </button>
            )}

            {activeTab !== "convert" && (
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="w-full py-2 text-gray-500 hover:text-white text-sm"
              >
                Save & Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
