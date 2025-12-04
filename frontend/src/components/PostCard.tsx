import { useState, useEffect } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints, api } from "../lib/api";

interface PostCardProps {
  post: any;
  onPublishPost: (variables: { postId: string; platform?: string }) => void;
  publishingPost: string | null;
  userCredits: any;
  primaryColor?: string;
  compact?: boolean;
}

export function PostCard({
  post,
  onPublishPost,
  publishingPost,
  compact = false,
}: PostCardProps) {
  const [mediaError, setMediaError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);

  // Title State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(post.title || "");

  const [isPossiblyStuck, setIsPossiblyStuck] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync state if prop changes
  useEffect(() => {
    setEditedTitle(post.title || "");
  }, [post.title]);

  // Stuck detection logic
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
      // Optimistically update UI could be handled here or via refetch
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
    // Only log if it's not a temporary loading state
    if (post.status === "READY") {
      console.warn(`⚠️ Media failed to load for post ${post.id}`);
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

  // --- DOWNLOAD LOGIC ---
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

      // 1. Try to get filename from backend header
      const contentDisposition = response.headers["content-disposition"];
      let filename = `visionlight-${post.id}.${
        post.mediaType === "VIDEO" ? "mp4" : "jpg"
      }`;

      if (contentDisposition) {
        // Regex to handle filenames with spaces/quotes
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
          contentDisposition
        );
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, "");
        }
      }
      // 2. Fallback to constructing from title locally
      else if (post.title) {
        const ext = post.mediaType === "VIDEO" ? "mp4" : "jpg";
        filename = `${post.title.trim().replace(/\s+/g, "_")}.${ext}`;
      }

      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download proxy failed, using direct link", error);
      window.open(post.mediaUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  const progress = post.progress || 0;
  const isProcessing = post.status === "PROCESSING";
  const isFailed = post.status === "FAILED";
  const isNew = post.status === "NEW";
  const isReady = post.status === "READY" || post.status === "PUBLISHED";

  // --- RENDER HELPERS ---
  const renderMedia = () => {
    // 1. Processing State
    if (!post.mediaUrl || isProcessing || isNew) {
      return (
        <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center border border-white/5 relative overflow-hidden">
          <div className="text-center w-full p-4 relative z-10">
            {isFailed ? (
              <div className="text-red-400">
                <span className="text-2xl block mb-2">⚠️</span>
                <span className="text-xs">Generation Failed</span>
              </div>
            ) : (
              <>
                <LoadingSpinner size="md" variant="neon" />
                <p className="text-purple-300 text-xs mt-3 font-medium tracking-wide">
                  Generating Your Content...
                </p>
                <div className="mt-3 w-32 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {isPossiblyStuck && (
                  <button
                    onClick={manuallyCheckPostStatus}
                    className="mt-4 text-[10px] text-yellow-500 underline"
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

    // 2. Error State
    if (mediaError) {
      return (
        <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center border border-red-500/20">
          <div className="text-center">
            <span className="text-xl block mb-2">❌</span>
            <p className="text-gray-500 text-xs">Media Unavailable</p>
            <button
              onClick={() => {
                setMediaError(false);
                setVideoLoading(true);
              }}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Retry Load
            </button>
          </div>
        </div>
      );
    }

    // 3. Video
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
            controls={!compact}
            muted={compact}
            loop={compact}
            autoPlay={compact}
            className="w-full h-full object-contain"
            onLoadedData={handleVideoLoad}
            onError={handleMediaError} // Catches the 404s
            preload="metadata"
            playsInline
          >
            <source src={post.mediaUrl} type="video/mp4" />
            <source src={post.mediaUrl} type="video/webm" />
          </video>
        </div>
      );
    }

    // 4. Image
    return (
      <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden border border-white/10">
        <img
          src={post.mediaUrl}
          alt={post.title || "Generated Image"}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
          onError={handleMediaError}
          loading="lazy"
        />
      </div>
    );
  };

  // --- METADATA ---
  const getProviderIcon = () => {
    if (post.mediaType === "VIDEO") return "🎬";
    if (post.mediaType === "IMAGE") return "🖼️";
    return "📁";
  };

  const formattedDate = new Date(post.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`bg-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all duration-300 ${
        compact ? "mb-3" : "mb-6"
      }`}
    >
      {/* Media Area */}
      <div className="mb-3 relative">
        {renderMedia()}

        {/* Status Badge */}
        {isReady && (
          <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-500/30 backdrop-blur-md">
            READY
          </div>
        )}
        {post.status === "AWAITING_APPROVAL" && (
          <div className="absolute top-2 right-2 bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse border border-yellow-500/30">
            APPROVE
          </div>
        )}
      </div>

      {/* Info Area */}
      <div className="space-y-3">
        {/* Header Row */}
        <div className="flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span>{getProviderIcon()}</span>
            <span className="uppercase tracking-wider font-semibold opacity-70">
              {post.mediaType}
            </span>
          </div>
          <span>{formattedDate}</span>
        </div>

        {/* Title Editing Section */}
        {isEditingTitle ? (
          <div className="flex gap-2">
            <input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="flex-1 bg-gray-900 border border-cyan-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none"
              placeholder="Enter a title..."
              autoFocus
            />
            <button
              onClick={handleTitleSave}
              className="text-cyan-400 hover:text-cyan-300"
            >
              ✅
            </button>
            <button
              onClick={handleTitleCancel}
              className="text-gray-500 hover:text-gray-300"
            >
              ❌
            </button>
          </div>
        ) : (
          <div className="group relative pr-6">
            <h3
              className="text-white font-bold text-sm truncate cursor-pointer"
              onClick={() => setIsEditingTitle(true)}
            >
              {post.title ? (
                post.title
              ) : (
                <span className="text-gray-500 italic">Untitled Creation</span>
              )}
            </h3>
            {/* Pencil Icon triggers edit */}
            <button
              onClick={() => {
                setEditedTitle(post.title || "");
                setIsEditingTitle(true);
              }}
              className="absolute right-0 top-0 text-gray-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✏️
            </button>
          </div>
        )}

        {/* Prompt Preview (Separate from title) */}
        {!compact && (
          <div className="bg-gray-900/50 rounded-lg p-2 border border-white/5">
            <p className="text-gray-400 text-[10px] line-clamp-2 leading-relaxed italic">
              "{post.prompt}"
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {isReady && post.mediaUrl && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <span>⬇️ Download</span>
              )}
            </button>
            <button
              onClick={() => onPublishPost({ postId: post.id })}
              disabled={publishingPost === post.id}
              className="flex-1 gradient-brand text-white text-xs py-2 rounded-lg hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {publishingPost === post.id ? (
                <LoadingSpinner size="sm" variant="light" />
              ) : (
                <span>🚀 Post</span>
              )}
            </button>
          </div>
        )}

        {/* Error Details */}
        {isFailed && post.error && (
          <div className="p-2 bg-red-900/20 border border-red-500/20 rounded text-[10px] text-red-300">
            {post.error}
          </div>
        )}
      </div>
    </div>
  );
}
