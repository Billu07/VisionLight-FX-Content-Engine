import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorAlert } from "../components/ErrorAlert";
import { PostCard } from "../components/PostCard";
import { BrandConfigModal } from "../components/BrandConfigModal";
import { WelcomeTour } from "../components/WelcomeTour";
import { PromptApprovalModal } from "../components/PromptApprovalModal";

// Import your logo images
import fxLogo from "../assets/fx.png";
import picdriftLogo from "../assets/picdrift.png";

type MediaType = "video" | "image" | "carousel";

interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  result?: any;
  error?: string;
}

function Dashboard() {
  // === Form State ===
  const [prompt, setPrompt] = useState("");
  const [selectedMediaType, setSelectedMediaType] =
    useState<MediaType>("video");
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(12);
  const [videoModel, setVideoModel] = useState<"sora-2" | "sora-2-pro">(
    "sora-2"
  );
  const [videoTitle, setVideoTitle] = useState("");
  const [showPromptApproval, setShowPromptApproval] = useState(false);
  const [pendingApprovalPostId, setPendingApprovalPostId] = useState<
    string | null
  >(null);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoSize, setVideoSize] = useState<
    "1280x720" | "1792x1024" | "720x1280" | "1024x1792"
  >("1280x720");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [generationState, setGenerationState] = useState<GenerationState>({
    status: "idle",
  });
  const [publishingPost, setPublishingPost] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Async UX state
  const [showQueuedModal, setShowQueuedModal] = useState(false);

  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Initialize auth check
  useEffect(() => {
    const { checkAuth } = useAuth.getState();
    checkAuth();
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // === Fetch Brand Config ===
  const { data: brandConfig } = useQuery({
    queryKey: ["brand-config"],
    queryFn: async () => {
      const response = await apiEndpoints.getBrandConfig();
      return response.data.config;
    },
    enabled: !!user,
  });

  // Apply brand colors globally
  useEffect(() => {
    const applyBrandColors = () => {
      const primary = brandConfig?.primaryColor || "#6366f1";
      const secondary = brandConfig?.secondaryColor || "#8b5cf6";
      document.documentElement.style.setProperty("--primary-brand", primary);
      document.documentElement.style.setProperty(
        "--secondary-brand",
        secondary
      );
      const metaThemeColor = document.querySelector("meta[name=theme-color]");
      if (metaThemeColor) {
        metaThemeColor.setAttribute("content", primary);
      }
    };
    applyBrandColors();
    window.addEventListener("focus", applyBrandColors);
    return () => window.removeEventListener("focus", applyBrandColors);
  }, [brandConfig]);

  // Check if first-time user
  useEffect(() => {
    if (user && !localStorage.getItem("visionlight_welcome_shown")) {
      setShowWelcomeTour(true);
      localStorage.setItem("visionlight_welcome_shown", "true");
    }
  }, [user]);

  // === Enhanced Posts Query (Crash Proofed) ===
  const {
    data: posts = [],
    isLoading: postsLoading,
    error: postsError,
  } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      try {
        const response = await apiEndpoints.getPosts();
        // Ensure we always return an array
        return Array.isArray(response.data.posts) ? response.data.posts : [];
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
    // Polling every 5s to prevent heavy load, only if something is processing
    refetchInterval: (query) => {
      const currentPosts = query.state.data;
      if (!currentPosts || !Array.isArray(currentPosts)) return false;
      const hasProcessing = currentPosts.some(
        (p: any) =>
          (p.status === "PROCESSING" || p.status === "NEW") &&
          (p.progress || 0) < 100 &&
          !p.mediaUrl
      );
      return hasProcessing ? 5000 : false;
    },
    staleTime: 1000,
  });

  // === Safe Modal Logic (Prevents Infinite Loops) ===
  const postNeedingApproval = useMemo(() => {
    if (!posts || !Array.isArray(posts) || posts.length === 0) return null;
    return posts.find(
      (p: any) =>
        p.generationStep === "AWAITING_APPROVAL" &&
        p.requiresApproval === true &&
        p.status !== "CANCELLED"
    );
  }, [posts]);

  useEffect(() => {
    if (postNeedingApproval && !showPromptApproval && !showQueuedModal) {
      setPendingApprovalPostId(postNeedingApproval.id);
      setShowPromptApproval(true);
    } else if (!postNeedingApproval && showPromptApproval) {
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);
    }
  }, [postNeedingApproval, showPromptApproval, showQueuedModal]);

  // === Fetch User Credits ===
  const {
    data: userCredits = { video: 0, image: 0, carousel: 0 },
    isLoading: creditsLoading,
  } = useQuery({
    queryKey: ["user-credits"],
    queryFn: async () => {
      const response = await apiEndpoints.getUserCredits();
      return response.data.credits || { video: 0, image: 0, carousel: 0 };
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
      return (
        response.data.metrics || {
          postsCreated: 0,
          timeSaved: 0,
          mediaGenerated: 0,
        }
      );
    },
    enabled: !!user,
  });

  // === Direct Media Generation Mutation ===
  const generateMediaMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return apiEndpoints.generateMediaDirect(formData);
    },
    onSuccess: (response) => {
      const data = (response as any)?.data ?? response;

      if (data?.success && data.postId) {
        setGenerationState({
          status: "generating",
          result: { postId: data.postId },
        });

        // Show success modal
        setShowQueuedModal(true);

        // Clear Inputs (UX Fix)
        setPrompt("");
        setVideoTitle("");
        setReferenceImage(null);
        setReferenceImageUrl("");

        // Smart Refetching
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["user-credits"] });

        // Refetch again in 2s to catch Airtable latency
        setTimeout(
          () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
          2000
        );
      } else {
        setGenerationState({
          status: "error",
          error: "Unexpected response from server",
        });
      }
    },
    onError: (error: any) => {
      console.error("Generate media error:", error);
      setGenerationState({
        status: "error",
        error: error.message || "Failed to start generation",
      });
    },
  });

  // === Approve Prompt Mutation ===
  const approvePromptMutation = useMutation({
    mutationFn: async (data: { postId: string; finalPrompt: string }) => {
      return apiEndpoints.approvePrompt(data);
    },
    onSuccess: () => {
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);
      setPrompt("");
      setReferenceImage(null);
      setReferenceImageUrl("");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error: any) => {
      console.error("Error approving prompt:", error);
    },
  });

  // === Cancel Prompt Mutation ===
  const cancelPromptMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiEndpoints.cancelPrompt(postId);
    },
    onSuccess: () => {
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error: any) => {
      console.error("Error cancelling prompt:", error);
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
    if (!file) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(
        "❌ Image size must be less than 10MB. Please choose a smaller file."
      );
      e.target.value = "";
      return;
    }

    setReferenceImage(file);
    setReferenceImageUrl(URL.createObjectURL(file));
  };

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("mediaType", selectedMediaType);
    formData.append("title", videoTitle);

    if (selectedMediaType === "video") {
      formData.append("duration", videoDuration.toString());
      formData.append("model", videoModel);
      formData.append("aspectRatio", aspectRatio);
      formData.append("size", videoSize);
      const [width, height] = videoSize.split("x").map(Number);
      formData.append("width", width.toString());
      formData.append("height", height.toString());
    }

    if (referenceImage) {
      formData.append("referenceImage", referenceImage);
    }

    return formData;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Safe check for credits
    const currentCredits = userCredits?.[selectedMediaType] ?? 0;

    if (!prompt.trim() || currentCredits <= 0) return;

    setGenerationState({ status: "idle" });
    const formData = buildFormData();
    generateMediaMutation.mutate(formData);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const primaryColor = brandConfig?.primaryColor || "#6366f1";
  const companyName = brandConfig?.companyName || "Visionlight AI";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center p-4">
        <div className="text-center">
          <LoadingSpinner size="lg" variant="neon" />
          <p className="mt-6 text-purple-200 text-lg font-medium">
            Loading your creative studio...
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
              Your content is being generated 🎬
            </h3>
            <p className="text-sm text-purple-200 mb-4">
              We've started enhancing your prompt. Check your library shortly
              for approval!
            </p>
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

      {/* Welcome Tour */}
      {showWelcomeTour && (
        <WelcomeTour onClose={() => setShowWelcomeTour(false)} />
      )}

      {/* Prompt Approval Modal */}
      <PromptApprovalModal
        postId={pendingApprovalPostId || ""}
        isOpen={showPromptApproval}
        onClose={() => setShowPromptApproval(false)}
        onApprove={(finalPrompt) => {
          if (pendingApprovalPostId) {
            approvePromptMutation.mutate({
              postId: pendingApprovalPostId,
              finalPrompt,
            });
          }
        }}
        onCancel={(postId) => {
          if (postId) {
            cancelPromptMutation.mutate(postId);
          }
        }}
        isLoading={
          approvePromptMutation.isPending || cancelPromptMutation.isPending
        }
      />

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
        {/* --- HEADER --- */}
        <div className="mb-6 sm:mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            {/* Left side: Visionlight AI with user info */}
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold leading-tight brand-gradient-text">
                  {companyName}
                </h1>
                <p className="text-purple-300 text-xs sm:text-sm">
                  Welcome back,{" "}
                  <span className="font-semibold text-white">
                    {user.name || user.email}
                  </span>
                </p>
              </div>
            </div>

            {/* Right side: FX Logo - Top Center with subtitle */}
            <div className="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center mt-14">
              <div className="h-14 sm:h-16 flex items-center justify-center mb-1">
                <img
                  src={fxLogo}
                  alt="FX Creation Engine"
                  className="h-full w-auto object-contain"
                />
              </div>
              <p className="text-purple-300 text-xs sm:text-sm text-center">
                Your AI-Powered Creation Engine
              </p>
            </div>

            {/* Mobile Menu Button */}
            {isMobile && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="p-2 bg-gray-800/60 backdrop-blur-lg border border-cyan-400/30 rounded-xl hover:bg-cyan-400/10 transition-all"
                >
                  <span className="text-cyan-400">🎨</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-gray-800/60 backdrop-blur-lg border border-purple-400/30 rounded-xl hover:bg-purple-400/10 transition-all"
                >
                  <span className="text-purple-300">🚪</span>
                </button>
              </div>
            )}
          </div>

          {/* Credits Display */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="bg-gray-800/60 backdrop-blur-lg rounded-2xl px-3 sm:px-4 py-2 sm:py-3 border border-purple-500/20 w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-4">
                {!creditsLoading ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      <span className="text-white text-sm font-medium">
                        Credits:
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {["video", "image", "carousel"].map((type) => (
                        <div key={type} className="flex items-center gap-1.5">
                          <span className="text-sm">
                            {type === "video"
                              ? "🎬"
                              : type === "image"
                              ? "🖼️"
                              : "📱"}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              (userCredits[type as MediaType] || 0) > 0
                                ? "text-white"
                                : "text-gray-400"
                            }`}
                          >
                            {userCredits[type as MediaType] || 0}
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

            {/* Desktop Buttons */}
            {!isMobile && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="px-4 py-2.5 bg-gray-800/60 backdrop-blur-lg border border-cyan-400/30 rounded-xl hover:bg-cyan-400/10 transition-all duration-200 font-medium flex items-center gap-2 text-sm text-cyan-400 hover:scale-105"
                >
                  <span>🎨</span> Brand
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2.5 bg-gray-800/60 backdrop-blur-lg border border-purple-400/30 rounded-xl hover:bg-purple-400/10 transition-all duration-200 font-medium text-purple-300 text-sm hover:scale-105"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* --- ROI METRICS --- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-6 sm:mb-8">
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
              className="bg-gray-800/40 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/5 hover:border-white/10 transition-all duration-300 group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-300 font-medium mb-1">
                    {metric.label}
                  </p>
                  <p
                    className={`text-xl sm:text-2xl font-bold bg-gradient-to-r ${metric.gradient} bg-clip-text text-transparent`}
                  >
                    {metric.value}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {metric.subtitle}
                  </p>
                </div>
                <div className="text-xl sm:text-2xl opacity-80 group-hover:scale-110 transition-transform">
                  {metric.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* --- MAIN LAYOUT --- */}
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Generation Panel */}
          <div className="flex-1">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 lg:p-8 shadow-2xl">
              {/* PICDRIFT Header */}
              <div className="mb-6 sm:mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 sm:h-14 flex items-center justify-center">
                    <img
                      src={picdriftLogo}
                      alt="PICDRIFT"
                      className="h-full w-auto object-contain"
                    />
                  </div>
                </div>
                <p className="text-purple-300 text-sm ml-1">
                  Imagine anything — move effortlessly between AI tools
                </p>
              </div>

              {/* Enhanced Media Type Selection */}
              <div className="mb-6 sm:mb-8">
                <label className="block text-sm font-semibold text-white mb-3 sm:mb-4">
                  🎬 Select Content Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {[
                    {
                      type: "video" as MediaType,
                      label: "Sora Video",
                      icon: "🎬",
                      gradient: "from-pink-500 to-rose-500",
                    },
                    {
                      type: "image" as MediaType,
                      label: "Gemini Image",
                      icon: "🖼️",
                      gradient: "from-blue-500 to-cyan-500",
                    },
                    {
                      type: "carousel" as MediaType,
                      label: "AI Carousel",
                      icon: "📱",
                      gradient: "from-green-500 to-emerald-500",
                    },
                  ].map(({ type, label, icon, gradient }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedMediaType(type)}
                      disabled={(userCredits[type] || 0) <= 0}
                      className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                        selectedMediaType === type
                          ? `border-white/20 bg-gradient-to-br ${gradient} shadow-2xl scale-105`
                          : "border-white/5 bg-gray-800/50 hover:border-white/10 hover:scale-102"
                      } ${
                        (userCredits[type] || 0) <= 0
                          ? "opacity-40 cursor-not-allowed grayscale"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xl sm:text-2xl group-hover:scale-110 transition-transform">
                          {icon}
                        </span>
                        <div className="flex-1">
                          <div className={`font-semibold text-sm text-white`}>
                            {label}
                          </div>
                          <div
                            className={`text-xs ${
                              selectedMediaType === type
                                ? "text-white/80"
                                : "text-purple-300"
                            }`}
                          >
                            {userCredits[type] || 0} credits
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

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                {/* Prompt Input */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2 sm:mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    💡 Your Creative Vision
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={`Describe your ${selectedMediaType} vision...\nExample: "A futuristic cityscape at dusk with flying vehicles and neon-lit skyscrapers"`}
                    className="w-full p-4 sm:p-5 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all duration-300 resize-none text-white placeholder-purple-300/60 backdrop-blur-sm text-base sm:text-lg leading-relaxed"
                    rows={isMobile ? 3 : 4}
                  />
                </div>

                {/* DYNAMIC TITLE INPUT */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="block text-sm font-semibold text-white capitalize">
                    🏷️ {selectedMediaType} Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder={`Give your ${selectedMediaType} a memorable name...`}
                    className="w-full p-3 sm:p-4 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-purple-300/60 backdrop-blur-sm"
                  />
                </div>

                {/* Premium Video Controls */}
                {selectedMediaType === "video" && (
                  <div className="space-y-4 sm:space-y-6">
                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        🤖 AI Model
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {[
                          {
                            id: "sora-2",
                            label: "Sora 2",
                            description: "Standard quality",
                            badge: "✨",
                          },
                          {
                            id: "sora-2-pro",
                            label: "Sora 2 Pro",
                            description: "Enhanced quality",
                            badge: "🚀",
                          },
                        ].map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() =>
                              setVideoModel(model.id as "sora-2" | "sora-2-pro")
                            }
                            className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                              videoModel === model.id
                                ? "border-cyan-400 bg-cyan-500/20 shadow-lg shadow-cyan-500/25"
                                : "border-white/10 bg-gray-800/50 hover:border-cyan-400/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-white text-sm flex items-center gap-2">
                                  {model.badge} {model.label}
                                </div>
                                <div className="text-xs text-purple-300 mt-1">
                                  {model.description}
                                </div>
                              </div>
                              {videoModel === model.id && (
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        📐 Aspect Ratio
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {[
                          {
                            ratio: "16:9",
                            label: "Landscape",
                            icon: "🖥️",
                            desc: "Widescreen",
                          },
                          {
                            ratio: "9:16",
                            label: "Portrait",
                            icon: "📱",
                            desc: "Mobile",
                          },
                        ].map(({ ratio, label, icon, desc }) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => {
                              setAspectRatio(ratio as "16:9" | "9:16");
                              setVideoSize(
                                ratio === "16:9" ? "1280x720" : "720x1280"
                              );
                            }}
                            className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-center group ${
                              aspectRatio === ratio
                                ? "border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/25"
                                : "border-white/10 bg-gray-800/50 hover:border-purple-400/50"
                            }`}
                          >
                            <div className="text-xl sm:text-2xl mb-2 group-hover:scale-110 transition-transform">
                              {icon}
                            </div>
                            <div className="font-semibold text-white text-sm">
                              {label}
                            </div>
                            <div className="text-xs text-purple-300">
                              {ratio}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        📏 Video Size
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {(aspectRatio === "16:9"
                          ? [
                              {
                                size: "1280x720",
                                label: "720p HD",
                                resolution: "1280 × 720",
                                quality: "Standard",
                              },
                              ...(videoModel === "sora-2-pro"
                                ? [
                                    {
                                      size: "1792x1024",
                                      label: "1024p",
                                      resolution: "1792 × 1024",
                                      quality: "Premium",
                                    },
                                  ]
                                : []),
                            ]
                          : [
                              {
                                size: "720x1280",
                                label: "720p HD",
                                resolution: "720 × 1280",
                                quality: "Standard",
                              },
                              ...(videoModel === "sora-2-pro"
                                ? [
                                    {
                                      size: "1024x1792",
                                      label: "1024p",
                                      resolution: "1024 × 1792",
                                      quality: "Premium",
                                    },
                                  ]
                                : []),
                            ]
                        ).map(({ size, label, resolution, quality }) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setVideoSize(size as any)}
                            className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                              videoSize === size
                                ? "border-green-400 bg-green-500/20 shadow-lg shadow-green-500/25"
                                : "border-white/10 bg-gray-800/50 hover:border-green-400/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-white text-sm">
                                  {label}
                                </div>
                                <div className="text-xs text-purple-300">
                                  {resolution}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  {quality}
                                </div>
                              </div>
                              {videoSize === size && (
                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                      {videoModel === "sora-2" && (
                        <p className="text-xs text-purple-300 mt-2">
                          💡 Upgrade to Sora-2 Pro for enhanced 1024p resolution
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        ⏱️ Video Duration
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[4, 8, 12].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setVideoDuration(sec as 4 | 8 | 12)}
                            className={`px-3 sm:px-5 py-2 sm:py-3 rounded-xl border text-sm font-semibold transition-all duration-300 flex-1 min-w-[80px] ${
                              videoDuration === sec
                                ? "bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                                : "bg-gray-800/50 border-white/10 text-purple-200 hover:border-cyan-400/50 hover:bg-cyan-400/10"
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Reference Image */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="block text-sm font-semibold text-white">
                    🎨 Reference Image (Optional)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start">
                    <div className="flex-1 w-full">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="w-full p-3 sm:p-4 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white file:mr-3 file:py-2 file:px-4 sm:file:py-3 sm:file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-cyan-500 file:to-blue-500 file:text-white hover:file:from-cyan-600 hover:file:to-blue-600 transition-all duration-300 backdrop-blur-sm"
                      />
                      <p className="text-xs text-purple-300 mt-2">
                        Maximum file size: 10MB. Supported formats: JPG, PNG
                        (PNG Preferred)
                      </p>
                    </div>
                    {referenceImageUrl && (
                      <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-2 border-cyan-400/30 shadow-lg flex-shrink-0">
                        <img
                          src={referenceImageUrl}
                          alt="Reference"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  type="submit"
                  disabled={
                    generateMediaMutation.isPending ||
                    !prompt.trim() ||
                    (userCredits[selectedMediaType] || 0) <= 0
                  }
                  className="w-full gradient-brand text-white py-4 sm:py-5 px-6 sm:px-8 rounded-2xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-bold text-base sm:text-lg flex items-center justify-center gap-3 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  {generateMediaMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" variant="light" />
                      <span>Starting {selectedMediaType} generation...</span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:scale-110 transition-transform text-lg sm:text-xl">
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

              {generationState.status === "error" && (
                <ErrorAlert
                  message={generationState.error || "Generation failed"}
                  onRetry={() => {
                    if (!prompt.trim()) return;
                    generateMediaMutation.mutate(buildFormData());
                  }}
                  type="error"
                />
              )}
            </div>
          </div>

          {/* Content Library (Restored Layout) */}
          <div className="lg:w-96">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 shadow-2xl sticky top-4">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>📚</span> Your Library
                  <span className="bg-purple-500/20 text-purple-300 text-xs px-2 py-1 rounded-full ml-2">
                    {posts && Array.isArray(posts)
                      ? posts.filter((p: any) => p.status !== "CANCELLED")
                          .length
                      : 0}
                  </span>
                </h2>
                {postsLoading && (
                  <div className="flex items-center gap-2 text-sm text-purple-300">
                    <LoadingSpinner size="sm" variant="neon" />
                  </div>
                )}
              </div>

              <div className="space-y-3 max-h-[500px] sm:max-h-[600px] overflow-y-auto custom-scrollbar">
                {posts && Array.isArray(posts) && posts.length > 0 ? (
                  posts
                    .filter((post: any) => post.status !== "CANCELLED")
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime()
                    )
                    .map((post: any) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onPublishPost={publishMutation.mutate}
                        userCredits={
                          userCredits || { video: 0, image: 0, carousel: 0 }
                        }
                        publishingPost={publishingPost}
                        primaryColor={primaryColor}
                        compact={true}
                      />
                    ))
                ) : !postsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-purple-300 text-sm mb-3">
                      No content yet
                    </div>
                    <div className="text-4xl mb-2">✨</div>
                    <div className="text-gray-400 text-xs">
                      Start creating above!
                    </div>
                  </div>
                ) : null}
              </div>

              {postsError && (
                <div className="text-center py-6">
                  <ErrorAlert
                    message="Failed to load your content"
                    onRetry={() =>
                      queryClient.invalidateQueries({ queryKey: ["posts"] })
                    }
                    type="error"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

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
