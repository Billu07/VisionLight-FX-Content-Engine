import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";
import { EditAssetModal } from "./EditAssetModal";
import { DriftFrameExtractor } from "./DriftFrameExtractor";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB Limit

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "1:1" | "original" | "custom";
  type: "IMAGE" | "VIDEO";
  createdAt: string;
  originalAssetId?: string | null;
  variations?: Asset[];
}

interface AssetLibraryProps {
  onSelect?: (file: File, url: string, aspectRatio?: string) => void;
  onClose: () => void;
  initialAspectRatio?: string;
}

export function AssetLibrary({
  onSelect,
  onClose,
  initialAspectRatio,
}: AssetLibraryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<
    "16:9" | "9:16" | "1:1" | "original" | "custom" | "VIDEO"
  >("16:9");

  // Auto-switch tab based on Dashboard context
  useEffect(() => {
    if (!initialAspectRatio) return;
    const ratio = initialAspectRatio.toLowerCase();

    if (ratio === "portrait" || ratio === "9:16") setActiveTab("9:16");
    else if (ratio === "landscape" || ratio === "16:9") setActiveTab("16:9");
    else if (ratio === "square" || ratio === "1:1") setActiveTab("1:1");
    else setActiveTab("original");
  }, [initialAspectRatio]);

  // UI States
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [viewingVideoAsset, setViewingVideoAsset] = useState<Asset | null>(
    null,
  );

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
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // ✅ REFINED FILTER LOGIC
  const filteredAssets = Array.isArray(assets)
    ? assets.filter((a: Asset) => {
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
        // 1. Explicit 'custom' ratio
        // 2. 'original' ratio BUT has a parent (meaning it was edited but size kept)
        // 3. Weird ratios that aren't the standard 3
        if (activeTab === "custom") {
          return (
            a.type === "IMAGE" &&
            (a.aspectRatio === "custom" ||
              (a.aspectRatio === "original" && a.originalAssetId) ||
              (a.aspectRatio !== "16:9" &&
                a.aspectRatio !== "9:16" &&
                a.aspectRatio !== "1:1" &&
                a.aspectRatio !== "original"))
          );
        }

        // Standard Ratios (16:9, 9:16, 1:1)
        return a.type === "IMAGE" && a.aspectRatio === activeTab;
      })
    : [];

  // Navigation Helpers
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
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const file = new File([blob], `asset_${asset.id}.jpg`, {
        type: "image/jpeg",
      });
      onSelect(file, asset.url, asset.aspectRatio);
      onClose();
    } catch (e) {
      alert("Could not load image.");
    }
  };

  const handleDownloadAsset = async (asset: Asset) => {
    try {
      setIsDownloading(true);
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const ext = asset.type === "VIDEO" ? "mp4" : "jpg";
      link.setAttribute("download", `picdrift-asset-${asset.id}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      window.open(asset.url, "_blank");
    } finally {
      setIsDownloading(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="bg-gray-900 w-full max-w-6xl h-[85vh] rounded-2xl border border-gray-700 flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900 z-10">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              📚 Asset Library
            </h2>
            <p className="text-sm text-gray-400">
              Manage your generated and uploaded assets
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {/* CONTROLS */}
        <div className="p-6 bg-gray-800/50 flex flex-col md:flex-row gap-4 items-center justify-between border-b border-gray-800">
          <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-700 overflow-x-auto">
            {[
              { id: "original", label: "Originals" },
              { id: "16:9", label: "Landscape" },
              { id: "9:16", label: "Portrait" },
              { id: "1:1", label: "Square" },
              { id: "custom", label: "Edited" },
              { id: "VIDEO", label: "Drift Paths" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-md text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
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
              className="px-6 py-2.5 font-bold rounded-lg bg-white text-black hover:bg-gray-200 flex items-center gap-2 transition-colors"
            >
              {isUploading ? (
                <LoadingSpinner size="sm" variant="default" />
              ) : (
                <>
                  <span>📤</span> Upload
                </>
              )}
            </button>
          </div>
        </div>

        {/* GRID VIEW */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/40">
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
                filteredAssets.map((asset: Asset) => (
                  <div
                    key={asset.id}
                    onClick={() => {
                      if (asset.type === "VIDEO") setViewingVideoAsset(asset);
                      else setSelectedAsset(asset);
                    }}
                    className={`relative group border rounded-xl overflow-hidden bg-black cursor-pointer transition-all hover:shadow-2xl hover:shadow-cyan-900/20 ${
                      activeDriftIds.has(asset.id)
                        ? "border-rose-500 ring-2 ring-rose-500/50"
                        : "border-gray-800 hover:border-cyan-500/50"
                    }`}
                  >
                    {/* THUMBNAIL LOGIC */}
                    {asset.type === "VIDEO" ? (
                      <div className="w-full h-full relative aspect-video">
                        <video
                          src={asset.url}
                          className="w-full h-full object-cover opacity-80"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl text-white opacity-80">
                            ▶️
                          </span>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={asset.url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedAsset(null)}
          ></div>
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl max-w-6xl w-full h-[85vh] flex overflow-hidden shadow-2xl z-10">
            {/* LEFT: IMAGE PREVIEW */}
            <div className="flex-1 bg-black flex items-center justify-center p-8 border-r border-gray-800 relative group">
              {/* UNIFIED OVERLAY CONTROLS */}
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <button
                  onClick={handleGoToOriginal}
                  disabled={!selectedAsset.originalAssetId}
                  className={`p-2 rounded-full text-white backdrop-blur-md transition-all border border-white/10 ${
                    selectedAsset.originalAssetId
                      ? "bg-gray-800/80 hover:bg-gray-700 hover:border-white/30"
                      : "bg-gray-800/30 opacity-30 cursor-not-allowed"
                  }`}
                  title="Go to Original (v1)"
                >
                  ↩️
                </button>
                <span className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-mono backdrop-blur-md flex items-center border border-white/10 select-none">
                  {selectedAsset.originalAssetId ? "v2" : "v1"}
                </span>
                <button
                  onClick={handleGoToProcessed}
                  disabled={
                    !selectedAsset.variations ||
                    selectedAsset.variations.length === 0
                  }
                  className={`p-2 rounded-full text-white backdrop-blur-md transition-all border border-white/10 ${
                    selectedAsset.variations &&
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
                src={selectedAsset.url}
                className="max-w-full max-h-full object-contain rounded shadow-lg"
              />

              {/* Navigation Arrows */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevAsset();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
              >
                ◀
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextAsset();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
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

            {/* RIGHT: DETAILS */}
            <div className="w-80 p-8 flex flex-col justify-between bg-gray-900">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Asset Details
                </h3>

                <div className="mb-6 space-y-4">
                  <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <span className="text-xs text-gray-500 uppercase font-bold block mb-1">
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
                  {onSelect && (
                    <button
                      onClick={() => handleUseImage(selectedAsset)}
                      className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg"
                    >
                      Use this Asset
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingAsset(selectedAsset);
                      setSelectedAsset(null);
                    }}
                    className={`w-full py-3 border rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${activeDriftIds.has(selectedAsset.id) ? "bg-rose-600 text-white border-rose-500" : "bg-purple-600/20 text-purple-300 border-purple-500/50"}`}
                  >
                    <span>
                      {activeDriftIds.has(selectedAsset.id)
                        ? "🌀 Resume Drift"
                        : "Edit"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="space-y-3 pt-6 border-t border-gray-800">
                <button
                  onClick={() => handleDownloadAsset(selectedAsset)}
                  disabled={isDownloading}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm"
                >
                  {isDownloading ? <LoadingSpinner size="sm" /> : "Download"}
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Delete this asset?"))
                      deleteMutation.mutate(selectedAsset.id);
                  }}
                  className="w-full py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingVideoAsset && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl p-6 relative flex flex-col items-center">
            <button
              onClick={() => setViewingVideoAsset(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-white font-bold mb-4 self-start">
              🎬 Saved Path
            </h3>
            <DriftFrameExtractor
              videoUrl={viewingVideoAsset.url}
              onExtract={async (blob) => {
                const file = new File([blob], "extracted_frame.jpg", {
                  type: "image/jpeg",
                });
                const formData = new FormData();
                formData.append("image", file);
                formData.append("raw", "true");
                await apiEndpoints.uploadAssetSync(formData);
                alert("Frame Saved to Library!");
                setViewingVideoAsset(null);
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
        />
      )}
    </div>
  );
}
