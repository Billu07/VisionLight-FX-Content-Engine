import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiEndpoints,
  getCORSProxyUrl,
  getCORSProxyVideoUrl,
  getDirectDownloadImageUrl,
} from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import { LoadingSpinner } from "./LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { EditAssetModal } from "./EditAssetModal";
import { DriftFrameExtractor } from "./DriftFrameExtractor";

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ASSET_PAGE_SIZE = 24;

const getAspectProcessingLabel = (tab: string | null | undefined) => {
  if (tab === "9:16") return "9:16 portrait";
  if (tab === "16:9") return "16:9 landscape";
  if (tab === "1:1") return "1:1 square";
  return "asset";
};
interface Asset {
  id: string;
  url: string;
  proxyUrl?: string;
  hlsUrl?: string;
  spriteSheetUrl?: string;
  aspectRatio:
    | "16:9"
    | "9:16"
    | "1:1"
    | "original"
    | "custom"
    | "3DX_FRAME"
    | "VIDEO";
  type: "IMAGE" | "VIDEO";
  createdAt: string;
  originalAssetId?: string | null;
  variations?: Asset[];
  source?: "asset" | "timeline";
}

interface AssetLibraryProps {
  onSelect?: (file: File, url: string, aspectRatio?: string) => void;
  onClose: () => void;
  initialAspectRatio?: string;
  initialTab?:
    | "16:9"
    | "9:16"
    | "1:1"
    | "original"
    | "custom"
    | "VIDEO"
    | "STORYBOARD"
    | "3DX_FRAME"
    | "TIMELINE";
  isSequencerMode?: boolean;
  isPickerMode?: boolean;
  onEditAsset?: (asset: Asset) => void;
}

export function AssetLibrary({
  onSelect,
  onClose,
  initialAspectRatio,
  initialTab,
  isSequencerMode,
  isPickerMode = false,
  onEditAsset,
}: AssetLibraryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "16:9" | "9:16" | "1:1" | "original" | "custom" | "VIDEO" | "STORYBOARD" | "3DX_FRAME" | "TIMELINE"
  >("original");
  const [originalMediaTab, setOriginalMediaTab] = useState<"images" | "videos">(
    "images",
  );
  const [visibleCount, setVisibleCount] = useState(ASSET_PAGE_SIZE);

  // Auto-switch tab based on Dashboard context
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      return;
    }
    if (!initialAspectRatio) {
      setActiveTab("original");
      return;
    }
    const ratio = initialAspectRatio.toLowerCase();

    if (ratio === "portrait" || ratio === "9:16") setActiveTab("9:16");
    else if (ratio === "landscape" || ratio === "16:9") setActiveTab("16:9");
    else if (ratio === "square" || ratio === "1:1") setActiveTab("1:1");
    else if (ratio === "3dx_frame") setActiveTab("3DX_FRAME");
    else setActiveTab("original");
  }, [initialAspectRatio, initialTab]);

  useEffect(() => {
    setVisibleCount(ASSET_PAGE_SIZE);
  }, [activeTab, originalMediaTab]);

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
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [viewingVideoAsset, setViewingVideoAsset] = useState<Asset | null>(
    null,
  );
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const isLibraryFocusMode =
    selectedAsset !== null || editingAsset !== null || viewingVideoAsset !== null;

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
      const ext = asset.url.split('.').pop()?.split('?')[0] || 'jpg';
      const filename = `visionlight-${asset.id}.${ext}`;
      const downloadUrl = getDirectDownloadImageUrl(asset.url, filename) || asset.url;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => setIsDownloading(false), 900);
      return;
    } catch (error) {
      console.error("Direct download failed", error);
      notify.error("Download failed. Please try again.");
    }
    setIsDownloading(false);
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
  const [processingTab, setProcessingTab] = useState<
    | "16:9"
    | "9:16"
    | "1:1"
    | "original"
    | "custom"
    | "VIDEO"
    | "STORYBOARD"
    | "3DX_FRAME"
    | "TIMELINE"
    | null
  >(null);
  const [activeDriftIds, setActiveDriftIds] = useState<Set<string>>(new Set());

  const clearProcessingIndicators = () => {
    setPollingUntil(0);
    setProcessingCount(0);
    setTargetAssetCount(0);
    setProcessingTab(null);
  };

  // 1. Fetch Assets
  const {
    data: assets = [],
    isLoading,
  } = useQuery({
    queryKey: ["assets", activeProject],
    queryFn: async () => {
      const res = await apiEndpoints.getAssets(activeProject);
      return res.data.assets;
    },
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: () => {
      if (isLibraryFocusMode) return false;
      return pollingUntil > Date.now() ? 2500 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
  });

  const { data: timelinePosts = [] } = useQuery({
    queryKey: ["library-timeline-videos", activeProject],
    queryFn: async () => {
      const res = await apiEndpoints.getPosts(activeProject);
      return Array.isArray(res.data.posts) ? res.data.posts : [];
    },
    enabled: !!user,
    staleTime: 5000,
    refetchInterval: () => {
      if (activeTab === "TIMELINE") return 8000;
      if (["16:9", "9:16", "1:1"].includes(activeTab)) return 4000;
      return false;
    },
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const activeAutoProcessTasks = useMemo(() => {
    const parseParams = (raw: any) => {
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
      return {};
    };

    if (!["16:9", "9:16", "1:1"].includes(activeTab)) return [];

    return (timelinePosts as any[]).filter((post) => {
      if (post?.mediaProvider !== "asset-auto-process") return false;
      if (post?.status !== "PROCESSING") return false;
      const params = parseParams(post?.generationParams);
      return params?.aspectRatio === activeTab;
    });
  }, [activeTab, timelinePosts]);

  const timelineVideoAssets = useMemo(() => {
    const extractMediaUrl = (raw: unknown): string => {
      if (typeof raw !== "string") return "";
      const trimmed = raw.trim();
      if (!trimmed.startsWith("[")) return trimmed;

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && typeof parsed[0] === "string") {
          return parsed[0];
        }
      } catch {
        return "";
      }
      return "";
    };

    return (timelinePosts as any[])
      .filter((post) => {
        const isVideo =
          post?.mediaType === "VIDEO" || post?.mediaProvider?.includes("kling");
        const mediaUrl = extractMediaUrl(post?.mediaUrl);
        const isDone = post?.status === "READY" || post?.status === "COMPLETED";
        return isVideo && isDone && mediaUrl.length > 0;
      })
      .map((post) => ({
        id: `timeline_${post.id}`,
        url: extractMediaUrl(post.mediaUrl),
        aspectRatio: "custom" as const,
        type: "VIDEO" as const,
        createdAt: post.createdAt || new Date().toISOString(),
        source: "timeline" as const,
      }));
  }, [timelinePosts]);

  const assetById = useMemo(() => {
    const map = new Map<string, Asset>();
    if (!Array.isArray(assets)) return map;
    for (const asset of assets as Asset[]) {
      map.set(asset.id, asset);
    }
    return map;
  }, [assets]);

  const filteredAssets = useMemo(() => {
    if (activeTab === "STORYBOARD") {
      return storyboardIds
        .map((id) => assetById.get(id))
        .filter(Boolean) as Asset[];
    }
    if (activeTab === "TIMELINE") {
      return timelineVideoAssets;
    }
    if (!Array.isArray(assets)) return [];

    return (assets as Asset[]).filter((a: Asset) => {
      if (activeTab === "VIDEO") {
        return a.type === "VIDEO" && a.aspectRatio === "VIDEO";
      }

      // Originals Tab: STRICTLY raw uploads (no parent)
      if (activeTab === "original") {
        if (originalMediaTab === "images") {
          return (
            a.type === "IMAGE" &&
            a.aspectRatio === "original" &&
            !a.originalAssetId
          );
        }
        return (
          a.type === "VIDEO" &&
          a.aspectRatio === "original" &&
          !a.originalAssetId
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
    });
  }, [
    activeTab,
    originalMediaTab,
    storyboardIds,
    timelineVideoAssets,
    assets,
    assetById,
  ]);

  const displayedAssets = filteredAssets.slice(0, visibleCount);
  const hasMoreAssets = filteredAssets.length > displayedAssets.length;
  const localProcessingCardCount =
    pollingUntil > 0 && processingTab === activeTab ? processingCount : 0;
  const processingCardCount = Math.max(
    localProcessingCardCount,
    activeAutoProcessTasks.length,
  );
  const uploadLimitText =
    activeTab === "VIDEO" || (activeTab === "original" && originalMediaTab === "videos")
      ? "Video upload limit: 25MB"
      : "Image upload limit: 10MB";
  const processingTabAssetCount = useMemo(() => {
    if (!processingTab || !Array.isArray(assets)) return 0;

    return assets.filter((asset: Asset) => {
      if (processingTab === "16:9" || processingTab === "9:16" || processingTab === "1:1") {
        return asset.type === "IMAGE" && asset.aspectRatio === processingTab;
      }
      if (processingTab === "custom") {
        return asset.type === "IMAGE" && (asset.aspectRatio === "custom" || !!asset.originalAssetId);
      }
      if (processingTab === "3DX_FRAME") {
        return asset.type === "IMAGE" && asset.aspectRatio === "3DX_FRAME";
      }
      if (processingTab === "VIDEO") {
        return asset.type === "VIDEO" && asset.aspectRatio === "VIDEO";
      }
      if (processingTab === "original") {
        return asset.aspectRatio === "original" && !asset.originalAssetId;
      }
      return false;
    }).length;
  }, [assets, processingTab]);

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
    if (isLibraryFocusMode) return;
    const interval = setInterval(checkDrifts, 5000);
    return () => clearInterval(interval);
  }, [isLibraryFocusMode]);

  // Polling Cleanup
  useEffect(() => {
    if (pollingUntil > 0) {
      const checkInterval = setInterval(() => {
        if (Date.now() > pollingUntil) {
          clearProcessingIndicators();
          queryClient.invalidateQueries({ queryKey: ["assets"] });
        }
      }, 1000);
      return () => clearInterval(checkInterval);
    }
  }, [pollingUntil, queryClient]);

  useEffect(() => {
    if (targetAssetCount > 0 && processingTabAssetCount >= targetAssetCount) {
      clearProcessingIndicators();
    }
  }, [processingTabAssetCount, targetAssetCount]);

  const requiresProcessedVariant = (file: File) => {
    if (file.type.startsWith("video/")) return false;
    return (
      activeTab !== "original" &&
      activeTab !== "VIDEO" &&
      activeTab !== "custom" &&
      activeTab !== "TIMELINE"
    );
  };

  // Upload Logic
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const selectedFiles = Array.from(files);
      const totalBytes = selectedFiles.reduce(
        (sum, file) => sum + Math.max(file.size, 0),
        0,
      );
      let uploadedBytes = 0;
      const uploadedAssets: any[] = [];
      const processingTasks: Promise<{ ok: boolean }>[] = [];

      for (const file of selectedFiles) {
        const isVideo = file.type.startsWith("video/");
        const formData = new FormData();
        formData.append("image", file);
        formData.append("raw", "true");
        formData.append("aspectRatio", "original");
        const activeProject = localStorage.getItem(
          "visionlight_active_project",
        );
        if (activeProject) formData.append("projectId", activeProject);

        setUploadingFileName(file.name);
        let uploadedBytesForCurrentFile = 0;
        const rawRes = await apiEndpoints.uploadAssetSync(formData, {
          onUploadProgress: (progressEvent) => {
            const loadedFromEvent =
              typeof progressEvent.loaded === "number"
                ? progressEvent.loaded
                : 0;
            const loadedForCurrentFile = Math.min(loadedFromEvent, file.size);
            const delta = Math.max(
              0,
              loadedForCurrentFile - uploadedBytesForCurrentFile,
            );
            if (!delta) return;
            uploadedBytesForCurrentFile = loadedForCurrentFile;
            uploadedBytes = Math.min(totalBytes, uploadedBytes + delta);
            if (totalBytes > 0) {
              setUploadProgressPercent(
                Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)),
              );
            }
          },
        });

        if (file.size > uploadedBytesForCurrentFile) {
          uploadedBytes = Math.min(
            totalBytes,
            uploadedBytes + (file.size - uploadedBytesForCurrentFile),
          );
          if (totalBytes > 0) {
            setUploadProgressPercent(
              Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)),
            );
          }
        }
        const originalAsset = rawRes.data.asset;

        // User-uploaded videos are always stored under Originals > Videos.
        if (isVideo) {
          uploadedAssets.push(originalAsset);
          continue;
        }

        if (requiresProcessedVariant(file)) {
          const processTask = apiEndpoints
            .autoProcessAsset({
              originalAssetId: originalAsset.id,
              aspectRatio: activeTab,
              projectId: activeProject || undefined,
            })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ["library-timeline-videos"] });
              queryClient.invalidateQueries({ queryKey: ["posts"] });
              return { ok: true as const };
            })
            .catch((err: any) => {
              console.error("Auto processing failed:", err);
              const reason =
                typeof err?.message === "string" && err.message.trim().length > 0
                  ? err.message
                  : "Unknown error";
              notify.error(`Auto processing failed for "${file.name}": ${reason}`);
              return { ok: false as const };
            });
          processingTasks.push(processTask);
        }
        uploadedAssets.push(originalAsset);
      }

      setUploadProgressPercent(100);
      if (processingTasks.length > 0) {
        void Promise.allSettled(processingTasks).then((results) => {
          const failedCount = results.reduce((count, result) => {
            if (result.status !== "fulfilled") return count + 1;
            return result.value.ok ? count : count + 1;
          }, 0);

          if (failedCount > 0) {
            setProcessingCount((prev) => Math.max(0, prev - failedCount));
            setTargetAssetCount((prev) => Math.max(0, prev - failedCount));
          }

          if (failedCount >= processingTasks.length) {
            clearProcessingIndicators();
          }

          queryClient.invalidateQueries({ queryKey: ["assets"] });
          queryClient.invalidateQueries({ queryKey: ["posts"] });
          queryClient.invalidateQueries({ queryKey: ["library-timeline-videos"] });
        });
      }
      return uploadedAssets;
    },
    onMutate: (files) => {
      const selectedFiles = Array.from(files);
      const processingFiles = selectedFiles.filter((file) =>
        requiresProcessedVariant(file),
      );
      setIsUploading(true);
      setUploadProgressPercent(0);
      setUploadingFileName(selectedFiles[0]?.name || "");

      if (processingFiles.length > 0) {
        setProcessingTab(activeTab);
        setTargetAssetCount(filteredAssets.length + processingFiles.length);
        setProcessingCount(processingFiles.length);
        // Keep placeholders visible until assets actually appear in grid.
        setPollingUntil(Date.now() + 10 * 60 * 1000);
      } else {
        clearProcessingIndicators();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["library-timeline-videos"] });
    },
    onError: (err: any) => {
      alert("Upload failed: " + err.message);
      clearProcessingIndicators();
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadingFileName("");
      setUploadProgressPercent(0);
    },
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
        const isVideo = file.type.startsWith("video/");
        const maxSize = isVideo ? MAX_VIDEO_FILE_SIZE : MAX_IMAGE_FILE_SIZE;
        if (!file.type.startsWith("image/") && !isVideo) {
          alert(`Skipped "${file.name}": only image and video files are supported.`);
          return;
        }
        if (file.size > maxSize) {
          alert(
            `Skipped "${file.name}": exceeds ${
              isVideo ? "25MB video" : "10MB image"
            } limit.`,
          );
        } else {
          validFiles.items.add(file);
        }
      });
      if (validFiles.files.length > 0) {
        const allVideos = Array.from(validFiles.files).every((file) =>
          file.type.startsWith("video/"),
        );
        if (activeTab === "original" && allVideos) {
          setOriginalMediaTab("videos");
        }
        uploadMutation.mutate(validFiles.files);
      }
      e.target.value = "";
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
    const original = assetById.get(selectedAsset.originalAssetId);

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
              Asset Library
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
            ×
          </button>
        </div>

        {/* CONTROLS */}
        <div className="p-4 sm:p-6 bg-gray-800/50 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between border-b border-gray-800">
          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <div className="flex flex-wrap sm:flex-nowrap bg-gray-950 p-1 rounded-lg border border-gray-700 sm:overflow-x-auto justify-center sm:justify-start gap-1 w-full lg:w-auto">
              {[
                { id: "original", label: "Originals" },
                { id: "16:9", label: "Landscape" },
                { id: "9:16", label: "Portrait" },
                { id: "1:1", label: "Square" },
                { id: "STORYBOARD", label: "Storyboard" },
                { id: "custom", label: "Edited" },
                { id: "TIMELINE", label: "Timeline" },
                { id: "VIDEO", label: "3DX Paths" },
                { id: "3DX_FRAME", label: "3DX Frames" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-[10px] sm:text-xs md:text-sm font-bold whitespace-nowrap transition-all flex-1 sm:flex-none text-center ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTab === "original" && (
              <div className="flex w-full bg-gray-950/80 border border-gray-700 rounded-lg p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setOriginalMediaTab("images")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    originalMediaTab === "images"
                      ? "bg-cyan-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  Images
                </button>
                <button
                  type="button"
                  onClick={() => setOriginalMediaTab("videos")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    originalMediaTab === "videos"
                      ? "bg-cyan-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  Videos
                </button>
              </div>
            )}
            {activeTab === "STORYBOARD" && storyboardIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadZip}
                  disabled={isDownloadingZip}
                  className="px-3 sm:px-4 py-2 text-xs font-bold rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-white border border-cyan-500/30 transition-all flex items-center gap-2 whitespace-nowrap"
                >
                  {isDownloadingZip ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>Download ZIP</>
                  )}
                </button>
                <button
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Clear all items from your Storyboard sequence?",
                        { confirmLabel: "Clear" },
                      )
                    ) {
                      setStoryboardIds([]);
                    }
                  }}
                  className="px-3 sm:px-4 py-2 text-xs font-bold rounded-lg bg-red-900/50 text-red-400 hover:bg-red-900 hover:text-red-300 border border-red-500/30 transition-colors whitespace-nowrap"
                >
                  Clear Sequence
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto justify-start lg:justify-end">
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 sm:px-5 py-2.5 font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-500 flex items-center justify-center transition-colors min-w-[124px] whitespace-nowrap"
            >
              {isUploading ? (
                <div className="flex items-center gap-2 leading-tight">
                  <span className="text-[11px] uppercase tracking-wide">Uploading</span>
                  <span className="text-sm font-extrabold">{uploadProgressPercent}%</span>
                </div>
              ) : (
                <span>Upload Media</span>
              )}
            </button>
            <p className="w-full text-[10px] font-semibold uppercase tracking-widest text-gray-500 sm:w-auto">
              {uploadLimitText}
            </p>
          </div>
        </div>
        {isUploading && (
          <div className="px-4 sm:px-6 pb-3 bg-gray-800/50 border-b border-gray-800">
            <div className="w-full md:max-w-md md:ml-auto">
              <div className="flex items-center justify-between text-[11px] text-cyan-300 mb-1">
                <span className="truncate pr-3">
                  Uploading {uploadingFileName || "media"}
                </span>
                <span>{uploadProgressPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-700/90 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-[width] duration-200"
                  style={{ width: `${uploadProgressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* GRID VIEW */}
        <div
          className={`flex-1 overflow-y-auto p-8 custom-scrollbar ${activeTab === "STORYBOARD" ? "bg-black relative before:content-[''] before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI0MCI+PHJlY3QgeD0iNSIgeT0iNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48cmVjdCB4PSI1IiB5PSIyNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3N2Zz4=')] before:bg-repeat-y before:bg-[length:20px_auto] before:opacity-30 before:pointer-events-none after:content-[''] after:absolute after:inset-y-0 after:right-0 after:w-5 after:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI0MCI+PHJlY3QgeD0iNSIgeT0iNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48cmVjdCB4PSI1IiB5PSIyNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3N2Zz4=')] after:bg-repeat-y after:bg-[length:20px_auto] after:opacity-30 after:pointer-events-none px-12" : "bg-black/40"}`}
        >
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {/* SKELETON CARDS */}
              {processingCardCount > 0 &&
                Array.from({ length: processingCardCount }).map((_, i) => {
                  const task = activeAutoProcessTasks[i];
                  const taskLabel =
                    typeof task?.title === "string" && task.title.trim()
                      ? task.title
                      : `Generating ${getAspectProcessingLabel(activeTab)}`;
                  const progress =
                    typeof task?.progress === "number" && task.progress > 0
                      ? Math.min(99, Math.round(task.progress))
                      : null;
                  return (
                  <div
                    key={task?.id || `skeleton-${i}`}
                    className="aspect-square rounded-xl border border-cyan-500/30 bg-gray-900/50 flex flex-col items-center justify-center animate-pulse"
                  >
                    <LoadingSpinner size="md" variant="default" />
                    <span className="text-cyan-400 text-xs font-bold mt-3 tracking-wide">
                      {taskLabel}
                    </span>
                    {progress !== null && (
                      <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                        Task active {progress}%
                      </span>
                    )}
                  </div>
                  );
                })}

              {filteredAssets.length === 0 && processingCardCount === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500 opacity-60">
                  <span className="text-6xl mb-4">
                    {activeTab === "VIDEO" || activeTab === "TIMELINE" ? "Video" : "Image"}
                  </span>
                  <p>
                    No{" "}
                    {activeTab === "VIDEO"
                      ? "3DX path videos"
                      : activeTab === "TIMELINE"
                        ? "timeline videos"
                        : activeTab === "original" && originalMediaTab === "videos"
                          ? "original videos"
                        : "images"}{" "}
                    found.
                  </p>
                </div>
              ) : (
                displayedAssets.map((asset: Asset, index: number) => (
                  <div
                    key={asset.id}
                    onClick={() => {
                      if (asset.type === "VIDEO") {
                        if (onSelect && (isPickerMode || isSequencerMode)) {
                          // In picker flow, import video directly to the target slot.
                          handleUseImage(asset);
                          return;
                        }
                        setViewingVideoAsset(asset);
                      } else {
                        if (onSelect && isSequencerMode) {
                          handleUseImage(asset);
                          return;
                        }
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
                          src={getCORSProxyVideoUrl(asset.url || asset.proxyUrl || asset.hlsUrl || "")}
                          poster={
                            asset.spriteSheetUrl
                              ? getCORSProxyUrl(asset.spriteSheetUrl, 400, 65)
                              : undefined
                          }
                          className="w-full h-full object-contain opacity-80"
                          preload="none"
                          playsInline
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
                        decoding="async"
                        crossOrigin="anonymous"
                      />
                    )}

                    {activeDriftIds.has(asset.id) && (
                      <div className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg z-10 animate-pulse">
                        Drift Ready
                      </div>
                    )}
                  </div>
                ))
              )}
              {hasMoreAssets && (
                <div className="col-span-full flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + ASSET_PAGE_SIZE)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Load More
                  </button>
                </div>
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
                            activeTab === "TIMELINE" ? "Timeline Videos" :
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
                    ←
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
                    →
                  </button>
                </div>

                <img
                  id="preview-image-main"
                  src={getCORSProxyUrl(selectedAsset.url, 1440, 76)}
                  className="max-w-full max-h-full object-contain rounded shadow-lg"
                  crossOrigin="anonymous"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
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
                  ×
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
                        : selectedAsset.aspectRatio === "16:9"
                          ? "Landscape 16:9"
                          : selectedAsset.aspectRatio === "9:16"
                            ? "Portrait 9:16"
                            : selectedAsset.aspectRatio === "1:1"
                              ? "Square 1:1"
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
                      ? "Remove From Storyboard"
                      : "Add to Storyboard"}
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
                      if (onEditAsset) {
                        onEditAsset(selectedAsset);
                      } else {
                        setEditingAsset(selectedAsset);
                      }
                      setSelectedAsset(null);
                    }}
                    className={`w-full py-2 sm:py-3 border rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm ${activeDriftIds.has(selectedAsset.id) ? "bg-rose-600 text-white border-rose-500" : "bg-purple-600/20 text-purple-300 border-purple-500/50"}`}
                  >
                    <span>
                      {activeDriftIds.has(selectedAsset.id)
                        ? "Resume Drift"
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
                  onClick={async () => {
                    if (await confirmAction("Delete this asset?", { confirmLabel: "Delete" }))
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
              ×
            </button>
            <div className="w-full flex justify-between items-center mb-4 pr-6 shrink-0">
              <img src="/drift_icon.png" alt="Drift" className="w-16 h-16 sm:w-24 sm:h-24 object-contain" />
              <h3 className="text-white font-bold tracking-widest text-xs sm:text-sm">
                3DX FRAME CAPTURE
              </h3>
            </div>
            <DriftFrameExtractor
              videoUrl={
                viewingVideoAsset.url ||
                viewingVideoAsset.proxyUrl ||
                viewingVideoAsset.hlsUrl ||
                ""
              }
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



