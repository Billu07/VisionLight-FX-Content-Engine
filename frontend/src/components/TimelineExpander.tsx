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

type Theme = "VOID" | "ARCANE" | "MATRIX";

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
  const [theme, setTheme] = useState<Theme>("VOID");

  const filteredPosts = posts.filter((p) => {
    if (filter === "ALL") return true;
    if (filter === "VIDEO")
      return p.mediaType === "VIDEO" || p.mediaProvider?.includes("kling");
    return p.mediaType === "IMAGE" || p.mediaType === "CAROUSEL";
  });

  // --- THEME CONFIGURATION ---
  const themes = {
    VOID: {
      bg: "bg-[#030305]",
      font: "font-sans",
      text: "text-white",
      accent: "text-white",
      cardBg: "bg-gray-900/40 border-white/5 hover:border-white/20",
      buttonActive: "bg-white text-black shadow-lg shadow-white/10",
      buttonInactive: "text-gray-500 hover:text-white",
      icon: "🪐",
    },
    ARCANE: {
      bg: "bg-[#0f0518]", // Deep midnight purple
      font: "font-serif", // Classy serif
      text: "text-purple-100",
      accent: "text-amber-200", // Gold accent
      cardBg: "bg-[#1a0b2e]/60 border-purple-500/20 hover:border-amber-400/40",
      buttonActive:
        "bg-amber-900/80 text-amber-100 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]",
      buttonInactive: "text-purple-400 hover:text-amber-200",
      icon: "✨",
    },
    MATRIX: {
      bg: "bg-black",
      font: "font-mono", // Code font
      text: "text-green-500",
      accent: "text-green-400",
      cardBg: "bg-black/80 border-green-900/50 hover:border-green-500/50",
      buttonActive:
        "bg-green-900/30 text-green-400 border border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]",
      buttonInactive: "text-green-900 hover:text-green-400",
      icon: "💾",
    },
  };

  const t = themes[theme];

  return (
    <div
      className={`fixed inset-0 z-[60] overflow-hidden animate-in fade-in duration-500 ${t.bg} ${t.font} ${t.text} transition-colors duration-700`}
    >
      {/* === BACKGROUND LAYERS === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 1. VOID THEME: The Tesseract */}
        {theme === "VOID" && (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(circle_at_center,black_30%,transparent_80%)]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full animate-[spin_120s_linear_infinite] opacity-20"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/5 rounded-[3rem] animate-[spin_80s_linear_infinite_reverse] opacity-10"></div>
          </>
        )}

        {/* 2. ARCANE THEME: Floating Particles & Glow */}
        {theme === "ARCANE" && (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(88,28,135,0.15),transparent_70%)]"></div>
            {/* Floating Orbs */}
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-amber-200 rounded-full animate-ping opacity-20 duration-[3s]"></div>
            <div className="absolute bottom-1/3 right-1/4 w-1 h-1 bg-purple-300 rounded-full animate-pulse opacity-40 duration-[4s]"></div>
            <div className="absolute top-20 right-20 w-64 h-64 bg-purple-600/10 blur-[100px] rounded-full"></div>
            <div className="absolute bottom-20 left-20 w-96 h-96 bg-amber-600/5 blur-[120px] rounded-full"></div>
          </>
        )}

        {/* 3. MATRIX THEME: Digital Rain / Grid */}
        {theme === "MATRIX" && (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,0,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,transparent,black)]"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-green-900/10 opacity-50"></div>
            <div className="absolute top-0 left-0 w-full h-1 bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-pulse"></div>
          </>
        )}
      </div>

      {/* === HEADER === */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: Branding */}
        <div className="flex items-center gap-6">
          <button
            onClick={onClose}
            className={`group flex items-center justify-center w-10 h-10 rounded-full border border-white/10 ${t.text} hover:scale-110 hover:border-white/30 hover:bg-white/5 transition-all duration-300`}
            title="Close Matrix"
          >
            <span className="text-xl">✕</span>
          </button>

          <div className="flex flex-col">
            <h2 className={`text-2xl tracking-wide ${t.accent} drop-shadow-md`}>
              {theme === "ARCANE"
                ? "The Archive"
                : theme === "MATRIX"
                ? "System Root"
                : "Creation Matrix"}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  theme === "ARCANE" ? "bg-amber-400" : "bg-green-500"
                }`}
              ></span>
              <p
                className={`text-[10px] uppercase tracking-[0.2em] font-medium opacity-60 ${t.text}`}
              >
                {filteredPosts.length} Artifacts
              </p>
            </div>
          </div>
        </div>

        {/* Center: Theme Switcher */}
        <div className="flex gap-4 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 bg-black/20">
          {(["VOID", "ARCANE", "MATRIX"] as Theme[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className={`text-lg transition-transform hover:scale-125 ${
                theme === mode
                  ? "scale-125 opacity-100"
                  : "opacity-40 grayscale"
              }`}
              title={`Switch to ${mode} theme`}
            >
              {themes[mode].icon}
            </button>
          ))}
        </div>

        {/* Right: Filter Tabs */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/5 backdrop-blur-md">
          {["ALL", "VIDEO", "IMAGE"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-5 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all duration-300 ${
                filter === f ? t.buttonActive : t.buttonInactive
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
                className={`group relative rounded-2xl transition-all duration-500 hover:-translate-y-1 ${t.font}`}
              >
                {/* Dynamic Card Background */}
                <div
                  className={`absolute inset-0 backdrop-blur-md rounded-2xl border transition-colors ${t.cardBg}`}
                ></div>

                <div className="relative p-3">
                  <PostCard
                    post={post}
                    userCredits={userCredits}
                    publishingPost={null}
                    primaryColor={brandConfig?.primaryColor}
                    compact={true}
                    // ✅ MINIMAL MODE: Hides buttons, cleaner visuals
                    minimal={true}
                    // Wrapped callbacks to match types
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
            <div
              className={`flex flex-col items-center justify-center h-[50vh] opacity-50 ${t.text}`}
            >
              <div
                className={`w-16 h-16 border rounded-full flex items-center justify-center mb-4 ${
                  theme === "MATRIX" ? "border-green-800" : "border-gray-700"
                }`}
              >
                <span className="text-2xl">❖</span>
              </div>
              <p className="text-sm tracking-widest uppercase">
                {theme === "ARCANE" ? "The Scrolls are Empty" : "No Data Found"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
