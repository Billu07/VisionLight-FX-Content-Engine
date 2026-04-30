import { useState, useEffect, useRef } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import {
  apiEndpoints,
  api,
  getCORSProxyUrl,
  getCORSProxyVideoUrl,
  getDirectDownloadImageUrl,
  getDirectDownloadVideoUrl,
} from "../lib/api";
import { notify } from "../lib/notifications";
import { useQueryClient } from "@tanstack/react-query";

interface PostCardProps {
  post: any;
  onPublishPost: (variables: { postId: string; prompt: string }) => void;
  publishingPost: string | null;
  userCredits: any;
  primaryColor?: string;
  compact?: boolean;
  onUseAsStartFrame?: (url: string) => void;

  // NEW PROPS
  onPreview?: () => void;
  onMoveToAsset?: () => void;
  onDrift?: () => void;
  onDelete?: () => void;
  onAddToSequence?: () => void; // ✅ NEW
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  onTitleUpdated?: (title: string) => Promise<void> | void;
  canEditTitle?: boolean;

  // ✅ MINIMAL PROP (For Expanded Gallery)
  minimal?: boolean;
}

const getCleanUrl = (url: string) => {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
    } catch (e) {
      console.warn("Failed to parse array URL:", trimmed);
    }
  }
  return trimmed;
};

const triggerNativeDownload = (downloadUrl: string, filename: string) => {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export function PostCard({
  post,
  onPublishPost,
  compact = false,
  onPreview,
  onMoveToAsset,
  onDrift,
  onDelete,
  onAddToSequence,
  onPrimaryAction,
  primaryActionLabel,
  onTitleUpdated,
  canEditTitle = true,
  minimal = false,
}: PostCardProps) {
  const queryClient = useQueryClient();
  const [mediaError, setMediaError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(!compact);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(post.title || "");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isPossiblyStuck, setIsPossiblyStuck] = useState(false);

  // Separate loading states for the two download buttons
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [isDownloadingEndFrame, setIsDownloadingEndFrame] = useState(false);

  const [slideIndex, setSlideIndex] = useState(0);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const isVideoPost =
    post.mediaType === "VIDEO" ||
    post.mediaProvider === "sora" ||
    post.mediaProvider?.includes("kling") ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(getCleanUrl(post.mediaUrl || ""));

  // Helper to handle clicks in minimal mode
  const handleCardClick = () => {
    if (minimal && onPreview) {
      onPreview();
    }
  };

  useEffect(() => {
    setEditedTitle(post.title || "");
  }, [post.title]);

  useEffect(() => {
    if (!isVideoPost) return;
    if (!compact) {
      setShouldLoadVideo(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoadVideo(true);
      return;
    }

    setShouldLoadVideo(false);
    const node = videoContainerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          setShouldLoadVideo(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [post.id, post.status, post.mediaUrl, isVideoPost, compact]);

  useEffect(() => {
    if (isVideoPost) {
      setVideoLoading(true);
    }
  }, [post.id, post.mediaUrl, post.mediaType, post.mediaProvider, isVideoPost]);

  useEffect(() => {
    if (
      (post.status === "PROCESSING" || post.status === "NEW") &&
      (post.progress || 0) < 10
    ) {
      const timer = setTimeout(() => setIsPossiblyStuck(true), 120000);
      return () => clearTimeout(timer);
    } else {
      setIsPossiblyStuck(false);
    }
  }, [post.status, post.progress]);

  const handleVideoLoad = () => setVideoLoading(false);

  const handleMediaError = () => {
    if (post.status !== "PROCESSING" && post.status !== "NEW") {
      setMediaError(true);
      setVideoLoading(false);
    }
  };

  const handleTitleSave = async () => {
    const nextTitle = editedTitle.trim();
    if (!nextTitle || isSavingTitle) return;

    const previousTitle = post.title || "";
    const previousPostsQueries = queryClient.getQueriesData({
      queryKey: ["posts"],
    });
    queryClient.setQueriesData({ queryKey: ["posts"] }, (old: any) =>
      Array.isArray(old)
        ? old.map((entry: any) =>
            entry?.id === post.id ? { ...entry, title: nextTitle } : entry,
          )
        : old,
    );

    setIsSavingTitle(true);
    try {
      if (onTitleUpdated) {
        await onTitleUpdated(nextTitle);
      } else {
        await apiEndpoints.updatePostTitle(post.id, nextTitle);
      }
      setIsEditingTitle(false);
    } catch (error) {
      previousPostsQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      setEditedTitle(previousTitle);
      console.error("Error updating title:", error);
      notify.error("Title update failed. Please try again.");
    } finally {
      setIsSavingTitle(false);
    }
  };

  const manuallyCheckPostStatus = async () => {
    try {
      await apiEndpoints.getPostStatus(post.id);
    } catch (error) {
      console.error("Status check failed:", error);
    }
  };

  // --- DOWNLOAD VIDEO HANDLER ---
  const handleDownloadVideo = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!post.mediaUrl) return;
    try {
      setIsDownloadingVideo(true);
      const sourceUrl = getCleanUrl(post.mediaUrl);
      const titleBase = `${post.title || `picdrift-${post.id}`}`
        .replace(/[\\/:*?"<>|]/g, "_")
        .trim();
      const filenameBase = titleBase || `picdrift-${post.id}`;

      if (post.mediaType === "CAROUSEL") {
        const response = await api.get(`/api/posts/${post.id}/download`, {
          responseType: "blob",
        });
        const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
        triggerNativeDownload(blobUrl, `${filenameBase}.zip`);
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
      } else if (post.mediaType === "VIDEO" || isVideoPost) {
        const downloadUrl = getDirectDownloadVideoUrl(
          sourceUrl,
          `${filenameBase}.mp4`,
        );
        triggerNativeDownload(downloadUrl || sourceUrl, `${filenameBase}.mp4`);
      } else {
        const downloadUrl = getDirectDownloadImageUrl(
          sourceUrl,
          `${filenameBase}.jpg`,
        );
        triggerNativeDownload(downloadUrl || sourceUrl, `${filenameBase}.jpg`);
      }
      window.setTimeout(() => setIsDownloadingVideo(false), 900);
      return;
    } catch (error) {
      console.error("Video download failed:", error);
      notify.error("Video download failed. Please try again.");
    }
    setIsDownloadingVideo(false);
  };

  // --- DOWNLOAD END FRAME HANDLER ---
  const handleDownloadEndFrame = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const videoSourceUrl = getCleanUrl(post.mediaUrl || "");
    if (!videoSourceUrl && !post.generatedEndFrame) return;

    try {
      setIsDownloadingEndFrame(true);
      let blob: Blob;
      if (videoSourceUrl) {
        const response = await apiEndpoints.extractLastFrame(videoSourceUrl);
        blob =
          response.data instanceof Blob
            ? response.data
            : new Blob([response.data], { type: "image/jpeg" });
      } else {
        const fallbackResponse = await fetch(post.generatedEndFrame);
        blob = await fallbackResponse.blob();
      }
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `picdrift-end-frame-${post.id}.jpg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("End frame capture failed:", error);
      notify.error("End frame download failed. Please try again.");
    } finally {
      setIsDownloadingEndFrame(false);
    }
  };

  const progress = post.progress || 0;
  const isProcessing = post.status === "PROCESSING" || post.status === "NEW";
  const hasMedia = !!post.mediaUrl && post.mediaUrl.length > 5;
  const isContentVisible = hasMedia && !isProcessing;

  // Media Rendering Logic
  const renderMedia = () => {
    // Dynamic classes to support Minimal Gallery View vs Standard Timeline
    const containerClasses = minimal
      ? "w-full h-full bg-gray-900 flex items-center justify-center relative overflow-hidden"
      : "aspect-video bg-gray-900 rounded-xl flex items-center justify-center border border-white/10 relative overflow-hidden";

    if (!hasMedia || isProcessing) {
      return (
        <div className={containerClasses}>
          <div className="text-center w-full p-4 relative z-10">
            {post.status === "FAILED" && !hasMedia ? (
              <div className="text-red-400">
                <span className="text-2xl block mb-2">⚠️</span>
                <span className="text-xs font-bold">Failed</span>
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="mt-2 text-xs bg-red-900/40 hover:bg-red-900/60 text-red-200 px-2 py-1 rounded transition-colors"
                  >
                    Del
                  </button>
                )}
              </div>
            ) : (
              <>
                <LoadingSpinner size={minimal ? "sm" : "md"} variant="neon" />
                {/* Only show text details if NOT minimal, or if stuck/checking status */}
                {(!minimal || isPossiblyStuck) && (
                  <>
                    <p className="text-purple-300 text-xs mt-3 font-medium tracking-wide">
                      AI Model is Generating...
                    </p>
                    <div className="mt-3 w-full max-w-[140px] mx-auto">
                      <div className="flex justify-between text-[10px] text-purple-300 mb-1">
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* ✅ RESTORED: Uses isPossiblyStuck & manuallyCheckPostStatus */}
                    {isPossiblyStuck && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          manuallyCheckPostStatus();
                        }}
                        className="mt-3 text-[10px] text-yellow-500 underline z-20 relative"
                      >
                        Check Status
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    if (mediaError) {
      return (
        <div className={`${containerClasses} border-red-500/20 bg-red-900/10`}>
          <div className="text-center">
            <span className="text-xl block mb-2">❌</span>
            <button
              onClick={() => {
                setMediaError(false);
                setVideoLoading(true);
              }}
              className="mt-2 text-xs underline text-red-300"
            >
              Retry
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="block mx-auto mt-2 text-xs text-red-400 hover:text-red-200"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      );
    }

    // CAROUSEL
    if (post.mediaType === "CAROUSEL") {
      let slides: string[] = [];
      try {
        slides = JSON.parse(post.mediaUrl);
      } catch (e) {}
      if (!Array.isArray(slides)) slides = [];

      const nextSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (slides.length > 0)
          setSlideIndex((prev) => (prev + 1) % slides.length);
      };

      return (
        <div
          className={`${
            minimal ? "w-full h-full relative" : "relative aspect-video"
          } group cursor-pointer hover:opacity-90 transition-opacity`}
          onClick={onPreview || nextSlide}
        >
          {slides.length > 0 && (
            <img
              src={getCORSProxyUrl(slides[slideIndex], 400, 75)}
              alt="Carousel"
              className={`w-full h-full ${compact ? "object-contain bg-black" : "object-cover"}`}
              loading="lazy"
              decoding="async"
            />
          )}
          {!minimal && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <span className="text-white text-3xl drop-shadow-lg">⤢</span>
            </div>
          )}
          {!minimal && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded border border-white/20">
              {slideIndex + 1} / {slides.length}
            </div>
          )}
        </div>
      );
    }

    // VIDEO
    if (isVideoPost) {
      return (
        <div
          ref={videoContainerRef}
          className={`${
            minimal
              ? "w-full h-full relative"
              : "relative aspect-video bg-black rounded-xl border border-white/10"
          } overflow-hidden group cursor-pointer`}
          onClick={onPreview}
        >
          {videoLoading && !minimal && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <LoadingSpinner size="md" variant="neon" />
            </div>
          )}
          {shouldLoadVideo ? (
            <video
              muted={true}
              loop
              poster={post.generatedEndFrame || undefined}
              className={`w-full h-full ${compact ? "object-contain bg-black" : "object-cover"}`}
              onLoadedData={handleVideoLoad}
              onError={handleMediaError}
              playsInline
              preload="metadata"
              onMouseOver={(e) => minimal && e.currentTarget.play()}
              onMouseOut={(e) => minimal && e.currentTarget.pause()}
            >
              <source src={getCORSProxyVideoUrl(getCleanUrl(post.mediaUrl))} type="video/mp4" />
            </video>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
              <LoadingSpinner size="sm" variant="neon" />
            </div>
          )}

          {!minimal && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/30 transition-all duration-300">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center scale-90 group-hover:scale-100 transition-transform shadow-xl border border-white/30 text-white">
                <svg className="w-5 h-5 ml-1 drop-shadow-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
          )}
        </div>
      );
    }

    // IMAGE
    return (
      <div
        className={`${
          minimal
            ? "w-full h-full relative"
            : "aspect-video bg-gray-900 rounded-xl border border-white/10"
        } overflow-hidden cursor-pointer group relative`}
        onClick={onPreview}
      >
        <img
          src={getCORSProxyUrl(getCleanUrl(post.mediaUrl), 400, 75)}
          alt={post.title}
          className={`w-full h-full ${compact ? "object-contain bg-black" : "object-cover transition-transform hover:scale-105"}`}
          onError={handleMediaError}
          loading="lazy"
        />
        {!minimal && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <span className="text-white text-3xl drop-shadow-lg">⤢</span>
          </div>
        )}
      </div>
    );
  };

  const formattedDate = new Date(post.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const displayTitle =
    post.title ||
    (post.prompt ? post.prompt.substring(0, 50) + "..." : "Untitled");

  // === ✅ MINIMAL MODE UI (Expanded Gallery View) ===
  if (minimal) {
    return (
      <div
        className="relative rounded-xl overflow-hidden cursor-pointer group transition-transform duration-300 w-full h-full"
        onClick={handleCardClick}
      >
        <div className="w-full h-full aspect-square bg-black">
          <div className="w-full h-full [&_video]:object-contain [&_img]:object-contain [&_div]:h-full [&_div]:rounded-none">
            {renderMedia()}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <p className="text-white text-xs font-bold truncate">
            {displayTitle}
          </p>
          <p className="text-[10px] text-gray-400 truncate">{formattedDate}</p>
        </div>

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-2 right-2 p-1.5 bg-red-500/20 text-red-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white backdrop-blur-md z-20"
            title="Delete"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        )}
      </div>
    );
  }

  // === ✅ STANDARD UI (Timeline View) ===
  return (
    <div
      className={`bg-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all duration-300 ${
        compact ? "mb-3" : "mb-6"
      }`}
    >
      <div className="mb-3 relative">{renderMedia()}</div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="uppercase tracking-wider font-semibold opacity-70">
              {post.mediaType}
            </span>
          </div>
          <span>{formattedDate}</span>
        </div>

        {isEditingTitle ? (
          <div className="flex gap-2">
            <input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleTitleSave();
                }
                if (e.key === "Escape") {
                  setEditedTitle(post.title || "");
                  setIsEditingTitle(false);
                }
              }}
              className="flex-1 p-1.5 bg-gray-900 border border-cyan-500/50 rounded text-white text-xs focus:outline-none"
              autoFocus
              disabled={isSavingTitle}
            />
            <button
              onClick={() => void handleTitleSave()}
              disabled={isSavingTitle || !editedTitle.trim()}
              className={`px-2 min-w-10 rounded text-xs font-semibold transition-all ${
                isSavingTitle
                  ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                  : "bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30"
              }`}
            >
              {isSavingTitle ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditedTitle(post.title || "");
                setIsEditingTitle(false);
              }}
              disabled={isSavingTitle}
              className="text-gray-500 px-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="group relative pr-6">
            <h3
              className={`text-white font-bold text-sm truncate ${canEditTitle ? "cursor-pointer hover:text-cyan-400" : ""}`}
              onClick={() => {
                if (canEditTitle) setIsEditingTitle(true);
              }}
              title={post.title}
            >
              {displayTitle}
            </h3>
            {canEditTitle && (
              <button
                onClick={() => setIsEditingTitle(true)}
                className="absolute right-0 top-0 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100"
              >
                Edit
              </button>
            )}
          </div>
        )}

        {isContentVisible && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2">
              {/* ✅ BRIGHT "DOWNLOADING..." BUTTON */}
              <button
                onClick={handleDownloadVideo}
                disabled={isDownloadingVideo}
                className={`flex-1 text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-1 border ${
                  isDownloadingVideo
                    ? "bg-cyan-600/20 text-cyan-300 border-cyan-500 animate-pulse font-bold shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-cyan-400"
                }`}
              >
                {isDownloadingVideo ? (
                  <span>Downloading...</span>
                ) : (
                  <span>Download</span>
                )}
              </button>

              {onPrimaryAction && primaryActionLabel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrimaryAction();
                  }}
                  className="px-3 h-8 text-[11px] rounded-lg bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-300 transition-colors whitespace-nowrap"
                  title={primaryActionLabel}
                >
                  {primaryActionLabel}
                </button>
              )}

              {isVideoPost && onDrift && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDrift();
                    }}
                    className="w-8 h-8 flex items-center justify-center bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 rounded-lg text-rose-300 transition-colors"
                    title="Open in Drift / Extract Frames"
                  >
                    📸
                  </button>
                )}

              {/* ✅ NEW: Add to Sequence Button */}
              {onAddToSequence && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToSequence();
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 rounded-lg text-cyan-300 transition-colors"
                  title="Add to Storyline"
                >
                  ➕
                </button>
              )}

              {onMoveToAsset && (
                <button
                  onClick={onMoveToAsset}
                  className="w-8 h-8 flex items-center justify-center bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded-lg text-purple-300 transition-colors"
                  title="Save to Asset Library"
                >
                  💾
                </button>
              )}

              <button
                onClick={() =>
                  onPublishPost({ prompt: post.prompt, postId: post.id })
                }
                className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 border border-white/10 rounded-lg text-white"
                title="View Prompt Info"
              >
                ℹ️
              </button>

              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-red-300 transition-colors"
                  title="Delete Post"
                >
                  🗑️
                </button>
              )}
            </div>

            {/* ✅ BRIGHT "DOWNLOADING FRAME..." BUTTON */}
            {isVideoPost && hasMedia && (
              <button
                onClick={handleDownloadEndFrame}
                disabled={isDownloadingEndFrame}
                className={`w-full text-[10px] py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 border ${
                  isDownloadingEndFrame
                    ? "bg-purple-600/20 text-purple-300 border-purple-500 animate-pulse font-bold shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                    : "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300"
                }`}
                title="Capture the final frame from this rendered video"
              >
                {isDownloadingEndFrame
                  ? "Capturing Frame..."
                  : "Capture End Frame"}
              </button>
            )}
          </div>
        )}

        {post.status === "FAILED" && post.error && !isContentVisible && (
          <div className="p-2 bg-red-900/20 border border-red-500/20 rounded text-[10px] text-red-300 break-words">
            {post.error}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="block mt-2 text-xs bg-red-900/40 hover:bg-red-900/60 text-white px-2 py-1 rounded transition-colors w-full"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
