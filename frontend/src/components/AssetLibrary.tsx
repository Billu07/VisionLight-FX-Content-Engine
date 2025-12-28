import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";
import { EditAssetModal } from "./EditAssetModal";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16" | "original";
  createdAt: string;
}

interface AssetLibraryProps {
  onSelect?: (file: File, url: string) => void;
  onClose: () => void;
}

export function AssetLibrary({ onSelect, onClose }: AssetLibraryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [targetRatio, setTargetRatio] = useState<"16:9" | "9:16" | "original">(
    "16:9"
  );

  // UI States
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  // Polling State
  const [pollingUntil, setPollingUntil] = useState<number>(0);
  const [processingCount, setProcessingCount] = useState(0);

  // ✅ NEW: Track assets that have active/completed Drift paths locally
  const [activeDriftIds, setActiveDriftIds] = useState<Set<string>>(new Set());

  const isProcessing = pollingUntil > 0;

  // 1. Fetch Assets
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    refetchInterval: isProcessing ? 2000 : false,
    refetchIntervalInBackground: true,
  });

  // ✅ NEW: Scan LocalStorage for Drift Jobs on mount/update
  useEffect(() => {
    const checkDrifts = () => {
      const found = new Set<string>();
      // Scan all local storage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("drift_job_")) {
          const assetId = key.replace("drift_job_", "");
          found.add(assetId);
        }
      }
      setActiveDriftIds(found);
    };

    checkDrifts();

    // Optional: Re-scan every few seconds in case a job finishes/clears elsewhere
    const interval = setInterval(checkDrifts, 3000);
    return () => clearInterval(interval);
  }, []);

  // 2. Timer Logic
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

  // 3. Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("images", file));
      const uploadRatio = targetRatio === "original" ? "16:9" : targetRatio;
      formData.append("aspectRatio", uploadRatio);
      return apiEndpoints.uploadBatchAssets(formData);
    },
    onMutate: () => setIsUploading(true),
    onSuccess: (_, variables: FileList) => {
      const fileCount = variables.length;
      const estimatedTime = fileCount * 20000;
      setProcessingCount(fileCount);
      setPollingUntil(Date.now() + estimatedTime);
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
      link.setAttribute("download", `visionlight-asset-${asset.id}.jpg`);
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

  const filteredAssets = Array.isArray(assets)
    ? assets.filter((a: Asset) => {
        if (targetRatio === "original") {
          return (
            a.aspectRatio === "original" ||
            (a.aspectRatio !== "16:9" && a.aspectRatio !== "9:16")
          );
        }
        return a.aspectRatio === targetRatio;
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
          <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-700">
            <button
              onClick={() => setTargetRatio("16:9")}
              className={`px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
                targetRatio === "16:9"
                  ? "bg-cyan-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Landscape
            </button>
            <button
              onClick={() => setTargetRatio("9:16")}
              className={`px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
                targetRatio === "9:16"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Portrait
            </button>
            <button
              onClick={() => setTargetRatio("original")}
              className={`px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
                targetRatio === "original"
                  ? "bg-emerald-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Edited Pictures
            </button>
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
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["assets"] })
              }
              className="p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
              title="Refresh Library"
            >
              🔄
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isProcessing}
              className={`px-6 py-2.5 font-bold rounded-lg transition-all flex items-center gap-2 ${
                isUploading
                  ? "bg-gray-700 text-gray-400 cursor-wait"
                  : "bg-white text-black hover:bg-gray-200"
              }`}
            >
              {isUploading ? (
                <LoadingSpinner size="sm" variant="default" />
              ) : (
                <>
                  <span></span> Upload
                </>
              )}
            </button>
          </div>
        </div>

        {/* PROCESSING BANNER */}
        {isProcessing && (
          <div className="bg-blue-900/30 border-b border-blue-500/30 p-2 text-center animate-pulse">
            <span className="text-blue-200 text-xs font-bold uppercase tracking-wider">
              Processing {processingCount} images... They will appear
              automatically.
            </span>
          </div>
        )}

        {/* GRID VIEW */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/40">
          {isLoading && !isProcessing ? (
            <div className="flex justify-center items-center h-full">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          ) : filteredAssets.length === 0 && !isProcessing ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
              <span className="text-6xl mb-4">🖼️</span>
              <p>No images found in this category.</p>
            </div>
          ) : (
            <div
              className={`grid gap-6 ${
                targetRatio === "16:9" || targetRatio === "original"
                  ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  : "grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
              }`}
            >
              {filteredAssets.map((asset: Asset) => (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`relative group border rounded-xl overflow-hidden bg-black cursor-pointer transition-all hover:shadow-2xl hover:shadow-cyan-900/20 aspect-auto ${
                    // ✅ HIGHLIGHT ACTIVE DRIFT ASSETS
                    activeDriftIds.has(asset.id)
                      ? "border-rose-500 ring-2 ring-rose-500/50"
                      : "border-gray-800 hover:border-cyan-500/50"
                  }`}
                >
                  <img
                    src={asset.url}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    style={{
                      aspectRatio:
                        asset.aspectRatio === "9:16" ? "9/16" : "16/9",
                    }}
                  />

                  {/* ✅ DRIFT BADGE */}
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

      {/* --- LIGHTBOX & EDIT MODAL --- */}
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
                className="absolute top-4 left-4 bg-black/50 text-white p-2 rounded-full hover:bg-white/20 transition-colors"
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
                    ? "Raw / Magic Edit"
                    : selectedAsset.aspectRatio}
                </p>
                <div className="space-y-3">
                  {onSelect && (
                    <button
                      onClick={() => handleUseImage(selectedAsset)}
                      className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 transform active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <span></span> Use this Asset
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setEditingAsset(selectedAsset);
                      setSelectedAsset(null);
                    }}
                    className={`w-full py-3 border rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      // Highlight button if drift is waiting
                      activeDriftIds.has(selectedAsset.id)
                        ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-500"
                        : "bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border-purple-500/50"
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
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {isDownloading ? <LoadingSpinner size="sm" /> : "Download"}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(selectedAsset.id)}
                  className="w-full py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
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
