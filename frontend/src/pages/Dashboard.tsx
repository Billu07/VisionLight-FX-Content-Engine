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
import { PromptApprovalModal } from "../components/PromptApprovalModal";

type MediaType = "video" | "image" | "carousel";

interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  result?: any;
  error?: string;
}

function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [selectedMediaType, setSelectedMediaType] =
    useState<MediaType>("video");
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(12);
  const [videoModel, setVideoModel] = useState<"sora-2" | "sora-2-pro">(
    "sora-2"
  );
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

  // Async UX state
  const [showQueuedModal, setShowQueuedModal] = useState(false);

  // Track posts generated during this session
  const [sessionGeneratedPosts, setSessionGeneratedPosts] = useState<
    Set<string>
  >(new Set());

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
      const approvalPosts = response.data.posts.filter(
        (p: any) =>
          p.generationStep === "AWAITING_APPROVAL" &&
          p.requiresApproval === true
      );
      console.log("📦 Posts fetched - approval posts:", approvalPosts.length);
      return response.data.posts;
    },
    enabled: !!user,
    refetchInterval: 5000, // Check every 5 seconds regardless of status
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // === Track newly generated posts ===
  useEffect(() => {
    if (posts.length > 0) {
      // Add any processing posts to our session tracking
      const processingPosts = posts.filter(
        (p: any) => p.status === "PROCESSING" || p.status === "QUEUED"
      );

      processingPosts.forEach((post: any) => {
        setSessionGeneratedPosts((prev) => new Set(prev).add(post.id));
      });

      console.log(
        "🔄 Session generated posts:",
        Array.from(sessionGeneratedPosts)
      );
    }
  }, [posts]);

  // === Fixed Modal Detection Logic ===
  useEffect(() => {
    console.log("🔍 DEBUG: Checking for approval posts", {
      postsCount: posts.length,
      showPromptApproval,
      showQueuedModal,
      sessionGeneratedPosts: Array.from(sessionGeneratedPosts),
    });

    if (posts.length === 0 || showPromptApproval) return;

    // Priority 1: Check for posts needing approval
    const needsApproval = posts.find(
      (p: any) =>
        p.generationStep === "AWAITING_APPROVAL" && p.requiresApproval === true
    );

    console.log(
      "🎯 Posts needing approval:",
      needsApproval
        ? {
            id: needsApproval.id,
            inSession: sessionGeneratedPosts.has(needsApproval.id),
          }
        : "none"
    );

    if (needsApproval && !showPromptApproval && !showQueuedModal) {
      console.log(
        "✅ OPENING PROMPT APPROVAL MODAL for post:",
        needsApproval.id
      );
      setPendingApprovalPostId(needsApproval.id);
      setShowPromptApproval(true);

      setSessionGeneratedPosts((prev) => new Set(prev).add(needsApproval.id));
    }
  }, [posts, showPromptApproval, showQueuedModal, sessionGeneratedPosts]);

  // === Handle post updates for automatic modal display ===
  useEffect(() => {
    if (posts.length > 0) {
      // Check if any posts changed to AWAITING_APPROVAL state
      const newApprovalPosts = posts.filter(
        (p: any) =>
          p.generationStep === "AWAITING_APPROVAL" &&
          p.requiresApproval === true &&
          !sessionGeneratedPosts.has(p.id)
      );

      if (newApprovalPosts.length > 0 && !showPromptApproval) {
        const post = newApprovalPosts[0];
        console.log("🔄 New post awaiting approval detected:", post.id);
        setPendingApprovalPostId(post.id);
        setShowPromptApproval(true);
        setSessionGeneratedPosts((prev) => new Set(prev).add(post.id));
      }
    }
  }, [posts, sessionGeneratedPosts, showPromptApproval]);

  // === Clean up modal states when posts change ===
  useEffect(() => {
    // If the pending approval post is no longer in AWAITING_APPROVAL state, close the modal
    if (pendingApprovalPostId && showPromptApproval) {
      const post = posts.find((p: any) => p.id === pendingApprovalPostId);
      if (post && post.generationStep !== "AWAITING_APPROVAL") {
        console.log("🔄 Closing approval modal - post state changed");
        setShowPromptApproval(false);
        setPendingApprovalPostId(null);
      }
    }
  }, [posts, pendingApprovalPostId, showPromptApproval]);

  // === Real-time Approval Polling ===
  useEffect(() => {
    if (!user || showPromptApproval) return;

    // Poll every 3 seconds specifically for new approval posts
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    }, 3000);

    return () => clearInterval(interval);
  }, [user, showPromptApproval, queryClient]);

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

  // === Direct Media Generation Mutation ===
  const generateMediaMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return apiEndpoints.generateMediaDirect(formData);
    },
    onSuccess: (response) => {
      const data = (response as any)?.data ?? response;

      console.log("🔍 /api/generate-media response:", data);

      if (data?.success && data.status === "processing" && data.postId) {
        setGenerationState({
          status: "generating",
          result: { postId: data.postId },
        });
        setShowQueuedModal(true);

        // Add to session tracking
        setSessionGeneratedPosts((prev) => new Set(prev).add(data.postId));
      } else {
        setGenerationState({
          status: "error",
          error: "Unexpected response from server",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-credits"] });
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
      console.log("✅ Prompt approved successfully");
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);

      // Force immediate refresh of posts
      queryClient.invalidateQueries({ queryKey: ["posts"] });

      // Also remove from session tracking since we've handled this post
      if (pendingApprovalPostId) {
        setSessionGeneratedPosts((prev) => {
          const newSet = new Set(prev);
          newSet.delete(pendingApprovalPostId);
          return newSet;
        });
      }
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
      console.log("✅ Prompt cancelled successfully");
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);

      // Force immediate refresh of posts
      queryClient.invalidateQueries({ queryKey: ["posts"] });

      // Remove from session tracking
      if (pendingApprovalPostId) {
        setSessionGeneratedPosts((prev) => {
          const newSet = new Set(prev);
          newSet.delete(pendingApprovalPostId);
          return newSet;
        });
      }
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
    if (file) {
      setReferenceImage(file);
      const imageUrl = URL.createObjectURL(file);
      setReferenceImageUrl(imageUrl);
    }
  };

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("mediaType", selectedMediaType);

    // Add ALL generation parameters for video
    if (selectedMediaType === "video") {
      formData.append("duration", videoDuration.toString());
      formData.append("model", videoModel);
      formData.append("aspectRatio", aspectRatio);
      formData.append("size", videoSize);

      const [width, height] = videoSize.split("x").map(Number);
      formData.append("width", width.toString());
      formData.append("height", height.toString());
    }

    // Add reference image if provided
    if (referenceImage) {
      formData.append("referenceImage", referenceImage);
    }

    console.log("📋 FormData parameters:", {
      prompt,
      mediaType: selectedMediaType,
      duration: selectedMediaType === "video" ? videoDuration : undefined,
      model: selectedMediaType === "video" ? videoModel : undefined,
      aspectRatio: selectedMediaType === "video" ? aspectRatio : undefined,
      size: selectedMediaType === "video" ? videoSize : undefined,
      hasReferenceImage: !!referenceImage,
    });

    return formData;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || userCredits[selectedMediaType] <= 0) return;

    setGenerationState({ status: "idle" });

    const formData = buildFormData();
    generateMediaMutation.mutate(formData);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Apply brand colors dynamically
  const primaryColor = brandConfig?.primaryColor || "#6366f1";
  const secondaryColor = brandConfig?.secondaryColor || "#8b5cf6";
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
              We've started generating your {selectedMediaType}. It will appear
              in your content library when ready.
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

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
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

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
                              userCredits[type as MediaType] > 0
                                ? "text-white"
                                : "text-gray-400"
                            }`}
                          >
                            {userCredits[type as MediaType]}
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
          </div>
        </div>

        {/* ROI Metrics */}
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

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-8 shadow-2xl">
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

              {/* Media Type Selection */}
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
                {/* Prompt Input */}
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

                {/* Enhanced Video Controls */}
                {selectedMediaType === "video" && (
                  <div className="space-y-6">
                    {/* Video Model Selection */}
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        🤖 AI Model
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {
                            id: "sora-2",
                            label: "Sora 2",
                            description: "Standard quality",
                          },
                          {
                            id: "sora-2-pro",
                            label: "Sora 2 Pro",
                            description: "Enhanced quality",
                          },
                        ].map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() =>
                              setVideoModel(model.id as "sora-2" | "sora-2-pro")
                            }
                            className={`p-4 rounded-2xl border-2 transition-all duration-300 text-left ${
                              videoModel === model.id
                                ? "border-cyan-400 bg-cyan-500/20 shadow-lg shadow-cyan-500/25"
                                : "border-white/10 bg-gray-800/50 hover:border-cyan-400/50"
                            }`}
                          >
                            <div className="font-semibold text-white text-sm">
                              {model.label}
                            </div>
                            <div className="text-xs text-purple-300 mt-1">
                              {model.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aspect Ratio Selection */}
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        📐 Aspect Ratio
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { ratio: "16:9", label: "Landscape", icon: "🖥️" },
                          { ratio: "9:16", label: "Portrait", icon: "📱" },
                        ].map(({ ratio, label, icon }) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => {
                              setAspectRatio(ratio as "16:9" | "9:16");
                              setVideoSize(
                                ratio === "16:9" ? "1280x720" : "720x1280"
                              );
                            }}
                            className={`p-4 rounded-2xl border-2 transition-all duration-300 text-center ${
                              aspectRatio === ratio
                                ? "border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/25"
                                : "border-white/10 bg-gray-800/50 hover:border-purple-400/50"
                            }`}
                          >
                            <div className="text-2xl mb-2">{icon}</div>
                            <div className="font-semibold text-white text-sm">
                              {label}
                            </div>
                            <div className="text-xs text-purple-300">
                              {ratio}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Video Size Selection */}
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        📏 Video Size
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {(aspectRatio === "16:9"
                          ? [
                              {
                                size: "1280x720",
                                label: "720p HD",
                                resolution: "1280 × 720",
                              },
                              {
                                size: "1792x1024",
                                label: "1024p",
                                resolution: "1792 × 1024",
                              },
                            ]
                          : [
                              {
                                size: "720x1280",
                                label: "720p HD",
                                resolution: "720 × 1280",
                              },
                              {
                                size: "1024x1792",
                                label: "1024p",
                                resolution: "1024 × 1792",
                              },
                            ]
                        ).map(({ size, label, resolution }) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setVideoSize(size as any)}
                            className={`p-4 rounded-2xl border-2 transition-all duration-300 text-left ${
                              videoSize === size
                                ? "border-green-400 bg-green-500/20 shadow-lg shadow-green-500/25"
                                : "border-white/10 bg-gray-800/50 hover:border-green-400/50"
                            }`}
                          >
                            <div className="font-semibold text-white text-sm">
                              {label}
                            </div>
                            <div className="text-xs text-purple-300">
                              {resolution}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration Selection */}
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
                  </div>
                )}

                {/* Reference Image Upload */}
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

                {/* Generate Button */}
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

              {/* Generation Error */}
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

          {/* Content Library Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-6 shadow-2xl sticky top-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>📚</span> Your Library
                </h2>
                {postsLoading && (
                  <div className="flex items-center gap-2 text-sm text-purple-300">
                    <LoadingSpinner size="sm" variant="neon" />
                  </div>
                )}
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {posts
                  .filter((post: any) => post.status !== "CANCELLED")
                  .map((post: any) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onPublishPost={publishMutation.mutate}
                      publishingPost={publishingPost}
                      userCredits={userCredits}
                      primaryColor={primaryColor}
                      compact={true}
                    />
                  ))}
              </div>
              {postsError ? (
                <div className="text-center py-8">
                  <ErrorAlert
                    message="Failed to load your content"
                    onRetry={() =>
                      queryClient.invalidateQueries({ queryKey: ["posts"] })
                    }
                    type="error"
                  />
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {posts.map((post: any) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onPublishPost={publishMutation.mutate}
                      publishingPost={publishingPost}
                      userCredits={userCredits}
                      primaryColor={primaryColor}
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
