import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorAlert } from "../components/ErrorAlert";
import { PostCard } from "../components/PostCard";
import { BrandConfigModal } from "../components/BrandConfigModal";
import { WelcomeTour } from "../components/WelcomeTour";
import { ProductionStudio } from "../components/ProductionStudio";

type MediaType = "video" | "image" | "carousel";

interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  progress?: number;
  result?: any;
  error?: string;
}

function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [selectedMediaType, setSelectedMediaType] =
    useState<MediaType>("video");
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(12);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [generationState, setGenerationState] = useState<GenerationState>({
    status: "idle",
  });
  const [publishingPost, setPublishingPost] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [isProductionActive, setIsProductionActive] = useState(false);

  // Async UX state
  const [queuedPostId, setQueuedPostId] = useState<string | null>(null);
  const [showQueuedModal, setShowQueuedModal] = useState(false);
  const [readyPostId, setReadyPostId] = useState<string | null>(null);
  const [showReadyModal, setShowReadyModal] = useState(false);

  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  // Initialize auth check on component mount
  useEffect(() => {
    const { checkAuth } = useAuth.getState();
    checkAuth();
  }, []);

  // === Fetch Brand Config ===
  const { data: brandConfig } = useQuery({
    queryKey: ["brand-config"],
    queryFn: async () => {
      const response = await apiEndpoints.getBrandConfig();
      return response.data.config;
    },
    enabled: !!user,
  });

  // Apply brand colors globally using CSS variables
  useEffect(() => {
    const applyBrandColors = () => {
      const primary = brandConfig?.primaryColor || "#6366f1";
      const secondary = brandConfig?.secondaryColor || "#8b5cf6";

      document.documentElement.style.setProperty("--primary-brand", primary);
      document.documentElement.style.setProperty(
        "--secondary-brand",
        secondary
      );

      // Also update meta theme color for mobile browsers
      const metaThemeColor = document.querySelector("meta[name=theme-color]");
      if (metaThemeColor) {
        metaThemeColor.setAttribute("content", primary);
      }
    };

    applyBrandColors();

    // Re-apply on window focus (in case of updates)
    const handleFocus = () => applyBrandColors();
    window.addEventListener("focus", handleFocus);

    return () => window.removeEventListener("focus", handleFocus);
  }, [brandConfig]);

  // Check if first-time user
  useEffect(() => {
    if (user && !localStorage.getItem("visionlight_welcome_shown")) {
      setShowWelcomeTour(true);
      localStorage.setItem("visionlight_welcome_shown", "true");
    }
  }, [user]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      console.log("No user found, redirecting to login");
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // === Fetch Posts with auto-refresh ===
  const {
    data: posts = [],
    isLoading: postsLoading,
    error: postsError,
  } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const response = await apiEndpoints.getPosts();
      console.log("📦 Posts fetched:", response.data.posts); // Debug log
      return response.data.posts;
    },
    enabled: !!user,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Add this useEffect to monitor post status changes
  useEffect(() => {
    if (posts.length > 0) {
      const processingPosts = posts.filter(
        (p: any) => p.status === "PROCESSING"
      );
      const readyPosts = posts.filter((p: any) => p.status === "READY");
      const failedPosts = posts.filter((p: any) => p.status === "FAILED");

      console.log("📊 Post Status Summary:", {
        total: posts.length,
        processing: processingPosts.length,
        ready: readyPosts.length,
        failed: failedPosts.length,
      });

      // Log media URLs for debugging
      readyPosts.forEach((post: any) => {
        if (post.mediaUrl) {
          console.log(`🎬 Ready post ${post.id}:`, post.mediaUrl);
        }
      });
    }
  }, [posts]);

  // Add this useEffect to see if posts are coming through
  useEffect(() => {
    console.log("🎯 Dashboard Posts State:", {
      postsCount: posts.length,
      posts: posts.map((p: any) => ({
        id: p.id,
        status: p.status,
        hasMedia: !!p.mediaUrl,
        mediaType: p.mediaType,
      })),
    });
  }, [posts]);
  // === Watch for newly READY posts and show "video ready" popup ===
  useEffect(() => {
    if (!posts || posts.length === 0) return;

    const readyPosts = posts.filter((p: any) => p.status === "READY");
    if (readyPosts.length === 0) return;

    const seenRaw =
      localStorage.getItem("visionlight_seen_ready_posts") || "[]";
    let seen: string[] = [];
    try {
      seen = JSON.parse(seenRaw);
    } catch {
      seen = [];
    }

    const newReady = readyPosts.find((p: any) => !seen.includes(p.id));
    if (newReady) {
      setReadyPostId(newReady.id);
      setShowReadyModal(true);
      const updated = [...seen, newReady.id];
      localStorage.setItem(
        "visionlight_seen_ready_posts",
        JSON.stringify(updated)
      );
    }
  }, [posts]);

  // === Fetch User Credits ===
  const {
    data: userCredits = { video: 2, image: 2, carousel: 2 },
    isLoading: creditsLoading,
  } = useQuery({
    queryKey: ["user-credits"],
    queryFn: async () => {
      const response = await apiEndpoints.getUserCredits();
      return response.data.credits;
    },
    enabled: !!user,
  });

  // === Fetch ROI Metrics ===
  const {
    data: roiMetrics = { postsCreated: 0, timeSaved: 0, mediaGenerated: 0 },
  } = useQuery({
    queryKey: ["roi-metrics"],
    queryFn: async () => {
      const response = await apiEndpoints.getROIMetrics();
      return response.data.metrics;
    },
    enabled: !!user,
  });

  // === Direct Media Generation Mutation (async, fire-and-forget) ===
  const generateMediaMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setIsProductionActive(true);
      return apiEndpoints.generateMediaDirect(formData);
    },
    onSuccess: (response) => {
      const data = (response as any)?.data ?? response;

      console.log("🔍 /api/generate-media response:", data);

      if (data?.success && data.status === "processing" && data.postId) {
        setGenerationState({
          status: "generating",
          result: { postId: data.postId },
          progress: 10,
        });
        setQueuedPostId(data.postId);
        setShowQueuedModal(true);
      } else {
        setGenerationState({
          status: "error",
          error:
            "Unexpected response from server while starting generation. Please try again.",
        });
      }

      setIsProductionActive(false);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      queryClient.invalidateQueries({ queryKey: ["roi-metrics"] });
    },
    onError: (error: any) => {
      console.error("Generate media error:", error);
      setGenerationState({
        status: "error",
        error: error.message || "Failed to start generation",
      });
      setIsProductionActive(false);
    },
  });

  // === Publish Post Mutation ===
  const publishMutation = useMutation({
    mutationFn: ({ postId, platform }: { postId: string; platform?: string }) =>
      apiEndpoints.publishPost({ postId, platform }),
    onMutate: ({ postId }) => {
      setPublishingPost(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onSettled: () => {
      setPublishingPost(null);
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      const imageUrl = URL.createObjectURL(file);
      setReferenceImageUrl(imageUrl);
      console.log("Reference image selected:", file.name);
    }
  };

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("mediaType", selectedMediaType);

    if (selectedMediaType === "video" && videoDuration) {
      formData.append("duration", videoDuration.toString());
    }

    if (referenceImage) {
      formData.append("referenceImage", referenceImage);
    }

    return formData;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || userCredits[selectedMediaType] <= 0) return;
    const formData = buildFormData();
    generateMediaMutation.mutate(formData);
  };

  const handleRetryPosts = () => {
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Apply brand colors dynamically
  const primaryColor = brandConfig?.primaryColor || "#6366f1";
  const secondaryColor = brandConfig?.secondaryColor || "#8b5cf6";
  const companyName = brandConfig?.companyName || "Visionlight AI";

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative">
            <LoadingSpinner size="lg" variant="neon" />
          </div>
          <p className="mt-6 text-purple-200 text-lg font-medium">
            Loading your creative studio...
          </p>
          <p className="mt-2 text-purple-400 text-sm">
            Preparing your AI content dashboard
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      {/* Video queued modal */}
      {showQueuedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 rounded-2xl border border-cyan-400/40 shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Your video is in the queue 🎬
            </h3>
            <p className="text-sm text-purple-200 mb-4">
              We&apos;ve started generating your video. It will typically be
              ready in a couple of minutes and will appear in your content
              library once it&apos;s done.
            </p>
            {queuedPostId && (
              <p className="text-xs text-purple-400 mb-4">
                Post ID: <span className="font-mono">{queuedPostId}</span>
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowQueuedModal(false)}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video ready modal */}
      {showReadyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 rounded-2xl border border-green-400/40 shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-2">
              Your video is ready ✅
            </h3>
            <p className="text-sm text-purple-200 mb-4">
              Your generated video has finished processing. You can preview it
              from your content library below.
            </p>
            {readyPostId && (
              <p className="text-xs text-purple-400 mb-4">
                Post ID: <span className="font-mono">{readyPostId}</span>
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowReadyModal(false)}
                className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium"
              >
                Awesome
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Tour */}
      {showWelcomeTour && (
        <WelcomeTour onClose={() => setShowWelcomeTour(false)} />
      )}

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Premium Header */}
        <div className="mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                }}
              >
                <span className="text-white font-bold text-lg">✨</span>
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-1 leading-tight brand-gradient-text">
                  {companyName}
                </h1>
                <p className="text-purple-300 text-sm">
                  Welcome back,{" "}
                  <span className="font-semibold text-white">
                    {user.name || user.email}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Premium Stats & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Credits Display - Compact & Elegant */}
            <div className="bg-gray-800/60 backdrop-blur-lg rounded-2xl px-4 py-3 border border-purple-500/20">
              <div className="flex items-center gap-4">
                {!creditsLoading ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      <span className="text-white text-sm font-medium">
                        Credits:
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {[
                        {
                          key: "video" as MediaType,
                          icon: "🎬",
                          color: "bg-pink-500",
                        },
                        {
                          key: "image" as MediaType,
                          icon: "🖼️",
                          color: "bg-blue-500",
                        },
                        {
                          key: "carousel" as MediaType,
                          icon: "📱",
                          color: "bg-green-500",
                        },
                      ].map((credit) => (
                        <div
                          key={credit.key}
                          className="flex items-center gap-1.5"
                        >
                          <span className="text-sm">{credit.icon}</span>
                          <span
                            className={`text-xs font-semibold ${
                              userCredits[credit.key] > 0
                                ? "text-white"
                                : "text-gray-400"
                            }`}
                          >
                            {userCredits[credit.key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <LoadingSpinner size="sm" variant="neon" />
                    <span className="text-purple-300 text-sm">
                      Loading credits...
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowBrandModal(true)}
                className="px-4 py-2.5 bg-gray-800/60 backdrop-blur-lg border border-cyan-400/30 rounded-xl hover:bg-cyan-400/10 transition-all duration-200 font-medium flex items-center gap-2 text-sm text-cyan-400 hover:scale-105"
              >
                <span>🎨</span>
                Brand
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 bg-gray-800/60 backdrop-blur-lg border border-purple-400/30 rounded-xl hover:bg-purple-400/10 transition-all duration-200 font-medium text-purple-300 text-sm hover:scale-105"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* ROI Metrics - Compact & Visual */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            {
              label: "Content",
              value: roiMetrics.postsCreated,
              subtitle: "Posts",
              icon: "📝",
              gradient: "from-blue-500 to-cyan-500",
            },
            {
              label: "Time Saved",
              value: `${Math.floor(roiMetrics.timeSaved / 60)}h`,
              subtitle: "Efficiency",
              icon: "⏱️",
              gradient: "from-purple-500 to-pink-500",
            },
            {
              label: "Media",
              value: roiMetrics.mediaGenerated,
              subtitle: "Generated",
              icon: "🎬",
              gradient: "from-green-500 to-emerald-500",
            },
          ].map((metric, index) => (
            <div
              key={index}
              className="bg-gray-800/40 backdrop-blur-sm rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all duration-300 group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-300 font-medium mb-1">
                    {metric.label}
                  </p>
                  <p
                    className={`text-2xl font-bold bg-gradient-to-r ${metric.gradient} bg-clip-text text-transparent`}
                  >
                    {metric.value}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {metric.subtitle}
                  </p>
                </div>
                <div className="text-2xl opacity-80 group-hover:scale-110 transition-transform">
                  {metric.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Generation Engine - Premium Focus */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Generation Panel - Takes 2/3 space */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-8 shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-3 mb-8">
                <div className="w-3 h-8 rounded-full gradient-brand"></div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Create Magic
                  </h2>
                  <p className="text-purple-300 text-sm">
                    Transform your ideas into stunning content
                  </p>
                </div>
              </div>

              {/* Media Type Selection - Premium Toggle */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-white mb-4">
                  🎬 Select Content Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      type: "video" as MediaType,
                      label: "Sora Video",
                      icon: "🎬",
                      description: "AI video generation",
                      gradient: "from-pink-500 to-rose-500",
                    },
                    {
                      type: "image" as MediaType,
                      label: "Gemini Image",
                      icon: "🖼️",
                      description: "AI image generation",
                      gradient: "from-blue-500 to-cyan-500",
                    },
                    {
                      type: "carousel" as MediaType,
                      label: "AI Carousel",
                      icon: "📱",
                      description: "Multi-image posts",
                      gradient: "from-green-500 to-emerald-500",
                    },
                  ].map(({ type, label, icon, gradient }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedMediaType(type)}
                      disabled={userCredits[type] <= 0}
                      className={`p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                        selectedMediaType === type
                          ? `border-white/20 bg-gradient-to-br ${gradient} shadow-2xl scale-105`
                          : "border-white/5 bg-gray-800/50 hover:border-white/10 hover:scale-102"
                      } ${
                        userCredits[type] <= 0
                          ? "opacity-40 cursor-not-allowed grayscale"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl group-hover:scale-110 transition-transform">
                          {icon}
                        </span>
                        <div className="flex-1">
                          <div
                            className={`font-semibold text-sm ${
                              selectedMediaType === type
                                ? "text-white"
                                : "text-white"
                            }`}
                          >
                            {label}
                          </div>
                          <div
                            className={`text-xs ${
                              selectedMediaType === type
                                ? "text-white/80"
                                : "text-purple-300"
                            }`}
                          >
                            {userCredits[type]} credits
                          </div>
                        </div>
                        {selectedMediaType === type && (
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Prompt Input - Premium Styling */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    💡 Your Creative Vision
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={`Describe your ${selectedMediaType} vision...\nExample: "A futuristic cityscape at dusk with flying vehicles and neon-lit skyscrapers"`}
                    className="w-full p-5 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all duration-300 resize-none text-white placeholder-purple-300/60 backdrop-blur-sm text-lg leading-relaxed"
                    rows={4}
                  />
                </div>

                {/* Video Duration - Premium Toggle */}
                {selectedMediaType === "video" && (
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-white">
                      ⏱️ Video Duration
                    </label>
                    <div className="flex gap-2">
                      {[4, 8, 12].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setVideoDuration(sec as 4 | 8 | 12)}
                          className={`px-5 py-3 rounded-xl border text-sm font-semibold transition-all duration-300 ${
                            videoDuration === sec
                              ? "bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                              : "bg-gray-800/50 border-white/10 text-purple-200 hover:border-cyan-400/50 hover:bg-cyan-400/10"
                          }`}
                        >
                          {sec} seconds
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reference Image Upload - Premium Styling */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-white">
                    🎨 Reference Image (Optional)
                  </label>
                  <div className="flex gap-4 items-start">
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="w-full p-4 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-cyan-500 file:to-blue-500 file:text-white hover:file:from-cyan-600 hover:file:to-blue-600 transition-all duration-300 backdrop-blur-sm"
                      />
                    </div>
                    {referenceImageUrl && (
                      <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-cyan-400/30 shadow-lg">
                        <img
                          src={referenceImageUrl}
                          alt="Reference"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Generate Button - Premium CTA */}
                <button
                  type="submit"
                  disabled={
                    generateMediaMutation.isPending ||
                    !prompt.trim() ||
                    userCredits[selectedMediaType] <= 0
                  }
                  className="w-full gradient-brand text-white py-5 px-8 rounded-2xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-bold text-lg flex items-center justify-center gap-3 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>

                  {generateMediaMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" variant="light" />
                      <span>Starting {selectedMediaType} generation...</span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:scale-110 transition-transform text-xl">
                        ✨
                      </span>
                      <span>
                        Generate{" "}
                        {selectedMediaType.charAt(0).toUpperCase() +
                          selectedMediaType.slice(1)}
                      </span>
                    </>
                  )}
                </button>
              </form>

              {/* AI Production Studio */}
              <ProductionStudio
                mediaType={selectedMediaType}
                prompt={prompt}
                isGenerating={isProductionActive}
              />

              {/* Generation Status */}
              {generationState.status === "generating" &&
                generationState.result && (
                  <div className="mt-6 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-2xl border border-cyan-400/20 p-6 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      We&apos;re creating your masterpiece...
                    </h3>
                    <p className="text-purple-200 text-sm">
                      Your content is being generated. It will appear in your
                      library automatically when ready.
                    </p>
                  </div>
                )}

              {/* Generation Error */}
              {generationState.status === "error" && (
                <ErrorAlert
                  message={generationState.error || "Generation failed"}
                  onRetry={() => {
                    if (!prompt.trim()) return;
                    const formData = buildFormData();
                    generateMediaMutation.mutate(formData);
                  }}
                  type="error"
                />
              )}
            </div>
          </div>

          {/* Content Library Sidebar - Takes 1/3 space */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-6 shadow-2xl sticky top-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>📚</span>
                  Your Library
                </h2>
                {postsLoading && (
                  <div className="flex items-center gap-2 text-sm text-purple-300">
                    <LoadingSpinner size="sm" variant="neon" />
                  </div>
                )}
              </div>

              {postsError ? (
                <div className="text-center py-8">
                  <ErrorAlert
                    message="Failed to load your content"
                    onRetry={handleRetryPosts}
                    type="error"
                  />
                  <button
                    onClick={() => {
                      console.log("Current posts error:", postsError);
                      handleRetryPosts();
                    }}
                    className="mt-4 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
                  >
                    Debug: Retry & Log
                  </button>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {posts.map((post: any) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onPublishPost={publishMutation.mutate}
                      publishingPost={publishingPost}
                      userCredits={userCredits} // Add this
                      primaryColor={primaryColor} // Add this
                      compact={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Brand Config Modal */}
        {showBrandModal && (
          <BrandConfigModal
            onClose={() => setShowBrandModal(false)}
            currentConfig={brandConfig}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard;
