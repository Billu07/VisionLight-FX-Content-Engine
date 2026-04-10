import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints, getCORSProxyUrl } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { EditAssetModal } from "./EditAssetModal";
import { DriftFrameExtractor } from "./DriftFrameExtractor";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB Limit

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "1:1" | "original" | "custom" | "3DX_FRAME";
  type: "IMAGE" | "VIDEO";
  createdAt: string;
  originalAssetId?: string | null;
  variations?: Asset[];
}

interface AssetLibraryProps {
  onSelect?: (file: File, url: string, aspectRatio?: string) => void;
  onClose: () => void;
  initialAspectRatio?: string;
  isSequencerMode?: boolean;
}

export function AssetLibrary({
  onSelect,
  onClose,
  initialAspectRatio,
  isSequencerMode,
}: AssetLibraryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "16:9" | "9:16" | "1:1" | "original" | "custom" | "VIDEO" | "STORYBOARD" | "3DX_FRAME"
  >("original");

  // Auto-switch tab based on Dashboard context
  useEffect(() => {
    if (!initialAspectRatio) {
      setActiveTab("original");
      return;
    }
    const ratio = initialAspectRatio.toLowerCase();

    if (ratio === "portrait" || ratio === "9:16") setActiveTab("9:16");
    else if (ratio === "landscape" || ratio === "16:9") setActiveTab("16:9");
    else if (ratio === "square" || ratio === "1:1") setActiveTab("1:1");
    else setActiveTab("original");
  }, [initialAspectRatio]);

  // Storyboard State
  const activeProject = localStorage.getItem("visionlight_active_project") || undefined;
  const [storyboardIds, setStoryboardIds] = useState<string[]>([]);
  const [isStoryboardLoaded, setIsStoryboardLoaded] = useState(false);

  useEffect(() => {
    const fetchStoryboard = async () => {
      try {
        const res = await apiEndpoints.getStoryboard(activeProject);
        if (res.data.success) {
          setStoryboardIds(res.data.storyboard || []);
        }
      } catch (e) {
        console.error("Failed to load storyboard", e);
      } finally {
        setIsStoryboardLoaded(true);
      }
    };
    fetchStoryboard();
  }, [activeProject]);

  useEffect(() => {
    if (!isStoryboardLoaded) return;
    const saveStoryboard = async () => {
      try {
        await apiEndpoints.saveStoryboard(storyboardIds, activeProject);
      } catch (e) {
        console.error("Failed to save storyboard", e);
      }
    };
    const timer = setTimeout(saveStoryboard, 500);
    return () => clearTimeout(timer);
  }, [storyboardIds, isStoryboardLoaded, activeProject]);

  // UI States
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [viewingVideoAsset, setViewingVideoAsset] = useState<Asset | null>(
    null,
  );
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const handleDownloadZip = async () => {
    const storyboardAssets = storyboardIds
      .map((id) => assets.find((a: Asset) => a.id === id))
      .filter(Boolean) as Asset[];

    if (storyboardAssets.length === 0) return;

    try {
      setIsDownloadingZip(true);
      const assetUrls = storyboardAssets.map((a) => a.url);
      const res = await apiEndpoints.downloadZip({ 
        assetUrls, 
        filename: `visionlight-storyboard-${Date.now()}.zip` 
      });

      // Create a blob link to download
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `visionlight-storyboard-${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download ZIP:", error);
      alert("Failed to generate ZIP file.");
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleDirectDownload = async (asset: Asset) => {
    try {
      setIsDownloading(true);
      const response = await fetch(getCORSProxyUrl(asset.url));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ext = asset.url.split('.').pop()?.split('?')[0] || 'jpg';
      link.setAttribute('download', `visionlight-${asset.id}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Direct download failed, falling back to window.open", error);
      window.open(getCORSProxyUrl(asset.url), "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFullscreen = () => {
    const imgElement = document.getElementById('preview-image-main');
    if (imgElement) {
      if (imgElement.requestFullscreen) {
        imgElement.requestFullscreen();
      } else if ((imgElement as any).webkitRequestFullscreen) {
        (imgElement as any).webkitRequestFullscreen();
      } else if ((imgElement as any).msRequestFullscreen) {
        (imgElement as any).msRequestFullscreen();
      }
    }
  };

  // Polling & Skeleton State
  const [pollingUntil, setPollingUntil] = useState<number>(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [targetAssetCount, setTargetAssetCount] = useState(0);
  const [activeDriftIds, setActiveDriftIds] = useState<Set<string>>(new Set());

  // 1. Fetch Assets
  const {
    data: assets = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const activeProject =
        localStorage.getItem("visionlight_active_project") || undefined;
      const res = await apiEndpoints.getAssets(activeProject);
      return res.data.assets;
    },
    enabled: !!user,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // ✅ REFINED FILTER LOGIC
  let filteredAssets = Array.isArray(assets)
    ? assets.filter((a: Asset) => {
      if (activeTab === "STORYBOARD") return false; // Handled below
      if (activeTab === "VIDEO") return a.type === "VIDEO";

      // Originals Tab: STRICTLY raw uploads (no parent)
      if (activeTab === "original") {
        return (
          a.type === "IMAGE" &&
          a.aspectRatio === "original" &&
          !a.originalAssetId // Must be a root asset
        );
      }

      // Edited/Custom Tab:
      if (activeTab === "custom") {
        return (
          a.type === "IMAGE" &&
          (a.aspectRatio === "custom" || !!a.originalAssetId)
        );
      }

      if (activeTab === "3DX_FRAME") {
        return a.type === "IMAGE" && a.aspectRatio === "3DX_FRAME";
      }

      // Standard Ratios (16:9, 9:16, 1:1)
      return a.type === "IMAGE" && a.aspectRatio === activeTab;
    })
    : [];

  if (activeTab === "STORYBOARD") {
    filteredAssets = storyboardIds
      .map((id) => assets.find((a: Asset) => a.id === id))
      .filter(Boolean) as Asset[];
  }

  const getAssetImageSrc = (asset: Asset) => {
    const proxyUrl = getCORSProxyUrl(asset.url, 400, 75);
    const separator = proxyUrl.includes('?') ? '&' : '?';
    return `${proxyUrl}${separator}v=${asset.createdAt}`;
  };
  const handleNextAsset = () => {
    if (!selectedAsset) return;
    const currentIndex = filteredAssets.findIndex(
      (a) => a.id === selectedAsset.id,
    );
    if (currentIndex < filteredAssets.length - 1) {
      setSelectedAsset(filteredAssets[currentIndex + 1]);
    }
  };

  const handlePrevAsset = () => {
    if (!selectedAsset) return;
    const currentIndex = filteredAssets.findIndex(
      (a) => a.id === selectedAsset.id,
    );
    if (currentIndex > 0) {
      setSelectedAsset(filteredAssets[currentIndex - 1]);
    }
  };

  useEffect(() => {
    const checkDrifts = () => {
      const found = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("drift_job_")) {
          found.add(key.replace("drift_job_", ""));
        }
      }
      setActiveDriftIds(found);
    };
    checkDrifts();
    const interval = setInterval(checkDrifts, 3000);
    return () => clearInterval(interval);
  }, []);

  // Polling Cleanup
  useEffect(() => {
    if (pollingUntil > 0) {
      const checkInterval = setInterval(() => {
        if (Date.now() > pollingUntil) {
          setPollingUntil(0);
          setProcessingCount(0);
          setTargetAssetCount(0);
          queryClient.invalidateQueries({ queryKey: ["assets"] });
        }
      }, 1000);
      return () => clearInterval(checkInterval);
    }
  }, [pollingUntil, queryClient]);

  useEffect(() => {
    if (targetAssetCount > 0 && filteredAssets.length >= targetAssetCount) {
      setPollingUntil(0);
      setProcessingCount(0);
      setTargetAssetCount(0);
    }
  }, [filteredAssets.length, targetAssetCount]);

  // Upload Logic
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("raw", "true");
        formData.append("aspectRatio", "original");
        const activeProject = localStorage.getItem(
          "visionlight_active_project",
        );
        if (activeProject) formData.append("projectId", activeProject);

        const rawRes = await apiEndpoints.uploadAssetSync(formData);
        const originalAsset = rawRes.data.asset;

        if (
          activeTab !== "original" &&
          activeTab !== "VIDEO" &&
          activeTab !== "custom"
        ) {
          const processFormData = new FormData();
          processFormData.append("image", file);
          processFormData.append("raw", "false");
          processFormData.append("aspectRatio", activeTab);
          processFormData.append("originalAssetId", originalAsset.id);
          if (activeProject) processFormData.append("projectId", activeProject);
          await apiEndpoints.uploadAssetSync(processFormData);
        }
        return originalAsset;
      });

      return Promise.all(uploadPromises);
    },
    onMutate: (files) => {
      setIsUploading(true);
      setTargetAssetCount(filteredAssets.length + files.length);
      setProcessingCount(files.length);
      setPollingUntil(Date.now() + files.length * 40000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => {
      alert("Upload failed: " + err.message);
      setPollingUntil(0);
      setProcessingCount(0);
      setTargetAssetCount(0);
    },
    onSettled: () => setIsUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiEndpoints.deleteAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setSelectedAsset(null);
      setViewingVideoAsset(null);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = new DataTransfer();
      Array.from(e.target.files).forEach((file) => {
        if (file.size > MAX_FILE_SIZE) {
          alert(`Skipped "${file.name}": Exceeds 10MB limit.`);
        } else {
          validFiles.items.add(file);
        }
      });
      if (validFiles.files.length > 0) {
        uploadMutation.mutate(validFiles.files);
      }
    }
  };

  const handleUseImage = async (asset: Asset) => {
    if (!onSelect) return;
    try {
      if (asset.type === "VIDEO") {
        // For NLE timeline and general video imports, just pass a dummy file and the URL
        const file = new File(["dummy"], `asset_${asset.id}.mp4`, { type: "video/mp4" });
        onSelect(file, asset.url, asset.aspectRatio);
        onClose();
        return;
      }

      // Existing logic for images
      const proxyUrl = getCORSProxyUrl(asset.url);
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Failed to fetch image");
      const blob = await response.blob();
      const file = new File([blob], `asset_${asset.id}.jpg`, {
        type: "image/jpeg",
      });
      onSelect(file, asset.url, asset.aspectRatio);
      onClose();
    } catch (e) {
      console.error("handleUseImage Error:", e);
      alert("Could not load media.");
    }
  };

  const handleGoToOriginal = () => {
    if (!selectedAsset || !selectedAsset.originalAssetId) return;
    const original = assets.find(
      (a: Asset) => a.id === selectedAsset.originalAssetId,
    );

    if (original) {
      setActiveTab("original");
      setSelectedAsset(original);
    } else {
      alert("Original asset not found (it may have been deleted).");
    }
  };

  const handleGoToProcessed = () => {
    if (
      !selectedAsset ||
      !selectedAsset.variations ||
      selectedAsset.variations.length === 0
    )
      return;

    const latestVersion =
      selectedAsset.variations[selectedAsset.variations.length - 1];

    if (latestVersion.aspectRatio === "16:9") setActiveTab("16:9");
    else if (latestVersion.aspectRatio === "9:16") setActiveTab("9:16");
    else if (latestVersion.aspectRatio === "1:1") setActiveTab("1:1");

    setSelectedAsset(latestVersion);
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedAsset) return;
      if (e.key === "ArrowRight") handleNextAsset();
      if (e.key === "ArrowLeft") handlePrevAsset();
      if (e.key === "Escape") setSelectedAsset(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAsset, filteredAssets]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black sm:bg-black/95 sm:p-4 backdrop-blur-md">
      <div className="bg-gray-900 w-full h-full sm:max-w-6xl sm:h-[85vh] sm:rounded-2xl border-0 sm:border border-gray-700 flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="p-4 sm:p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900 z-10 shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              📚 Asset Library
            </h2>
            <p className="text-[10px] sm:text-sm text-gray-400">
              Manage your assets
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-red-500 text-xl p-2 transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* CONTROLS */}
        <div className="p-4 sm:p-6 bg-gray-800/50 flex flex-col md:flex-row gap-4 items-center justify-between border-b border-gray-800">
          <div className="flex flex-wrap sm:flex-nowrap bg-gray-950 p-1 rounded-lg border border-gray-700 sm:overflow-x-auto justify-center sm:justify-start gap-1 w-full md:w-auto">
            {[
              { id: "original", label: "Originals" },
              { id: "16:9", label: "Landscape" },
              { id: "9:16", label: "Portrait" },
              { id: "1:1", label: "Square" },
              { id: "STORYBOARD", label: "Storyboard" },
              { id: "custom", label: "Edited" },
              { id: "VIDEO", label: "3DX Paths" },
              { id: "3DX_FRAME", label: "3DX Frames" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-[10px] sm:text-xs md:text-sm font-bold whitespace-nowrap transition-all flex-1 sm:flex-none text-center ${activeTab === tab.id
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end">
            {activeTab === "STORYBOARD" && storyboardIds.length > 0 && (
              <>
                <button
                  onClick={handleDownloadZip}
                  disabled={isDownloadingZip}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-white border border-cyan-500/30 transition-all flex items-center gap-2"
                >
                  {isDownloadingZip ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>📥 Download ZIP</>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Clear all items from your Storyboard sequence?",
                      )
                    ) {
                      setStoryboardIds([]);
                    }
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-900/50 text-red-400 hover:bg-red-900 hover:text-red-300 border border-red-500/30 transition-colors"
                >
                  🗑️ Clear Sequence
                </button>
              </>
            )}
            <input
              type="file"
              multiple
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors"
              disabled={isRefetching}
              title="Refresh Library"
            >
              <div className={isRefetching ? "animate-spin" : ""}>🔄</div>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || pollingUntil > 0}
              className="px-6 py-2.5 font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-500 flex flex-col items-center justify-center transition-colors min-w-[140px]"
            >
              {isUploading ? (
                <LoadingSpinner size="sm" variant="default" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    Upload
                  </div>
                </>
              )}
            </button>
          </div>
        </div>

        {/* GRID VIEW */}
        <div
          className={`flex-1 overflow-y-auto p-8 custom-scrollbar ${activeTab === "STORYBOARD" ? "bg-black relative before:content-[''] before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI0MCI+PHJlY3QgeD0iNSIgeT0iNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48cmVjdCB4PSI1IiB5PSIyNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3N2Zz4=')] before:bg-repeat-y before:bg-[length:20px_auto] before:opacity-30 before:pointer-events-none after:content-[''] after:absolute after:inset-y-0 after:right-0 after:w-5 after:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI0MCI+PHJlY3QgeD0iNSIgeT0iNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48cmVjdCB4PSI1IiB5PSIyNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3N2Zz4=')] after:bg-repeat-y after:bg-[length:20px_auto] after:opacity-30 after:pointer-events-none px-12" : "bg-black/40"}`}
        >
          {isLoading && !isRefetching ? (
            <div className="flex justify-center items-center h-full">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {/* SKELETON CARDS */}
              {pollingUntil > 0 &&
                Array.from({ length: processingCount }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="aspect-square rounded-xl border border-cyan-500/30 bg-gray-900/50 flex flex-col items-center justify-center animate-pulse"
                  >
                    <LoadingSpinner size="md" variant="default" />
                    <span className="text-cyan-400 text-xs font-bold mt-3 tracking-wide">
                      Generating{" "}
                      {activeTab !== "original" &&
                        activeTab !== "VIDEO" &&
                        activeTab !== "custom"
                        ? activeTab
                        : "Asset"}
                      ...
                    </span>
                  </div>
                ))}

              {filteredAssets.length === 0 && pollingUntil === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500 opacity-60">
                  <span className="text-6xl mb-4">
                    {activeTab === "VIDEO" ? "🎬" : "🖼️"}
                  </span>
                  <p>No {activeTab === "VIDEO" ? "videos" : "images"} found.</p>
                </div>
              ) : (
                filteredAssets.map((asset: Asset, index: number) => (
                  <div
                    key={asset.id}
                    onClick={() => {
                      if (onSelect && isSequencerMode) {
                        // If in picker mode, immediately use it!
                        handleUseImage(asset);
                      } else if (asset.type === "VIDEO") {
                        setViewingVideoAsset(asset);
                      } else {
                        setSelectedAsset(asset);
                      }
                    }}
                    className={`relative group border rounded-xl overflow-hidden bg-black cursor-pointer transition-all hover:shadow-2xl hover:shadow-cyan-900/20 ${activeDriftIds.has(asset.id)
                      ? "border-rose-500 ring-2 ring-rose-500/50"
                      : "border-gray-800 hover:border-cyan-500/50"
                      }`}
                  >
                    {/* THUMBNAIL LOGIC */}
                    {activeTab === "STORYBOARD" && (
                      <div className="absolute top-2 left-2 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg z-20 pointer-events-none">
                        {index + 1}
                      </div>
                    )}
                    {activeTab === "STORYBOARD" && (
                      <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = storyboardIds.indexOf(asset.id);
                            if (idx > 0) {
                              const newIds = [...storyboardIds];
                              [newIds[idx - 1], newIds[idx]] = [
                                newIds[idx],
                                newIds[idx - 1],
                              ];
                              setStoryboardIds(newIds);
                            }
                          }}
                          className="bg-black/70 hover:bg-white text-white hover:text-black w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-lg backdrop-blur-sm"
                        >
                          ◀
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = storyboardIds.indexOf(asset.id);
                            if (idx < storyboardIds.length - 1) {
                              const newIds = [...storyboardIds];
                              [newIds[idx + 1], newIds[idx]] = [
                                newIds[idx],
                                newIds[idx + 1],
                              ];
                              setStoryboardIds(newIds);
                            }
                          }}
                          className="bg-black/70 hover:bg-white text-white hover:text-black w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-lg backdrop-blur-sm"
                        >
                          ▶
                        </button>
                      </div>
                    )}
                    {asset.type === "VIDEO" ? (
                      <div className="w-full h-full relative aspect-square bg-black/20">
                        <video
                          src={asset.url}
                          className="w-full h-full object-contain opacity-80"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center transition-all shadow-lg text-white">
                            <svg className="w-6 h-6 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={getAssetImageSrc(asset)}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        crossOrigin="anonymous"
                      />
                    )}

                    {activeDriftIds.has(asset.id) && (
                      <div className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg z-10 animate-pulse">
                        🌀 Drift Ready
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- IMAGE DETAILS MODAL --- */}
      {selectedAsset && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedAsset(null)}
          ></div>
          <div className="relative bg-gray-900 border-0 sm:border border-gray-700 sm:rounded-2xl max-w-6xl w-full h-full sm:h-[85vh] flex flex-col sm:flex-row overflow-hidden shadow-2xl z-10">
            {/* LEFT: IMAGE PREVIEW */}
            <div className="flex-1 bg-black flex flex-col border-b sm:border-b-0 sm:border-r border-gray-800 relative group min-h-[40vh] overflow-hidden">
              {/* TITLE BLOCK (TOP BAR) */}
              <div className="w-full bg-black border-b border-gray-800 p-3 sm:p-4 flex justify-center items-center z-30 shadow-md shrink-0">
                <div className="text-white px-6 py-1.5 rounded-full font-bold tracking-widest text-xs sm:text-sm border border-white/10 bg-gray-800/80 shadow-inner">
                  {activeTab === "STORYBOARD" ? "Storyboard FX" :
                    activeTab === "9:16" ? "Portrait FX" :
                      activeTab === "16:9" ? "Landscape FX" :
                        activeTab === "1:1" ? "Square FX" :
                          activeTab === "3DX_FRAME" ? "3DX Drift Frames" :
                            activeTab === "VIDEO" ? "3DX Paths" :
                              activeTab === "custom" ? "Edited Assets" :
                                "Original Assets"}
                </div>
              </div>

              {/* IMAGE WRAPPER */}
              <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 overflow-hidden">
                {/* UNIFIED OVERLAY CONTROLS */}
                <div className="absolute top-4 right-4 z-20 flex gap-2">
                  <button
                    onClick={handleGoToOriginal}
                    disabled={!selectedAsset.originalAssetId}
                    className={`p-2 rounded-full text-white backdrop-blur-md transition-all border border-white/10 ${selectedAsset.originalAssetId
                      ? "bg-gray-800/80 hover:bg-gray-700 hover:border-white/30"
                      : "bg-gray-800/30 opacity-30 cursor-not-allowed"
                      }`}
                    title="Go to Original (v1)"
                  >
                    ↩️
                  </button>
                  <span className="bg-black/50 text-white px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-mono backdrop-blur-md flex items-center border border-white/10 select-none">
                    {selectedAsset.originalAssetId ? "v2" : "v1"}
                  </span>
                  <button
                    onClick={handleGoToProcessed}
                    disabled={
                      !selectedAsset.variations ||
                      selectedAsset.variations.length === 0
                    }
                    className={`p-2 rounded-full text-white backdrop-blur-md transition-all border border-white/10 ${selectedAsset.variations &&
                      selectedAsset.variations.length > 0
                      ? "bg-gray-800/80 hover:bg-gray-700 hover:border-white/30"
                      : "bg-gray-800/30 opacity-30 cursor-not-allowed"
                      }`}
                    title="Go to Processed (v2)"
                  >
                    ↪️
                  </button>
                </div>

                <img
                  id="preview-image-main"
                  src={`${getCORSProxyUrl(selectedAsset.url, 1920, 85)}${selectedAsset.url.includes('?') ? '&' : '?'}v=${selectedAsset.createdAt}`}
                  className="max-w-full max-h-full object-contain rounded shadow-lg"
                  crossOrigin="anonymous"
                />

                {/* Navigation Arrows (HIDDEN ON MOBILE for better touch experience) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrevAsset();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full opacity-0 sm:group-hover:opacity-100 transition-all z-10 hidden sm:block"
                >
                  ◀
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextAsset();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full opacity-0 sm:group-hover:opacity-100 transition-all z-10 hidden sm:block"
                >
                  ▶
                </button>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="absolute top-4 left-4 bg-black/50 text-white p-2 rounded-full hover:bg-white/20 z-10"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* RIGHT: DETAILS */}
            <div className="w-full sm:w-80 p-6 sm:p-8 flex flex-col justify-between bg-gray-900 overflow-y-auto">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  Asset Details
                </h3>

                <div className="mb-6 space-y-4">
                  <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">
                      Type
                    </span>
                    <p className="text-gray-300 text-sm font-medium">
                      {selectedAsset.aspectRatio === "original"
                        ? "Raw Original"
                        : selectedAsset.aspectRatio}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => {
                      if (storyboardIds.includes(selectedAsset.id)) {
                        setStoryboardIds(
                          storyboardIds.filter((id) => id !== selectedAsset.id),
                        );
                      } else {
                        setStoryboardIds([...storyboardIds, selectedAsset.id]);
                        setActiveTab("STORYBOARD");
                        setSelectedAsset(null);
                      }
                    }}
                    className={`w-full py-3 rounded-xl font-bold transition-all border text-sm ${storyboardIds.includes(selectedAsset.id)
                      ? "bg-red-900/30 text-red-400 border-red-500/50 hover:bg-red-900/50"
                      : "bg-indigo-900/30 text-indigo-400 border-indigo-500/50 hover:bg-indigo-900/50"
                      }`}
                  >
                    {storyboardIds.includes(selectedAsset.id)
                      ? "➖ Remove From Storyboard"
                      : "➕ Add to Storyboard"}
                  </button>

                  {onSelect && (
                    <button
                      onClick={() => handleUseImage(selectedAsset)}
                      className="w-full py-3 sm:py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg text-sm"
                    >
                      Use this Asset
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingAsset(selectedAsset);
                      setSelectedAsset(null);
                    }}
                    className={`w-full py-2 sm:py-3 border rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm ${activeDriftIds.has(selectedAsset.id) ? "bg-rose-600 text-white border-rose-500" : "bg-purple-600/20 text-purple-300 border-purple-500/50"}`}
                  >
                    <span>
                      {activeDriftIds.has(selectedAsset.id)
                        ? "🌀 Resume Drift"
                        : "Edit"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex sm:flex-col gap-3 pt-6 border-t border-gray-800 mt-6 sm:mt-0">
                <button
                  onClick={handleFullscreen}
                  className="flex-1 sm:w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs sm:text-sm font-bold border border-white/5 transition-colors"
                >
                  Fullscreen
                </button>
                <button
                  onClick={() => handleDirectDownload(selectedAsset)}
                  disabled={isDownloading}
                  className="flex-1 sm:w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs sm:text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all"
                >
                  {isDownloading ? <LoadingSpinner size="sm" /> : "Download"}
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Delete this asset?"))
                      deleteMutation.mutate(selectedAsset.id);
                  }}
                  className="flex-1 sm:w-full py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-xs sm:text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingVideoAsset && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/95 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto p-4 sm:p-6 relative flex flex-col items-center">
            <button
              onClick={() => setViewingVideoAsset(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
            >
              ✕
            </button>
            <div className="w-full flex justify-between items-center mb-4 pr-6 shrink-0">
              <img src="/drift_icon.png" alt="Drift" className="w-16 h-16 sm:w-24 sm:h-24 object-contain" />
              <h3 className="text-white font-bold tracking-widest text-xs sm:text-sm">
                3DX FRAME CAPTURE
              </h3>
            </div>
            <DriftFrameExtractor
              videoUrl={viewingVideoAsset.url}
              onExtract={async (blob) => {
                const file = new File([blob], "extracted_frame.jpg", {
                  type: "image/jpeg",
                });
                const formData = new FormData();
                formData.append("image", file);
                formData.append("raw", "true");
                formData.append("aspectRatio", "3DX_FRAME");
                const activeProject = localStorage.getItem(
                  "visionlight_active_project",
                );
                if (activeProject) formData.append("projectId", activeProject);

                await apiEndpoints.uploadAssetSync(formData);
                alert("Frame Saved to Library!");
                setViewingVideoAsset(null);
                setActiveTab("3DX_FRAME");
                queryClient.invalidateQueries({ queryKey: ["assets"] });
              }}
              onCancel={() => setViewingVideoAsset(null)}
            />
          </div>
        </div>
      )}

      {editingAsset && (
        <EditAssetModal
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onEditSuccess={(originalId, newAsset) => {
            if (storyboardIds.includes(originalId)) {
              setStoryboardIds((prev) => {
                const newIds = [...prev];
                const idx = newIds.indexOf(originalId);
                if (idx !== -1) {
                  newIds[idx] = newAsset.id; // Replace with edited version in storyboard
                }
                return newIds;
              });
            }
          }}
        />
      )}
    </div>
  );
}
