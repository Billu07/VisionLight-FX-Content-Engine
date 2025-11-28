import { useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints } from "../lib/api";

interface PostCardProps {
  post: any;
  onPublishPost: (variables: { postId: string; platform?: string }) => void;
  publishingPost: string | null;
  userCredits: any;
  primaryColor: string;
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(post.title || "");

  const handleMediaError = () => {
    console.error("❌ Failed to load media:", post.mediaUrl);
    setMediaError(true);
  };

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

  const handleVideoLoad = () => {
    setVideoLoading(false);
  };

  const handleVideoError = () => {
    console.error("❌ Video failed to load:", post.mediaUrl);
    setVideoLoading(false);
    setMediaError(true);
  };

  // Use real progress from post data
  const progress = post.progress || 0;
  const isProcessing = post.status === "PROCESSING";
  const isFailed = post.status === "FAILED";
  const isNew = post.status === "NEW";

  const renderMedia = () => {
    console.log("🎬 Rendering media for post:", {
      id: post.id,
      mediaUrl: post.mediaUrl,
      status: post.status,
      progress: progress,
      mediaType: post.mediaType,
      mediaProvider: post.mediaProvider,
    });

    if (!post.mediaUrl) {
      if (isProcessing || isNew) {
        return (
          <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center border border-cyan-400/20">
            <div className="text-center w-full p-4">
              <LoadingSpinner size="md" variant="neon" />
              <p className="text-cyan-400 text-sm mt-3 font-medium">
                {isFailed
                  ? "Generation failed"
                  : "Creating your masterpiece..."}
              </p>

              {/* Real Progress Bar */}
              {isProcessing && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs text-purple-300">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {progress < 30 && "🔄 Initializing generation..."}
                    {progress >= 30 &&
                      progress < 70 &&
                      "🎨 Creating your content..."}
                    {progress >= 70 &&
                      progress < 100 &&
                      "✨ Adding final touches..."}
                    {progress === 100 && "✅ Ready to use!"}
                  </div>
                </div>
              )}

              {isFailed && (
                <p className="text-red-400 text-xs mt-1">
                  Please try again with a different prompt
                </p>
              )}

              {!isFailed && (
                <p className="text-purple-300 text-xs mt-1">
                  {progress < 50
                    ? "This may take a few minutes..."
                    : "Almost there..."}
                </p>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center border border-white/10">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-60">🎬</div>
            <p className="text-purple-300 text-sm">Ready for generation</p>
          </div>
        </div>
      );
    }

    if (mediaError) {
      return (
        <div className="aspect-video bg-gradient-to-br from-red-900/20 to-red-800/20 rounded-xl flex items-center justify-center border border-red-400/30">
          <div className="text-center">
            <div className="text-4xl mb-3">❌</div>
            <p className="text-red-400 text-sm mb-2">Failed to load media</p>
            <button
              onClick={() => {
                setMediaError(false);
                setVideoLoading(true);
              }}
              className="px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-lg border border-red-400/30 hover:bg-red-500/30 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    // Determine media type - FIXED LOGIC
    const isVideo = post.mediaType === "VIDEO" || post.mediaProvider === "sora";
    const isImage =
      post.mediaType === "IMAGE" || post.mediaProvider === "gemini";
    const isCarousel = post.mediaType === "CAROUSEL";

    console.log("📊 Media type detection:", {
      isVideo,
      isImage,
      isCarousel,
      mediaType: post.mediaType,
      provider: post.mediaProvider,
    });

    if (isVideo) {
      return (
        <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-cyan-400/30">
          {videoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <LoadingSpinner size="md" variant="neon" />
              <span className="ml-3 text-cyan-400 text-sm">
                Loading video...
              </span>
            </div>
          )}
          <video
            controls
            className="w-full h-full object-contain"
            onLoadedData={handleVideoLoad}
            onError={handleVideoError}
            preload="metadata"
            playsInline
          >
            <source src={post.mediaUrl} type="video/mp4" />
            <source src={post.mediaUrl} type="video/webm" />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (isImage || isCarousel) {
      return (
        <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden border border-white/10">
          <img
            src={post.mediaUrl}
            alt="Generated content"
            className="w-full h-full object-cover"
            onError={handleMediaError}
            loading="lazy"
          />
        </div>
      );
    }

    // Fallback for unknown types
    return (
      <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center border border-white/10">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-60">📁</div>
          <p className="text-purple-300 text-sm mb-2">Media preview</p>
          <a
            href={post.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 text-sm hover:underline block"
          >
            Open link
          </a>
        </div>
      </div>
    );
  };

  const getStatusInfo = () => {
    switch (post.status) {
      case "PROCESSING":
        return {
          color: "bg-yellow-500/20 text-yellow-400 border-yellow-400/30",
          text: `Processing ${progress}%`,
        };
      case "READY":
        return {
          color: "bg-green-500/20 text-green-400 border-green-400/30",
          text: "Ready",
        };
      case "FAILED":
        return {
          color: "bg-red-500/20 text-red-400 border-red-400/30",
          text: "Failed",
        };
      case "NEW":
        return {
          color: "bg-blue-500/20 text-blue-400 border-blue-400/30",
          text: "Queued",
        };
      default:
        return {
          color: "bg-gray-500/20 text-gray-400 border-gray-400/30",
          text: "Draft",
        };
    }
  };

  const getProviderInfo = () => {
    const provider = post.mediaProvider;
    const mediaType = post.mediaType;

    if (mediaType === "VIDEO" || provider === "sora") {
      return { name: "Sora Video", icon: "🎬", color: "text-pink-400" };
    }
    if (mediaType === "IMAGE" || provider === "gemini") {
      return { name: "AI Image", icon: "🖼️", color: "text-blue-400" };
    }
    if (mediaType === "CAROUSEL") {
      return { name: "AI Carousel", icon: "📱", color: "text-green-400" };
    }
    return { name: "Media", icon: "📁", color: "text-gray-400" };
  };

  const statusInfo = getStatusInfo();
  const providerInfo = getProviderInfo();
  const script = post.script;

  if (compact) {
    return (
      <div className="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all duration-300">
        {/* Media Preview */}
        <div className="mb-3">{renderMedia()}</div>

        {/* Post Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={providerInfo.color}>{providerInfo.icon}</span>
              <span className={`text-xs font-medium ${providerInfo.color}`}>
                {providerInfo.name}
              </span>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full border ${statusInfo.color}`}
            >
              {statusInfo.text}
            </span>
          </div>

          {/* Title/Prompt Section */}
          <div>
            {isEditingTitle ? (
              <div className="flex gap-2 mb-2">
                <input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="flex-1 p-2 bg-gray-700 border border-cyan-400/30 rounded text-white text-xs"
                  placeholder="Enter video title..."
                />
                <button
                  onClick={handleTitleSave}
                  className="px-2 py-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded text-xs"
                >
                  ✅
                </button>
                <button
                  onClick={handleTitleCancel}
                  className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs"
                >
                  ❌
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between group">
                <p className="text-white text-sm line-clamp-2 font-medium">
                  {post.title || post.prompt}
                </p>
                <button
                  onClick={() => {
                    setEditedTitle(post.title || post.prompt);
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white text-xs transition-opacity ml-2"
                >
                  ✏️
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {post.mediaUrl && post.status === "READY" && (
              <>
                <a
                  href={post.mediaUrl}
                  download
                  className="flex-1 px-3 py-2 bg-cyan-500/20 text-cyan-400 text-xs rounded-lg border border-cyan-400/30 hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-1"
                >
                  <span>📥</span>
                  <span>Download</span>
                </a>

                <button
                  onClick={() =>
                    onPublishPost({ postId: post.id, platform: "INSTAGRAM" })
                  }
                  disabled={publishingPost === post.id}
                  className="flex-1 px-3 py-2 gradient-brand text-white text-xs rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1"
                >
                  {publishingPost === post.id ? (
                    <LoadingSpinner size="sm" variant="light" />
                  ) : (
                    <span>📤</span>
                  )}
                  <span>Post</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10 p-6 hover:border-white/20 transition-all duration-300">
      {/* Media Preview */}
      <div className="mb-4">{renderMedia()}</div>

      {/* Post Info */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={providerInfo.color}>{providerInfo.icon}</span>
            <span className={`text-sm font-medium ${providerInfo.color}`}>
              {providerInfo.name}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full border ${statusInfo.color}`}
            >
              {statusInfo.text}
            </span>
          </div>
          <div className="text-xs text-purple-300">
            {new Date(post.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Title/Prompt Section */}
        <div>
          {isEditingTitle ? (
            <div className="flex gap-2 mb-3">
              <input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="flex-1 p-2 bg-gray-700 border border-cyan-400/30 rounded text-white text-sm"
                placeholder="Enter video title..."
              />
              <button
                onClick={handleTitleSave}
                className="px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded text-sm"
              >
                ✅
              </button>
              <button
                onClick={handleTitleCancel}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
              >
                ❌
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between group mb-2">
              <h3 className="text-white font-semibold text-lg cursor-default">
                {post.title || post.prompt}
              </h3>
              <button
                onClick={() => {
                  setEditedTitle(post.title || post.prompt);
                  setIsEditingTitle(true);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white text-sm transition-opacity"
              >
                ✏️ Edit
              </button>
            </div>
          )}

          {/* Show original prompt below title if custom title exists */}
          {post.title && post.title !== post.prompt && (
            <p className="text-purple-300 text-sm mt-1">{post.prompt}</p>
          )}
        </div>

        {/* Script Preview */}
        {script && (
          <div className="text-xs text-purple-300 space-y-2 p-3 bg-gray-700/30 rounded-lg border border-white/5">
            <div className="font-medium text-cyan-400">
              AI-Generated Script:
            </div>
            {script.caption && (
              <div>
                <div className="font-medium mb-1">Caption:</div>
                <div className="space-y-1">
                  {script.caption.map((line: string, index: number) => (
                    <div key={index} className="text-white/80">
                      • {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {script.cta && (
              <div>
                <div className="font-medium">Call to Action:</div>
                <div className="text-green-400 font-medium">{script.cta}</div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-3">
          {post.mediaUrl && post.status === "READY" && (
            <>
              <a
                href={post.mediaUrl}
                download
                className="flex-1 min-w-[120px] px-4 py-2.5 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-400/30 hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <span>📥</span>
                <span>Download</span>
              </a>

              <button
                onClick={() =>
                  onPublishPost({ postId: post.id, platform: "INSTAGRAM" })
                }
                disabled={publishingPost === post.id}
                className="flex-1 min-w-[120px] px-4 py-2.5 gradient-brand text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
              >
                {publishingPost === post.id ? (
                  <>
                    <LoadingSpinner size="sm" variant="light" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <span>📤</span>
                    <span>Publish to Instagram</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
