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
}

// --- NEW HELPER FUNCTION TO FIX THE BUG ---
const getCleanUrl = (url: string) => {
  if (!url) return "";
  const trimmed = url.trim();

  // If it's a JSON array string ["http...", "http..."]
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0]; // Return the first image
      }
    } catch (e) {
      console.warn("Failed to parse array URL:", trimmed);
    }
  }
  return trimmed;
};

export function PostCard({
  post,
  onPublishPost,
  publishingPost,
  compact = false,
}: PostCardProps) {
  const [mediaError, setMediaError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(post.title || "");
  const [isPossiblyStuck, setIsPossiblyStuck] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Carousel State
  const [slideIndex, setSlideIndex] = useState(0);

  // Sync title
  useEffect(() => {
    setEditedTitle(post.title || "");
  }, [post.title]);

  // Stuck detection
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

  const handleTitleSave = async () => {
    try {
      await apiEndpoints.updatePostTitle(post.id, editedTitle);
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Error updating title:", error);
    }
  };

  const handleTitleCancel = () => {
    setEditedTitle(post.title || "");
    setIsEditingTitle(false);
  };

  const handleVideoLoad = () => setVideoLoading(false);

  const handleMediaError = () => {
    if (post.status === "READY") {
      setMediaError(true);
      setVideoLoading(false);
    }
  };

  const manuallyCheckPostStatus = async () => {
    try {
      await apiEndpoints.getPostStatus(post.id);
    } catch (error) {
      console.error("Status check failed:", error);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!post.mediaUrl) return;

    try {
      setIsDownloading(true);
      const response = await api.get(`/posts/${post.id}/download`, {
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
        // Fallback based on type
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
      window.open(getCleanUrl(post.mediaUrl), "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  const progress = post.progress || 0;
  const isProcessing = post.status === "PROCESSING";
  const isFailed = post.status === "FAILED";
  const isNew = post.status === "NEW";
  const isReady = post.status === "READY" || post.status === "PUBLISHED";

  // --- MEDIA RENDERER ---
  const renderMedia = () => {
    if (!post.mediaUrl || isProcessing || isNew) {
      return (
        <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center border border-white/10 relative overflow-hidden">
          <div className="text-center w-full p-4 relative z-10">
            {isFailed ? (
              <div className="text-red-400">
                <span className="text-2xl block mb-2">⚠️</span>
                <span className="text-xs font-bold">Generation Failed</span>
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
          </div>
        </div>
      );
    }

    // === CAROUSEL STACKED CARD DISPLAY ===
    if (post.mediaType === "CAROUSEL" && post.mediaUrl.trim().startsWith("[")) {
      let slides: string[] = [];
      try {
        slides = JSON.parse(post.mediaUrl);
      } catch (e) {}

      // If parsing failed or empty, fallback to empty array
      if (!Array.isArray(slides)) slides = [];

      const nextSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (slides.length > 0)
          setSlideIndex((prev) => (prev + 1) % slides.length);
      };
      const prevSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (slides.length > 0)
          setSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
      };

      if (slides.length > 0) {
        return (
          <div className="relative aspect-video group perspective-1000">
            {/* Stack Effect: Card 3 (Bottom) */}
            {slides.length > 2 && (
              <div
                className="absolute inset-0 bg-gray-800 rounded-xl border border-white/5 transform scale-90 translate-y-3 opacity-40 z-0 transition-all duration-300"
                style={{
                  backgroundImage: `url(${
                    slides[(slideIndex + 2) % slides.length]
                  })`,
                  backgroundSize: "cover",
                  filter: "blur(2px)",
                }}
              />
            )}

            {/* Stack Effect: Card 2 (Middle) */}
            {slides.length > 1 && (
              <div
                className="absolute inset-0 bg-gray-800 rounded-xl border border-white/10 transform scale-95 translate-y-1.5 opacity-70 z-10 transition-all duration-300"
                style={{
                  backgroundImage: `url(${
                    slides[(slideIndex + 1) % slides.length]
                  })`,
                  backgroundSize: "cover",
                }}
              />
            )}

            {/* Main Card (Top) */}
            <div className="absolute inset-0 bg-gray-900 rounded-xl border border-white/20 overflow-hidden z-20 shadow-xl transition-transform duration-300 group-hover:-translate-y-1">
              <img
                src={slides[slideIndex]}
                alt={`Slide ${slideIndex + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Navigation Overlay (On Hover) */}
              <div className="absolute inset-0 flex justify-between items-center px-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                <button
                  onClick={prevSlide}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition-colors"
                >
                  ←
                </button>
                <button
                  onClick={nextSlide}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition-colors"
                >
                  →
                </button>
              </div>

              {/* Counter Badge */}
              <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-white border border-white/10">
                {slideIndex + 1} / {slides.length}
              </div>
            </div>
          </div>
        );
      }
    }

    // Video
    const isVideo = post.mediaType === "VIDEO" || post.mediaProvider === "sora";
    if (isVideo) {
      return (
        <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 group">
          {videoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <LoadingSpinner size="md" variant="neon" />
            </div>
          )}
          <video
            controls={true}
            muted={false}
            loop
            className="w-full h-full object-contain cursor-pointer"
            onLoadedData={handleVideoLoad}
            onError={handleMediaError}
            preload="metadata"
            playsInline
          >
            {/* USE getCleanUrl HERE TOO JUST IN CASE */}
            <source src={getCleanUrl(post.mediaUrl)} type="video/mp4" />
          </video>
        </div>
      );
    }

    // Single Image (FALLBACK)
    // This is where your bug was happening. We now use getCleanUrl()
    return (
      <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden border border-white/10">
        <img
          src={getCleanUrl(post.mediaUrl)}
          alt={post.title}
          className="w-full h-full object-cover transition-transform hover:scale-105"
          onError={handleMediaError}
          loading="lazy"
        />
      </div>
    );
  };

  const getProviderIcon = () => {
    if (post.mediaType === "VIDEO") return "🎬";
    if (post.mediaType === "IMAGE") return "🖼️";
    if (post.mediaType === "CAROUSEL") return "📱";
    return "📁";
  };

  const formattedDate = new Date(post.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const displayTitle =
    post.title ||
    (post.prompt ? post.prompt.substring(0, 50) + "..." : "Untitled");

  return (
    <div
      className={`bg-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all duration-300 ${
        compact ? "mb-3" : "mb-6"
      }`}
    >
      <div className="mb-3 relative">
        {renderMedia()}
        {isReady && (
          <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-500/30 backdrop-blur-md shadow-sm z-30">
            READY
          </div>
        )}
        {post.status === "AWAITING_APPROVAL" && (
          <div className="absolute top-2 right-2 bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse border border-yellow-500/30 shadow-sm z-30">
            APPROVE
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span>{getProviderIcon()}</span>
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
            <button
              onClick={handleTitleSave}
              className="text-cyan-400 hover:text-cyan-300 px-1"
            >
              ✅
            </button>
            <button
              onClick={handleTitleCancel}
              className="text-gray-500 hover:text-gray-300 px-1"
            >
              ❌
            </button>
          </div>
        ) : (
          <div className="group relative pr-6">
            <h3
              className="text-white font-bold text-sm truncate cursor-pointer hover:text-cyan-400 transition-colors"
              onClick={() => setIsEditingTitle(true)}
              title={post.title || post.prompt}
            >
              {displayTitle}
            </h3>
            <button
              onClick={() => {
                setEditedTitle(post.title || "");
                setIsEditingTitle(true);
              }}
              className="absolute right-0 top-0 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✏️
            </button>
          </div>
        )}

        {!compact && (
          <div className="bg-gray-900/50 rounded-lg p-2 border border-white/5">
            <p className="text-gray-400 text-[10px] line-clamp-2 leading-relaxed italic">
              "{post.prompt}"
            </p>
          </div>
        )}

        {isReady && post.mediaUrl && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {isDownloading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <span>⬇️ Download</span>
              )}
            </button>
            <button
              onClick={() =>
                onPublishPost({ prompt: post.prompt, postId: post.id })
              }
              disabled={publishingPost === post.id}
              className="flex-1 bg-gray-700 hover:bg-gray-600 border border-white/10 text-white text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {publishingPost === post.id ? (
                <span className="text-green-400">✔ Copied!</span>
              ) : (
                <span>📋 Copy Prompt</span>
              )}
            </button>
          </div>
        )}

        {isFailed && post.error && (
          <div className="p-2 bg-red-900/20 border border-red-500/20 rounded text-[10px] text-red-300 break-words">
            {post.error}
          </div>
        )}
      </div>
    </div>
  );
}
