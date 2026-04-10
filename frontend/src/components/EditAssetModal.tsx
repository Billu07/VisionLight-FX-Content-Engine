import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { apiEndpoints, getCORSProxyUrl } from "../lib/api";
import { useAuth } from "../hooks/useAuth"; // 👈 Added this
import { DriftFrameExtractor } from "./DriftFrameExtractor";
import { LoadingSpinner } from "./LoadingSpinner";
import { ProgressBar } from "./ProgressBar";
import drift_icon from "../assets/drift_icon.png";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "original" | "1:1" | "custom" | "3DX_FRAME";
  type?: "IMAGE" | "VIDEO";
  originalAssetId?: string | null;
}

interface EditAssetModalProps {
  asset?: Asset;
  initialTab?: "pro" | "drift" | "convert";
  onClose: () => void;
  initialVideoUrl?: string;
  onEditSuccess?: (originalId: string, newAsset: Asset) => void;
}

type EditorMode = "pro" | "drift" | "convert";

export function EditAssetModal({
  asset: initialAsset,
  initialTab,
  onClose,
  initialVideoUrl,
  onEditSuccess,
}: EditAssetModalProps) {
  const queryClient = useQueryClient();
  const refFileInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<Asset[]>(initialAsset ? [initialAsset] : []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAsset = history[currentIndex];

  const [activeTab, setActiveTab] = useState<EditorMode>(
    initialTab || (initialVideoUrl ? "drift" : "pro"),
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);

  // Text Edit State
  const [prompt, setPrompt] = useState("");
  const [referenceAsset, setReferenceAsset] = useState<Asset | null>(null);
  const [showRefSelector, setShowRefSelector] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // PromptFX State
  const [showPromptFxMenu, setShowPromptFxMenu] = useState(false);
  const [newPromptFxName, setNewPromptFxName] = useState("");
  const [newPromptFxText, setNewPromptFxText] = useState("");
  const [isAddingPromptFx, setIsAddingPromptFx] = useState(false);
  const [editingPromptFxIndex, setEditingPromptFxIndex] = useState<number | null>(null);
  const [isUploadingInitial, setIsUploadingInitial] = useState(false);

  const { systemPresets } = useAuth(); // 👈 Global presets from auth context

  const { data: promptFxList = [] } = useQuery({
    queryKey: ["prompt-fx"],
    queryFn: async () => {
      const res = await apiEndpoints.getPromptFx();
      return res.data.promptFx || [];
    },
  });

  const savePromptFxMutation = useMutation({
    mutationFn: (newPromptFx: { name: string; prompt: string }[]) =>
      apiEndpoints.savePromptFx(newPromptFx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-fx"] });
      setNewPromptFxName("");
      setNewPromptFxText("");
      setIsAddingPromptFx(false);
      setEditingPromptFxIndex(null);
    },
  });

  const handleAddPromptFx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromptFxName.trim() || !newPromptFxText.trim()) return;
    
    let newList = [...promptFxList];
    if (editingPromptFxIndex !== null) {
      newList[editingPromptFxIndex] = { name: newPromptFxName.trim(), prompt: newPromptFxText.trim() };
    } else {
      newList.push({ name: newPromptFxName.trim(), prompt: newPromptFxText.trim() });
    }
    
    savePromptFxMutation.mutate(newList);
  };

  const handleRemovePromptFx = (indexToRemove: number) => {
    if (window.confirm("Are you sure you want to delete this prompt preset?")) {
      const newList = promptFxList.filter((_: any, idx: number) => idx !== indexToRemove);
      savePromptFxMutation.mutate(newList);
    }
  };

  // Convert Tab State
  const [convertTargetRatio, setConvertTargetRatio] = useState<
    "16:9" | "9:16" | "1:1"
  >("16:9");
  const [convertMode, setConvertMode] = useState<"auto" | "custom">("custom");

  // Drift State
  const driftParams = {
    horizontal: 0,
    vertical: 0,
    zoom: 0,
  };
  const [driftDuration, setDriftDuration] = useState<"5" | "10">("5");

  const [driftVideoUrl, setDriftVideoUrl] = useState<string | null>(
    initialVideoUrl || null,
  );
  const [driftStatusMsg, setDriftStatusMsg] = useState("Processing...");
  const [driftProgress, setDriftProgress] = useState(0);
  const [driftPostId, setDriftPostId] = useState<string | null>(null);

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    enabled: showRefSelector || !currentAsset,
  });

  // 1. RECOVERY LOGIC
  useEffect(() => {
    if (!currentAsset) return;
    const pendingPostId = localStorage.getItem(
      `active_drift_post_${currentAsset.id}`,
    );
    if (pendingPostId) {
      setActiveTab("drift");
      setDriftPostId(pendingPostId);
      setIsProcessing(true);
    }
  }, [currentAsset?.id]);

  // 2. POLLING LOGIC
  useEffect(() => {
    if (!driftPostId || !currentAsset) return;

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
  }, [driftPostId, currentAsset?.id, queryClient]);

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
      const response = await fetch(getCORSProxyUrl(currentAsset.url));
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

      const activeProject = localStorage.getItem("visionlight_active_project");
      if (activeProject) {
        formData.append("projectId", activeProject);
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
      const activeProject = localStorage.getItem("visionlight_active_project") || undefined;
      return apiEndpoints.startDriftVideo({
        assetUrl: currentAsset.url,
        prompt: prompt,
        horizontal: driftParams.horizontal,
        vertical: driftParams.vertical,
        zoom: driftParams.zoom,
        aspectRatio: currentAsset.aspectRatio,
        duration: driftDuration,
        projectId: activeProject,
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
    formData.append("aspectRatio", "3DX_FRAME");

    const activeProject = localStorage.getItem("visionlight_active_project");
    if (activeProject) {
      formData.append("projectId", activeProject);
    }

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
    setIsImageLoading(true);
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(newAsset);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
    if (activeTab !== "drift") setPrompt("");
    if (onEditSuccess && initialAsset) onEditSuccess(initialAsset.id, newAsset);
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
      completedCrop.height * scaleY,
    );

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
        const formData = new FormData();
        formData.append("image", file);
        formData.append("raw", "true");

        const activeProject = localStorage.getItem(
          "visionlight_active_project",
        );
        if (activeProject) formData.append("projectId", activeProject);

        setIsProcessing(true);
        try {
          const res = await apiEndpoints.uploadAssetSync(formData);
          if (res.data.success) {
            handleSuccess(res.data.asset);
            setIsCropping(false);
            setCrop(undefined);
            setCompletedCrop(undefined);
            setCropAspect(undefined);
          }
        } catch (err: any) {
          alert("Crop failed: " + err.message);
        } finally {
          setIsProcessing(false);
        }
      },
      "image/jpeg",
      0.95,
    );
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (width && height) {
      const aspect = cropAspect || 1;
      const initialCrop = makeAspectCrop({ unit: '%', width: 100 }, aspect, width, height);
      initialCrop.x = 0;
      initialCrop.y = 0;
      setCrop(initialCrop);
    }
  };

  useEffect(() => {
    if (isCropping && imgRef.current) {
      const { width, height } = imgRef.current;
      if (width && height) {
        const aspect = cropAspect || 1;
        const initialCrop = makeAspectCrop({ unit: '%', width: 100 }, aspect, width, height);
        initialCrop.x = 0;
        initialCrop.y = 0;
        setCrop(initialCrop);
      }
    }
  }, [cropAspect, isCropping]);

  const isRendering = isProcessing || isImageLoading || isEnhancing || isConverting;

  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-[140] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-800 transition-colors animate-in slide-in-from-bottom-5"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex flex-col">
          <span className="text-white font-bold text-sm">🎨 Editor Running</span>
          <span className="text-purple-400 text-xs font-mono tracking-widest animate-pulse">{isRendering ? driftStatusMsg : "Running in background..."}</span>
        </div>
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onClose(); 
          }} 
          className="text-gray-400 hover:text-red-500 font-bold ml-2 p-2"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col md:flex-row overflow-hidden shadow-2xl h-[90vh] relative">
        {/* CLOSE BUTTON */}
        <div className="absolute top-4 left-4 z-50 flex gap-2">
          <button
            onClick={onClose}
            className="bg-black/50 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors font-bold border border-white/20"
          >
            ✕
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="bg-black/50 hover:bg-cyan-600 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors font-bold border border-white/20 pb-2"
          >
            _
          </button>
        </div>

        {/* LEFT: CANVAS */}
        <div className="flex-1 bg-black flex flex-col border-r border-gray-800 relative group overflow-hidden">
          {/* EDITOR TITLE BAR */}
          <div className="w-full bg-black border-b border-gray-800 p-3 sm:p-4 flex justify-center items-center z-30 shadow-md shrink-0">
            <div className="text-white px-6 py-1.5 rounded-full font-bold tracking-widest text-xs sm:text-sm border border-white/10 bg-gray-800/80 shadow-inner flex items-center gap-2">
              {activeTab === "pro" && "PicFX Editor"}
              {activeTab === "convert" && "Convert FX"}
              {activeTab === "drift" && (
                <div className="flex items-center gap-2">
                  <img src={drift_icon} alt="Drift" className="h-4 w-auto" />
                  <span>Camera</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {driftVideoUrl ? (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <DriftFrameExtractor
                  videoUrl={driftVideoUrl}
                  onExtract={handleFrameExtraction}
                  onCancel={() => setDriftVideoUrl(null)}
                />
              </div>
            ) : !currentAsset ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-center animate-in fade-in">
                <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center border border-gray-700">
                  <span className="text-4xl text-gray-500">📷</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Upload a Reference Image</h3>
                  <p className="text-gray-400 max-w-sm">To use the 3DX Editor, you need a starting image. Upload one or select from your library.</p>
                </div>
                <div className="flex gap-4">
                  <label className={`cursor-pointer px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${isUploadingInitial ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploadingInitial ? <LoadingSpinner size="sm" variant="light" /> : "Upload Image"}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      disabled={isUploadingInitial}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsUploadingInitial(true);
                        try {
                          const formData = new FormData();
                          formData.append("image", file);
                          formData.append("raw", "true");
                          const activeProject = localStorage.getItem("visionlight_active_project");
                          if (activeProject) formData.append("projectId", activeProject);

                          const res = await apiEndpoints.uploadAssetSync(formData);
                          if (res.data.success && res.data.asset) {
                            setHistory([res.data.asset]);
                            setCurrentIndex(0);
                            queryClient.invalidateQueries({ queryKey: ["assets"] });
                          }
                        } catch (err: any) {
                          alert("Upload failed: " + err.message);
                        } finally {
                          setIsUploadingInitial(false);
                        }
                      }}
                    />
                  </label>
                </div>
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
                          src={getCORSProxyUrl(referenceAsset.url)}
                          className="w-full h-full object-cover opacity-90"
                          crossOrigin="anonymous"
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

                {(isProcessing || isImageLoading) && (
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
                            {isImageLoading ? "Loading Image..." : driftStatusMsg}
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
                    aspect={cropAspect}
                    className="max-h-[80vh] flex items-center justify-center"
                  >
                    <img
                      ref={imgRef}
                      src={getCORSProxyUrl(currentAsset.url)}
                      className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
                      crossOrigin="anonymous"
                      onLoad={onImageLoad}
                    />
                  </ReactCrop>
                ) : (
                  <img
                    src={getCORSProxyUrl(currentAsset.url)}
                    className="max-h-[80vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
                    crossOrigin="anonymous"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="w-full md:w-96 flex flex-col bg-gray-900">
          <div className="p-4 border-b border-gray-800 bg-gray-950">
            <div className="flex bg-gray-900 p-1 rounded-xl">
              {[
                { id: "pro", label: "PicFX" },
                { id: "convert", label: "Convert" },
                { id: "drift", label: <div className="flex items-center gap-2"><img src={drift_icon} alt="3DX" className="h-3 w-auto" /></div> },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    setActiveTab(mode.id as any);
                    setIsCropping(false);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex flex-col items-center gap-1 ${activeTab === mode.id
                    ? "bg-purple-600 text-white shadow-lg"
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
                    <span>Enhance</span>
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
                        className={`py-3 text-xs font-bold rounded-lg border transition-all ${convertTargetRatio === ratio.id
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
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${convertMode === "auto"
                      ? "bg-pink-600 text-white shadow-sm"
                      : "text-gray-400 hover:text-white"
                      }`}
                  >
                    Auto Convert
                  </button>
                  <button
                    onClick={() => setConvertMode("custom")}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${convertMode === "custom"
                      ? "bg-pink-600 text-white shadow-sm"
                      : "text-gray-400 hover:text-white"
                      }`}
                  >
                    Custom Prompt
                  </button>
                </div>

                {/* 3. Custom Prompt Input */}
                {convertMode === "custom" && (
                  <div className="animate-in slide-in-from-top-2">
                    <textarea
                      className="w-full h-24 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                      placeholder="e.g. 'Expand the sky and add clouds'"
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        setIsCropping(false);
                      }}
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
                    <span>🔄 Convert to {convertTargetRatio}</span>
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
                      onClick={() => {
                        setShowRefSelector(true);
                        setIsCropping(false);
                      }}
                      className={`w-full border border-dashed rounded-xl p-3 flex items-center justify-center gap-2 transition-all ${referenceAsset
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
                              src={getCORSProxyUrl(a.url)}
                              className="w-full h-12 object-cover rounded cursor-pointer border border-transparent hover:border-purple-500"
                              crossOrigin="anonymous"
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
              <div className="space-y-6 animate-in fade-in h-full flex flex-col relative">
                
                {/* Duration Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Generation Duration
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDriftDuration("5")}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                        driftDuration === "5"
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      5 Seconds
                    </button>
                    <button
                      onClick={() => setDriftDuration("10")}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                        driftDuration === "10"
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      10 Seconds
                    </button>
                  </div>
                </div>

                {/* Prompt Box */}
                <div className="space-y-3 flex-1 flex flex-col min-h-[250px]">
                  <div className="flex justify-between items-end relative">
                    <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Subject Description
                    </label>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPromptFxMenu(!showPromptFxMenu);
                        }}
                        className="text-[10px] bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 px-3 py-1.5 rounded-md border border-indigo-500/30 flex items-center gap-1 transition-colors"
                      >
                        <span className="text-lg">✨</span> PromptFX
                      </button>

                      {/* PROMPT FX DROPDOWN */}
                      {showPromptFxMenu && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden">
                          <div className="p-3 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
                            <span className="text-xs font-bold text-indigo-300">
                              Saved Prompts
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setIsAddingPromptFx(true)}
                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors"
                              >
                                + New
                              </button>
                              <button
                                onClick={() => setShowPromptFxMenu(false)}
                                className="text-xs text-gray-400 hover:text-white hover:bg-gray-800 px-2 py-1 rounded transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {isAddingPromptFx && (
                            <form
                              onSubmit={handleAddPromptFx}
                              className="p-3 bg-gray-800 border-b border-gray-700 space-y-2"
                            >
                              <input
                                type="text"
                                placeholder="Preset Name..."
                                value={newPromptFxName}
                                onChange={(e) => setNewPromptFxName(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white"
                                required
                              />
                              <textarea
                                placeholder="Prompt text..."
                                value={newPromptFxText}
                                onChange={(e) => setNewPromptFxText(e.target.value)}
                                className="w-full h-16 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white resize-none"
                                required
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsAddingPromptFx(false)}
                                  className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          )}

                          <div className="max-h-48 overflow-y-auto">
                            {/* Global Presets */}
                            {systemPresets && systemPresets.length > 0 && (
                              <div className="bg-indigo-900/10">
                                <div className="px-3 py-1 bg-gray-950/50 text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] border-b border-gray-800">System Presets</div>
                                {systemPresets.map((pfx: any) => (
                                  <div
                                    key={pfx.id}
                                    className="group flex flex-col p-3 border-b border-gray-800 hover:bg-indigo-900/20 cursor-pointer transition-colors"
                                    onClick={() => {
                                      setPrompt(pfx.prompt);
                                      setShowPromptFxMenu(false);
                                    }}
                                  >
                                    <div className="flex justify-between items-start mb-1">
                                      <span className="text-xs font-bold text-indigo-200">
                                        {pfx.name}
                                      </span>
                                      <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded uppercase font-bold">Global</span>
                                    </div>
                                    <span className="text-[10px] text-gray-500 line-clamp-2">
                                      {pfx.prompt}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* User Presets */}
                            {promptFxList.length === 0 && !isAddingPromptFx && (!systemPresets || systemPresets.length === 0) ? (
                              <div className="p-4 text-center text-xs text-gray-500">
                                No saved prompts.
                              </div>
                            ) : (
                              promptFxList.map((pfx: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="group flex flex-col p-3 border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors"
                                  onClick={() => {
                                    setPrompt(pfx.prompt);
                                    setShowPromptFxMenu(false);
                                  }}
                                >
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-bold text-gray-200">
                                      {pfx.name}
                                    </span>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setNewPromptFxName(pfx.name);
                                          setNewPromptFxText(pfx.prompt);
                                          setEditingPromptFxIndex(idx);
                                          setIsAddingPromptFx(true);
                                        }}
                                        className="text-blue-400 hover:text-blue-300 text-xs"
                                      >
                                        ✎
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemovePromptFx(idx);
                                        }}
                                        className="text-red-500 hover:text-red-400 text-xs"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-gray-500 line-clamp-2">
                                    {pfx.prompt}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea
                    className="w-full flex-1 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none leading-relaxed placeholder-gray-500"
                    placeholder="e.g. Describe where you want the camera to move to create a path."
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
                <div className="flex gap-2 mb-2 bg-gray-950 p-1 rounded-lg border border-gray-700 overflow-x-auto custom-scrollbar">
                  {[
                    { label: "Free", value: undefined },
                    { label: "1:1", value: 1 },
                    { label: "16:9", value: 16 / 9 },
                    { label: "9:16", value: 9 / 16 },
                    { label: "4:3", value: 4 / 3 },
                    { label: "3:4", value: 3 / 4 },
                  ].map((ratio) => (
                    <button
                      key={ratio.label}
                      onClick={() => setCropAspect(ratio.value)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md whitespace-nowrap transition-all flex-1 ${cropAspect === ratio.value
                        ? "bg-cyan-600 text-white shadow-lg"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleCrop}
                  disabled={
                    !completedCrop?.width ||
                    !completedCrop?.height ||
                    isProcessing
                  }
                  className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? "Cropping..." : "Confirm Crop"}
                </button>
                <button
                  onClick={() => {
                    setIsCropping(false);
                    setCrop(undefined);
                    setCropAspect(undefined);
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
                className="w-full py-4 bg-gradient-to-r from-violet-900 to-violet-900 rounded-xl text-white font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isProcessing ? (
                  "Processing Path..."
                ) : (
                  <>
                    <img src={drift_icon} alt="Logo" className="h-2 w-auto" />
                    <span>Generate Path</span>
                  </>
                )}
              </button>
            ) : activeTab === "convert" ? (
              null // Convert button is in the UI block above
            ) : (
              <button
                onClick={() => textEditMutation.mutate(undefined)}
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
