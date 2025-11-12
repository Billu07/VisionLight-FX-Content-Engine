import { useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

interface PostCardProps {
  post: any;
  onGenerateMedia: (postId: string, provider: string) => void;
  generatingMedia: Record<string, string>;
  userCredits: { sora: number; gemini: number; bannerbear: number };
  primaryColor: string;
}

export const PostCard = ({
  post,
  onGenerateMedia,
  generatingMedia,
  userCredits,
  primaryColor,
}: PostCardProps) => {
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const isGenerating = generatingMedia[post.id];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "READY":
        return "text-green-600 bg-green-100";
      case "PROCESSING":
        return "text-blue-600 bg-blue-100";
      case "FAILED":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getMediaTypeIcon = (type: string) => {
    switch (type) {
      case "VIDEO":
        return "🎬";
      case "IMAGE":
        return "🖼️";
      case "CAROUSEL":
        return "🎪";
      default:
        return "📄";
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            <span className="font-medium text-gray-700">Prompt:</span>{" "}
            {post.prompt}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                post.status
              )}`}
            >
              {post.status}
            </span>
            {post.mediaType && (
              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium flex items-center gap-1">
                {getMediaTypeIcon(post.mediaType)}{" "}
                {post.mediaType.toLowerCase()}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {new Date(post.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Script Content */}
      <div className="mb-4">
        <div className="space-y-2 mb-3">
          {post.script.caption.map((line: string, i: number) => (
            <p
              key={i}
              className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-200"
            >
              {line}
            </p>
          ))}
        </div>
        <p className="text-xs font-medium text-blue-600 bg-blue-50 p-2 rounded-lg">
          <span className="font-semibold">CTA:</span> {post.script.cta}
        </p>
      </div>

      {/* Media Preview or Generation Buttons */}
      {post.mediaUrl ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-gray-700">
              Generated Media:
            </span>
            <span className="text-lg">{getMediaTypeIcon(post.mediaType)}</span>
          </div>
          {post.mediaType === "VIDEO" ? (
            <video
              src={post.mediaUrl}
              controls
              className="w-full rounded-lg shadow-sm max-h-64 object-cover"
            />
          ) : post.mediaType === "CAROUSEL" ? (
            <div className="text-center">
              <img
                src={post.mediaUrl}
                alt="Carousel"
                className="max-h-64 mx-auto rounded-lg border-2 border-gray-300"
              />
              <p className="text-xs text-gray-500 mt-2">
                4-slide carousel template
              </p>
            </div>
          ) : (
            <img
              src={post.mediaUrl}
              alt="Generated"
              className="w-full max-h-64 object-cover rounded-lg border-2 border-gray-300"
            />
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <span>🎨</span>
            Generate Media for this Post
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              {
                provider: "sora",
                label: "Sora Video",
                icon: "🎬",
                description: "15-sec animated video",
              },
              {
                provider: "gemini",
                label: "Gemini Image",
                icon: "🖼️",
                description: "High-quality image",
              },
              {
                provider: "bannerbear",
                label: "Bannerbear",
                icon: "🎪",
                description: "4-slide carousel",
              },
            ].map(({ provider, label, icon, description }) => {
              const hasCredits =
                userCredits[provider as keyof typeof userCredits] > 0;
              const isCurrentlyGenerating = isGenerating === provider;

              return (
                <div
                  key={provider}
                  className="relative"
                  onMouseEnter={() => setShowTooltip(provider)}
                  onMouseLeave={() => setShowTooltip(null)}
                >
                  <button
                    onClick={() => onGenerateMedia(post.id, provider)}
                    disabled={!!isGenerating || !hasCredits}
                    className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all duration-200 flex flex-col items-center gap-2 ${
                      !hasCredits
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : isCurrentlyGenerating
                        ? "bg-blue-100 text-blue-700 border-2 border-blue-300"
                        : "bg-white text-gray-700 border-2 border-gray-300 hover:border-blue-500 hover:shadow-md"
                    }`}
                    style={{
                      borderColor:
                        hasCredits && !isCurrentlyGenerating
                          ? primaryColor
                          : undefined,
                    }}
                  >
                    <span className="text-lg">{icon}</span>
                    <span>{label}</span>
                    {isCurrentlyGenerating && (
                      <LoadingSpinner size="sm" color="blue" />
                    )}
                  </button>

                  {/* Tooltip */}
                  {showTooltip === provider && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10">
                      {description}
                      {!hasCredits && " - No credits left"}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Credit Status */}
          <div className="mt-3 text-xs text-gray-500 text-center">
            {Object.values(userCredits).every((v) => v === 0) ? (
              <span className="text-orange-600 font-medium">
                🎯 Demo credits exhausted. Upgrade to continue creating!
              </span>
            ) : (
              <span>
                Click any media type to generate content using your demo credits
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
