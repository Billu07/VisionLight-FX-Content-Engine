import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { EditAssetModal } from "./EditAssetModal";
import { LoadingSpinner } from "./LoadingSpinner";

interface Asset {
  id: string;
  url: string;
  aspectRatio: "16:9" | "9:16";
  createdAt: string;
}

interface AssetLibraryProps {
  onSelect: (file: File, url: string) => void;
  onClose: () => void;
}

export function AssetLibrary({ onSelect, onClose }: AssetLibraryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetRatio, setTargetRatio] = useState<"16:9" | "9:16">("16:9");
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  // UI States
  const [isUploading, setIsUploading] = useState(false);

  // Polling State: We track when to STOP polling
  const [pollingUntil, setPollingUntil] = useState<number>(0);
  const [processingCount, setProcessingCount] = useState(0);

  // 1. Fetch Assets (With Auto-Refresh Logic)
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await apiEndpoints.getAssets()).data.assets,
    // 👇 POLL EVERY 2 SECONDS IF WE ARE IN PROCESSING MODE
    refetchInterval: () => {
      const isProcessing = Date.now() < pollingUntil;
      return isProcessing ? 2000 : false;
    },
  });

  // Effect to clear processing state when time is up
  useEffect(() => {
    if (pollingUntil === 0) return;
    const interval = setInterval(() => {
      if (Date.now() > pollingUntil) {
        setPollingUntil(0);
        setProcessingCount(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pollingUntil]);

  // 2. Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("images", file));
      formData.append("aspectRatio", targetRatio);
      return apiEndpoints.uploadBatchAssets(formData);
    },
    onMutate: () => setIsUploading(true),

    // 👇 FIX: Explicitly type 'variables' as FileList
    onSuccess: (_, variables: FileList) => {
      const fileCount = variables.length;

      const estimatedTime = fileCount * 12000;
      const endTime = Date.now() + estimatedTime;

      setProcessingCount(fileCount);
      setPollingUntil(endTime);

      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => alert("Upload failed: " + err.message),
    onSettled: () => setIsUploading(false),
  });

  // 3. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiEndpoints.deleteAsset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });

  // Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadMutation.mutate(e.target.files);
    }
  };

  const handleSelectAsset = async (asset: Asset) => {
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const file = new File([blob], `asset_${asset.id}.jpg`, {
        type: "image/jpeg",
      });
      onSelect(file, asset.url);
      onClose();
    } catch (e) {
      console.error("Failed to load asset", e);
      alert("Could not load image.");
    }
  };

  const handleDownloadAsset = async (asset: Asset) => {
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `visionlight-asset-${asset.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      window.open(asset.url, "_blank");
    }
  };

  const filteredAssets = Array.isArray(assets)
    ? assets.filter((a: Asset) => a.aspectRatio === targetRatio)
    : [];

  const isProcessing = Date.now() < pollingUntil;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="bg-gray-900 w-full max-w-5xl h-[85vh] rounded-2xl border border-gray-700 flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900 z-10">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              📚 Asset Library
            </h2>
            <p className="text-sm text-gray-400">
              Pre-process images for perfect consistency
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Edit Modal Layer */}
        {editingAsset && (
          <EditAssetModal
            asset={editingAsset}
            onClose={() => setEditingAsset(null)}
          />
        )}

        {/* CONTROLS */}
        <div className="p-6 bg-gray-800/30 flex flex-col md:flex-row gap-4 items-center justify-between border-b border-gray-800">
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
            <button
              onClick={() => setTargetRatio("16:9")}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                targetRatio === "16:9"
                  ? "bg-cyan-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Landscape (16:9)
            </button>
            <button
              onClick={() => setTargetRatio("9:16")}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                targetRatio === "9:16"
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Portrait (9:16)
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <input
              type="file"
              multiple
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isProcessing}
              className={`w-full md:w-auto px-6 py-2.5 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
                isUploading || isProcessing
                  ? "bg-gray-700 text-gray-400 cursor-wait"
                  : "bg-white text-black hover:bg-gray-200"
              }`}
            >
              {isUploading ? (
                <LoadingSpinner size="sm" variant="default" />
              ) : (
                "☁️ Batch Upload"
              )}
            </button>
          </div>
        </div>

        {/* 👇 PROCESSING INDICATOR BANNER */}
        {isProcessing && (
          <div className="bg-blue-900/30 border-b border-blue-500/30 p-3 flex items-center justify-center gap-3 animate-pulse">
            <LoadingSpinner size="sm" variant="neon" />
            <span className="text-blue-200 text-sm font-semibold">
              Processing {processingCount} images... They will appear
              automatically.
            </span>
          </div>
        )}

        {/* GALLERY GRID */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gray-900/50">
          {isLoading && !isProcessing ? (
            <div className="flex justify-center items-center h-full">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-20 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl flex flex-col items-center">
              <span className="text-4xl mb-4">🖼️</span>
              <p className="text-lg mb-2 text-white">
                No {targetRatio} assets found
              </p>
              <p className="text-sm text-gray-400 max-w-sm">
                Upload raw images to automatically crop and outpaint them to{" "}
                {targetRatio}
              </p>
            </div>
          ) : (
            <div
              className={`grid gap-4 ${
                targetRatio === "16:9"
                  ? "grid-cols-2 md:grid-cols-3"
                  : "grid-cols-3 md:grid-cols-5"
              }`}
            >
              {/* If processing, show placeholder skeletons */}
              {isProcessing && (
                <div className="animate-pulse bg-gray-800 rounded-lg aspect-video flex items-center justify-center border border-white/10">
                  <span className="text-xs text-gray-500">Generating...</span>
                </div>
              )}

              {filteredAssets.map((asset: Asset) => (
                <div
                  key={asset.id}
                  className="relative group border border-gray-800 rounded-lg overflow-hidden bg-black aspect-video animate-in fade-in zoom-in-95 duration-300"
                >
                  <img
                    src={asset.url}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                    loading="lazy"
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4 backdrop-blur-sm">
                    <button
                      onClick={() => handleSelectAsset(asset)}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg w-full shadow-lg"
                    >
                      Use Image
                    </button>

                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => handleDownloadAsset(asset)}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-lg"
                        title="Download"
                      >
                        ⬇️
                      </button>

                      <button
                        onClick={() => setEditingAsset(asset)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg w-full mb-2"
                      >
                        Edit with AI
                      </button>

                      <button
                        onClick={() => {
                          if (confirm("Delete this asset?"))
                            deleteMutation.mutate(asset.id);
                        }}
                        className="flex-1 px-3 py-2 bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white text-xs font-bold rounded-lg border border-red-800"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
