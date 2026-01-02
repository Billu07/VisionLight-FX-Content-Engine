import { useState, useEffect } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints, api } from "../lib/api";

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

  // ✅ MINIMAL PROP
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

export function PostCard({
  post,
  onPublishPost,
  compact = false,
  onPreview,
  onMoveToAsset,
  onDrift,
  onDelete,
  minimal = false,
}: PostCardProps) {
  const [mediaError, setMediaError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(post.title || "");
  const [isPossiblyStuck, setIsPossiblyStuck] = useState(false);

  // Separate loading states for the two download buttons
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [isDownloadingEndFrame, setIsDownloadingEndFrame] = useState(false);

  const [slideIndex, setSlideIndex] = useState(0);

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
    try {
      await apiEndpoints.updatePostTitle(post.id, editedTitle);
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Error updating title:", error);
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
      const response = await api.get(`/api/posts/${post.id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const contentDisposition = response.headers["content-disposition"];
      let filename = `visionlight-${post.id}`;
      if (contentDisposition) {
        const matches = /filename="([^"]*)"/.exec(contentDisposition);
        if (matches != null && matches[1]) filename = matches[1];
      } else {
        const ext =
          post.mediaType === "CAROUSEL"
            ? "zip"
            : post.mediaType === "VIDEO"
            ? "mp4"
            : "jpg";
        filename = `${filename}.${ext}`;
      }
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download fallback:", error);
      window.open(getCleanUrl(post.mediaUrl), "_blank");
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  // --- DOWNLOAD END FRAME HANDLER ---
  const handleDownloadEndFrame = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!post.generatedEndFrame) return;

    try {
      setIsDownloadingEndFrame(true);
      const response = await fetch(post.generatedEndFrame);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `end-frame-${post.id}.jpg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("End frame download failed, falling back to tab:", error);
      window.open(post.generatedEndFrame, "_blank");
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
    if (!hasMedia || isProcessing) {
      return (
        <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center border border-white/10 relative overflow-hidden">
          <div className="text-center w-full p-4 relative z-10">
            {post.status === "FAILED" && !hasMedia ? (
              <div className="text-red-400">
                <span className="text-2xl block mb-2">⚠️</span>
                <span className="text-xs font-bold">Generation Failed</span>
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="mt-2 text-xs bg-red-900/40 hover:bg-red-900/60 text-red-200 px-2 py-1 rounded transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            ) : (
              <>
                <LoadingSpinner size="md" variant="neon" />
                <p className="text-purple-300 text-xs mt-3 font-medium tracking-wide">
                  Generating...
                </p>
                <div className="mt-3 w-full max-w-[140px] mx-auto">
                  <div className="flex justify-between text-[10px] text-purple-300 mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
                {isPossiblyStuck && (
                  <button
                    onClick={manuallyCheckPostStatus}
                    className="mt-3 text-[10px] text-yellow-500 underline"
                  >
                    Check Status
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    if (mediaError) {
      return (
        <div className="aspect-video bg-red-900/10 rounded-xl flex items-center justify-center border border-red-500/20">
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
          className="relative aspect-video group cursor-pointer hover:opacity-90 transition-opacity"
          onClick={onPreview || nextSlide}
        >
          {slides.length > 0 && (
            <img
              src={slides[slideIndex]}
              alt="Carousel"
              className="w-full h-full object-cover rounded-xl"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <span className="text-white text-3xl drop-shadow-lg">⤢</span>
          </div>

          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded border border-white/20">
            {slideIndex + 1} / {slides.length}
          </div>
        </div>
      );
    }

    // VIDEO
    if (post.mediaType === "VIDEO" || post.mediaProvider === "sora") {
      return (
        <div
          className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 group cursor-pointer"
          onClick={onPreview}
        >
          {videoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <LoadingSpinner size="md" variant="neon" />
            </div>
          )}
          <video
            muted={true}
            loop
            className="w-full h-full object-cover"
            onLoadedData={handleVideoLoad}
            onError={handleMediaError}
            playsInline
            onMouseOver={(e) => minimal && e.currentTarget.play()} // Auto-play on hover in minimal mode
            onMouseOut={(e) => minimal && e.currentTarget.pause()}
          >
            <source src={getCleanUrl(post.mediaUrl)} type="video/mp4" />
          </video>

          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
            <span className="text-white text-3xl drop-shadow-lg opacity-80 group-hover:opacity-100 transition-opacity">
              ▶
            </span>
          </div>
        </div>
      );
    }

    // IMAGE
    return (
      <div
        className="aspect-video bg-gray-900 rounded-xl overflow-hidden border border-white/10 cursor-pointer group relative"
        onClick={onPreview}
      >
        <img
          src={getCleanUrl(post.mediaUrl)}
          alt={post.title}
          className="w-full h-full object-cover transition-transform hover:scale-105"
          onError={handleMediaError}
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <span className="text-white text-3xl drop-shadow-lg">⤢</span>
        </div>
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

  // === ✅ MINIMAL MODE UI ===
  if (minimal) {
    return (
      <div
        className="relative rounded-xl overflow-hidden cursor-pointer group transition-transform duration-300"
        onClick={handleCardClick}
      >
        {/* Media Container - Reuse existing render logic */}
        <div className="w-full h-full aspect-square bg-black">
          {/* Force the media to cover square for grid */}
          <div className="w-full h-full [&_video]:object-cover [&_img]:object-cover [&_div]:h-full [&_div]:rounded-none">
            {renderMedia()}
          </div>
        </div>

        {/* Hover Overlay: Info at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <p className="text-white text-xs font-bold truncate">
            {displayTitle}
          </p>
          <p className="text-[10px] text-gray-400 truncate">{formattedDate}</p>
        </div>

        {/* Delete Button (Top Right, Hover Only) */}
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

  // === ✅ STANDARD UI (Original) ===
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
              className="flex-1 p-1.5 bg-gray-900 border border-cyan-500/50 rounded text-white text-xs focus:outline-none"
              autoFocus
            />
            <button onClick={handleTitleSave} className="text-cyan-400 px-1">
              ✅
            </button>
            <button
              onClick={() => setIsEditingTitle(false)}
              className="text-gray-500 px-1"
            >
              ❌
            </button>
          </div>
        ) : (
          <div className="group relative pr-6">
            <h3
              className="text-white font-bold text-sm truncate cursor-pointer hover:text-cyan-400"
              onClick={() => setIsEditingTitle(true)}
              title={post.title}
            >
              {displayTitle}
            </h3>
            <button
              onClick={() => setIsEditingTitle(true)}
              className="absolute right-0 top-0 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100"
            >
              ✏️
            </button>
          </div>
        )}

        {isContentVisible && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadVideo}
                disabled={isDownloadingVideo}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {isDownloadingVideo ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <span>⬇️ Download</span>
                )}
              </button>

              {(post.mediaType === "VIDEO" ||
                post.mediaProvider?.includes("kling")) &&
                onDrift && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDrift();
                    }}
                    className="w-8 h-8 flex items-center justify-center bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 rounded-lg text-rose-300 transition-colors"
                    title="Open in Drift / Extract Frames"
                  >
                    ✂️
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

            {post.generatedEndFrame && (
              <button
                onClick={handleDownloadEndFrame}
                disabled={isDownloadingEndFrame}
                className="w-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                title="Use this as the Start Frame for your next clip"
              >
                {isDownloadingEndFrame ? (
                  <LoadingSpinner size="sm" variant="light" />
                ) : (
                  "📥 Download End Frame"
                )}
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
