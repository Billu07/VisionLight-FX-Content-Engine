import { useState } from "react";
import { PostCard } from "./PostCard";

interface TimelineExpanderProps {
  posts: any[];
  onClose: () => void;
  userCredits: number;
  brandConfig: any;
  // These props come from Dashboard (functions that take arguments)
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
    <div className="fixed inset-0 z-[60] bg-gray-950 text-white overflow-hidden animate-in fade-in duration-300">
      {/* === TESSERACT BACKGROUND ELEMENTS === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Deep Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]"></div>

        {/* Floating Tesseracts (Cubes) */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 border border-cyan-500/10 rounded-3xl animate-[spin_60s_linear_infinite] opacity-30"></div>
        <div className="absolute top-1/4 left-1/4 w-80 h-80 border border-purple-500/10 rounded-3xl animate-[spin_40s_linear_infinite_reverse] opacity-30"></div>

        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 border border-rose-500/10 rounded-full animate-pulse opacity-20 filter blur-3xl"></div>
      </div>

      {/* === HEADER === */}
      <div className="relative z-10 container mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/5 bg-gray-950/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors group"
          >
            <span className="text-2xl group-hover:-translate-x-1 transition-transform block">
              ←
            </span>
          </button>
          <div>
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-400 to-rose-400">
              Creation Matrix
            </h2>
            <p className="text-xs text-gray-400 tracking-widest uppercase">
              {filteredPosts.length} Artifacts Stored
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex bg-gray-900/80 p-1 rounded-xl border border-white/10">
          {["ALL", "VIDEO", "IMAGE"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${
                filter === f
                  ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* === SCROLLABLE GRID CONTENT === */}
      <div className="relative z-10 container mx-auto px-6 py-8 h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-gray-900/40 backdrop-blur-sm border border-white/5 rounded-2xl p-3 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] group hover:-translate-y-1"
            >
              {/* ✅ FIXED: Wrapped functions to match PostCard signature () => void */}
              <PostCard
                post={post}
                userCredits={userCredits}
                publishingPost={null}
                primaryColor={brandConfig?.primaryColor}
                compact={true}
                // Fix 1: Pass prompt string
                onPublishPost={() => onPublishPost(post.prompt)}
                // Fix 2: Pass url string
                onUseAsStartFrame={onUseAsStartFrame}
                // Fix 3: Wrap drift with post
                onDrift={() => onDrift(post)}
                // Fix 4: Wrap preview with post
                onPreview={() => onPreview(post)}
                // Fix 5: Wrap delete with ID
                onDelete={() => onDelete(post.id)}
                // Fix 6: Check media type before creating move function
                onMoveToAsset={
                  post.mediaType === "IMAGE" || post.mediaType === "CAROUSEL"
                    ? () => onMoveToAsset(post.id)
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        {filteredPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500">
            <div className="text-6xl mb-4 opacity-20">❖</div>
            <p>The void is empty.</p>
          </div>
        )}
      </div>
    </div>
  );
};
