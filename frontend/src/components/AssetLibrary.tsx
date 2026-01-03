import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";
import { EditAssetModal } from "./EditAssetModal";
import { DriftFrameExtractor } from "./DriftFrameExtractor";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "1:1" | "original";
  type: "IMAGE" | "VIDEO";
  createdAt: string;
}

interface AssetLibraryProps {
  onSelect?: (file: File, url: string) => void;
  onClose: () => void;
  // ✅ NEW PROP: Receive context from Dashboard
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
    "16:9" | "9:16" | "1:1" | "original" | "VIDEO"
  >("16:9");

  // ✅ NEW: Auto-switch tab based on Dashboard context
  useEffect(() => {
    if (!initialAspectRatio) return;
    const ratio = initialAspectRatio.toLowerCase();

    if (ratio === "portrait" || ratio === "9:16") setActiveTab("9:16");
    else if (ratio === "landscape" || ratio === "16:9") setActiveTab("16:9");
    else if (ratio === "square" || ratio === "1:1") setActiveTab("1:1");
  }, [initialAspectRatio]);

  // UI States
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [viewingVideoAsset, setViewingVideoAsset] = useState<Asset | null>(
    null
  );

  // Polling State
  const [pollingUntil, setPollingUntil] = useState<number>(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [activeDriftIds, setActiveDriftIds] = useState<Set<string>>(new Set());

  // 1. Fetch Assets (✅ Modified for Auto-Refresh)
  const {
    data: assets = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    // ✅ Poll every 3 seconds to show new generations automatically
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // 2. Scan LocalStorage for Active Drift Jobs
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

  // 3. Timer Logic (Kept your original logic for upload counting)
  useEffect(() => {
    if (pollingUntil === 0) return;
    const checkInterval = setInterval(() => {
      if (Date.now() > pollingUntil) {
        setPollingUntil(0);
        setProcessingCount(0);
        queryClient.invalidateQueries({ queryKey: ["assets"] });
      }
    }, 1000);
    return () => clearInterval(checkInterval);
  }, [pollingUntil, queryClient]);

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("images", file));

      // ✅ Handle upload ratio logic
      let uploadRatio = "16:9";
      if (activeTab === "9:16") uploadRatio = "9:16";
      else if (activeTab === "1:1") uploadRatio = "1:1";
      else if (activeTab === "original") uploadRatio = "original";

      formData.append("aspectRatio", uploadRatio);
      return apiEndpoints.uploadBatchAssets(formData);
    },
    onMutate: () => setIsUploading(true),
    onSuccess: (_, variables: FileList) => {
      const fileCount = variables.length;
      setProcessingCount(fileCount);
      setPollingUntil(Date.now() + fileCount * 20000);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => alert("Upload failed: " + err.message),
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
    if (e.target.files && e.target.files.length > 0)
      uploadMutation.mutate(e.target.files);
  };

  const handleUseImage = async (asset: Asset) => {
    if (!onSelect) return;
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const file = new File([blob], `asset_${asset.id}.jpg`, {
        type: "image/jpeg",
      });
      onSelect(file, asset.url);
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
      link.setAttribute("download", `visionlight-asset-${asset.id}.${ext}`);
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

  // ✅ FILTER LOGIC (Unchanged)
  const filteredAssets = Array.isArray(assets)
    ? assets.filter((a: Asset) => {
        if (activeTab === "VIDEO") return a.type === "VIDEO";

        if (activeTab === "original")
          return (
            a.type === "IMAGE" &&
            (a.aspectRatio === "original" ||
              (a.aspectRatio !== "16:9" &&
                a.aspectRatio !== "9:16" &&
                a.aspectRatio !== "1:1"))
          );

        return a.type === "IMAGE" && a.aspectRatio === activeTab;
      })
    : [];

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
              { id: "16:9", label: "Landscape" },
              { id: "9:16", label: "Portrait" },
              { id: "1:1", label: "Square" },
              { id: "original", label: "Edited Pictures" },
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
            {/* ✅ UPDATED: Refresh Button with Spinner */}
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

        {/* PROCESSING BANNER (Kept Original) */}
        {pollingUntil > 0 && (
          <div className="bg-blue-900/30 border-b border-blue-500/30 p-2 text-center animate-pulse">
            <span className="text-blue-200 text-xs font-bold uppercase tracking-wider">
              Processing {processingCount} items...
            </span>
          </div>
        )}

        {/* GRID VIEW */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/40">
          {isLoading && !isRefetching ? (
            <div className="flex justify-center items-center h-full">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          ) : filteredAssets.length === 0 && pollingUntil === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
              <span className="text-6xl mb-4">
                {activeTab === "VIDEO" ? "🎬" : "🖼️"}
              </span>
              <p>No {activeTab === "VIDEO" ? "videos" : "images"} found.</p>
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredAssets.map((asset: Asset) => (
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

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm border border-white/20">
                      View
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODALS (Kept exactly as original) */}
      {selectedAsset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedAsset(null)}
          ></div>
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl max-w-6xl w-full h-[85vh] flex overflow-hidden shadow-2xl z-10">
            <div className="flex-1 bg-black flex items-center justify-center p-8 border-r border-gray-800 relative">
              <img
                src={selectedAsset.url}
                className="max-w-full max-h-full object-contain rounded shadow-lg"
              />
              <button
                onClick={() => setSelectedAsset(null)}
                className="absolute top-4 left-4 bg-black/50 text-white p-2 rounded-full hover:bg-white/20"
              >
                ✕
              </button>
            </div>
            <div className="w-80 p-8 flex flex-col justify-between bg-gray-900">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Asset Details
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  {selectedAsset.aspectRatio === "original"
                    ? "Raw"
                    : selectedAsset.aspectRatio}
                </p>
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
                    className={`w-full py-3 border rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      activeDriftIds.has(selectedAsset.id)
                        ? "bg-rose-600 text-white border-rose-500"
                        : "bg-purple-600/20 text-purple-300 border-purple-500/50"
                    }`}
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
                  onClick={() => deleteMutation.mutate(selectedAsset.id)}
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
