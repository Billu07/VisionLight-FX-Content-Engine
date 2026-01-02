import { useState } from "react";
import { PostCard } from "./PostCard";

interface TimelineExpanderProps {
  posts: any[];
  onClose: () => void;
  userCredits: number;
  brandConfig: any;
  onPublishPost: (prompt: string) => void;
  onUseAsStartFrame: (url: string) => void;
  onDrift: (post: any) => void;
  onPreview: (post: any) => void;
  onMoveToAsset: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TimelineExpander = ({
  posts,
  onClose,
  userCredits,
  brandConfig,
  onPublishPost,
  onUseAsStartFrame,
  onDrift,
  onPreview,
  onMoveToAsset,
  onDelete,
}: TimelineExpanderProps) => {
  const [filter, setFilter] = useState<"ALL" | "VIDEO" | "IMAGE">("ALL");

  const filteredPosts = posts.filter((p) => {
    if (filter === "ALL") return true;
    if (filter === "VIDEO")
      return p.mediaType === "VIDEO" || p.mediaProvider?.includes("kling");
    return p.mediaType === "IMAGE" || p.mediaType === "CAROUSEL";
  });

  return (
    <div className="fixed inset-0 z-[60] bg-[#030305] text-white overflow-hidden animate-in fade-in duration-500 font-sans">
      {/* === SUBTLE ATMOSPHERE (No heavy gradients) === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Faint Grid - Barely visible */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(circle_at_center,black_30%,transparent_80%)]"></div>

        {/* The Tesseract - Slow, Monochromatic Rotation */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full animate-[spin_120s_linear_infinite] opacity-20 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/5 rounded-[3rem] animate-[spin_80s_linear_infinite_reverse] opacity-10 pointer-events-none"></div>
      </div>

      {/* === HEADER === */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: Branding & Stats */}
        <div className="flex items-center gap-6">
          <button
            onClick={onClose}
            className="group flex items-center justify-center w-10 h-10 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all duration-300"
            title="Close Matrix"
          >
            <span className="text-xl group-hover:scale-90 transition-transform">
              ✕
            </span>
          </button>

          <div className="flex flex-col">
            <h2 className="text-2xl font-light tracking-wide text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              Creation Matrix
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-medium">
                {filteredPosts.length} Artifacts Online
              </p>
            </div>
          </div>
        </div>

        {/* Right: Minimalist Filter Tabs */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/5 backdrop-blur-md">
          {["ALL", "VIDEO", "IMAGE"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-5 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all duration-300 ${
                filter === f
                  ? "bg-white text-black shadow-lg shadow-white/10"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* === CONTENT GRID === */}
      <div className="relative z-10 h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar px-6 pb-20">
        <div className="max-w-7xl mx-auto pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="group relative rounded-2xl transition-all duration-500 hover:-translate-y-1"
              >
                {/* Glass Card Background */}
                <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 group-hover:border-white/20 transition-colors"></div>

                {/* Hover Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"></div>

                <div className="relative p-3">
                  <PostCard
                    post={post}
                    userCredits={userCredits}
                    publishingPost={null}
                    primaryColor={brandConfig?.primaryColor}
                    compact={true}
                    // Callbacks wrapped correctly
                    onPublishPost={() => onPublishPost(post.prompt)}
                    onUseAsStartFrame={onUseAsStartFrame}
                    onDrift={() => onDrift(post)}
                    onPreview={() => onPreview(post)}
                    onDelete={() => onDelete(post.id)}
                    onMoveToAsset={
                      post.mediaType === "IMAGE" ||
                      post.mediaType === "CAROUSEL"
                        ? () => onMoveToAsset(post.id)
                        : undefined
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Empty State */}
          {filteredPosts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-gray-600">
              <div className="w-16 h-16 border border-gray-800 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">❖</span>
              </div>
              <p className="text-sm font-light tracking-widest uppercase">
                No Artifacts Detected
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
