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
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // === Enhanced Posts Query ===
  const {
    data: posts = [],
    isLoading: postsLoading,
    error: postsError,
  } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const response = await apiEndpoints.getPosts();
      return response.data.posts;
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const posts = query.state.data || [];
      const hasProcessing = posts.some(
        (p: any) =>
          (p.status === "PROCESSING" || p.status === "NEW") &&
          (p.progress || 0) < 100 &&
          !p.mediaUrl
      );
      return hasProcessing ? 3000 : false;
    },
    staleTime: 0,
  });

  // === Track newly generated posts ===
  useEffect(() => {
    if (posts.length > 0) {
      const processingPosts = posts.filter(
        (p: any) => p.status === "PROCESSING" || p.status === "NEW"
      );
      processingPosts.forEach((post: any) => {
        setSessionGeneratedPosts((prev) => new Set(prev).add(post.id));
      });
    }
  }, [posts]);

  // === Modal Detection Logic ===
  useEffect(() => {
    if (posts.length === 0 || showPromptApproval) return;

    const needsApproval = posts.find(
      (p: any) =>
        p.generationStep === "AWAITING_APPROVAL" && p.requiresApproval === true
    );

    if (needsApproval && !showPromptApproval && !showQueuedModal) {
      setPendingApprovalPostId(needsApproval.id);
      setShowPromptApproval(true);
      setSessionGeneratedPosts((prev) => new Set(prev).add(needsApproval.id));
    }
  }, [posts, showPromptApproval, showQueuedModal, sessionGeneratedPosts]);

  // === Real-time Approval Polling ===
  useEffect(() => {
    if (!user || showPromptApproval) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    }, 3000);
    return () => clearInterval(interval);
  }, [user, showPromptApproval, queryClient]);

  // === Fetch Data ===
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

  // === Mutations ===
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
        setShowQueuedModal(true);
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
      setGenerationState({
        status: "error",
        error: error.message || "Failed to start generation",
      });
    },
  });

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
  });

  const cancelPromptMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiEndpoints.cancelPrompt(postId);
    },
    onSuccess: () => {
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: ({ postId, platform }: { postId: string; platform?: string }) =>
      apiEndpoints.publishPost({ postId, platform }),
    onMutate: ({ postId }) => {
      setPublishingPost(postId);
    },
    onSettled: () => {
      setPublishingPost(null);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("❌ Image size must be less than 10MB.");
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
    if (!prompt.trim() || userCredits[selectedMediaType] <= 0) return;
    setGenerationState({ status: "idle" });
    const formData = buildFormData();
    generateMediaMutation.mutate(formData);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const companyName = brandConfig?.companyName || "Visionlight AI";
  const primaryColor = brandConfig?.primaryColor || "#6366f1";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center p-4">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  }

  if (!user) return null;

  return (
    // Restored Original Theme: Gradient Background
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white font-sans selection:bg-cyan-500/30">
      {/* Queued Modal */}
      {showQueuedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-gray-900/90 rounded-2xl border border-cyan-400/30 shadow-[0_0_30px_-10px_rgba(34,211,238,0.4)] max-w-sm w-full p-6">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-2xl">🎬</span> Content Queued
            </h3>
            <p className="text-purple-200 text-sm mb-6 leading-relaxed">
              We've started generating your {selectedMediaType}. It will appear
              in your library momentarily.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowQueuedModal(false)}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold transition-all shadow-lg shadow-cyan-500/20"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Tour & Modals */}
      {showWelcomeTour && (
        <WelcomeTour onClose={() => setShowWelcomeTour(false)} />
      )}
      <PromptApprovalModal
        postId={pendingApprovalPostId || ""}
        isOpen={showPromptApproval}
        onClose={() => setShowPromptApproval(false)}
        onApprove={(finalPrompt) =>
          pendingApprovalPostId &&
          approvePromptMutation.mutate({
            postId: pendingApprovalPostId,
            finalPrompt,
          })
        }
        onCancel={(postId) => postId && cancelPromptMutation.mutate(postId)}
        isLoading={
          approvePromptMutation.isPending || cancelPromptMutation.isPending
        }
      />
      {showBrandModal && (
        <BrandConfigModal
          onClose={() => setShowBrandModal(false)}
          currentConfig={brandConfig}
        />
      )}

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-[1440px]">
        {/* === Header (Layout: New | Theme: Original) === */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex flex-col">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
                {companyName}
              </h1>
              <p className="text-purple-200 text-sm mt-1">
                Welcome back,{" "}
                <span className="text-white font-medium">
                  {user.name || user.email}
                </span>
              </p>
            </div>
          </div>

          {/* FX Logo - Centered */}
          <div className="hidden lg:flex absolute left-1/2 top-8 transform -translate-x-1/2 items-center justify-center pointer-events-none">
            <img src={fxLogo} alt="FX" className="h-16 w-auto drop-shadow-lg" />
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            {/* Credits Pill - Glassmorphism */}
            <div className="hidden sm:flex bg-gray-800/40 backdrop-blur-md border border-white/10 rounded-full px-5 py-2.5 items-center gap-6 shadow-xl">
              {!creditsLoading ? (
                <>
                  <div className="flex items-center gap-2 border-r border-white/10 pr-6">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_#22d3ee]" />
                    <span className="text-xs font-bold tracking-wider text-purple-200 uppercase">
                      Credits
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {[
                      { type: "video", icon: "🎬", val: userCredits.video },
                      { type: "image", icon: "🖼️", val: userCredits.image },
                      {
                        type: "carousel",
                        icon: "📱",
                        val: userCredits.carousel,
                      },
                    ].map((c) => (
                      <div key={c.type} className="flex items-center gap-2">
                        <span className="opacity-80 text-sm">{c.icon}</span>
                        <span
                          className={`text-sm font-bold ${
                            c.val > 0 ? "text-white" : "text-red-400"
                          }`}
                        >
                          {c.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <LoadingSpinner size="sm" variant="neon" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBrandModal(true)}
                className="p-3 rounded-full bg-gray-800/40 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/50 transition-all text-purple-200 hover:text-cyan-400"
                title="Brand Settings"
              >
                🎨
              </button>
              <button
                onClick={handleLogout}
                className="p-3 rounded-full bg-gray-800/40 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 transition-all text-purple-200 hover:text-red-400"
                title="Logout"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* === ROI Statistics: Glassmorphism Cards === */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Content Created",
              val: roiMetrics.postsCreated,
              icon: "💎",
              gradient: "from-blue-500 to-cyan-500",
            },
            {
              label: "Time Saved",
              val: `${Math.floor(roiMetrics.timeSaved / 60)}h`,
              icon: "⚡",
              gradient: "from-purple-500 to-pink-500",
            },
            {
              label: "Media Generated",
              val: roiMetrics.mediaGenerated,
              icon: "🚀",
              gradient: "from-green-500 to-emerald-500",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="group bg-gray-800/30 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:border-white/20 transition-all shadow-lg"
            >
              <div>
                <p className="text-purple-200 text-xs font-semibold uppercase tracking-wider mb-1">
                  {stat.label}
                </p>
                <p
                  className={`text-2xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}
                >
                  {stat.val}
                </p>
              </div>
              <div className="text-2xl opacity-90 group-hover:scale-110 transition-transform">
                {stat.icon}
              </div>
            </div>
          ))}
        </div>

        {/* === Main Workspace === */}
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
          {/* LEFT: Creation Engine - Glassmorphism */}
          <div className="bg-gray-800/30 backdrop-blur-xl rounded-[32px] border border-white/10 p-6 sm:p-8 relative overflow-hidden shadow-2xl">
            {/* PicDrift Logo - Full Color (No Grayscale) */}
            <div className="absolute top-0 right-0 p-8 opacity-100 pointer-events-none">
              <img src={picdriftLogo} className="h-10 w-auto" alt="PicDrift" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-cyan-200">
                Create New Magic
              </span>
            </h2>

            {/* Type Selection Tabs - Restored Gradients */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                {
                  id: "video",
                  label: "Video",
                  icon: "🎬",
                  grad: "from-pink-500 to-rose-500",
                },
                {
                  id: "image",
                  label: "Image",
                  icon: "🖼️",
                  grad: "from-blue-500 to-cyan-500",
                },
                {
                  id: "carousel",
                  label: "Carousel",
                  icon: "📱",
                  grad: "from-green-500 to-emerald-500",
                },
              ].map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedMediaType(type.id as MediaType)}
                  disabled={userCredits[type.id as MediaType] <= 0}
                  className={`
                        relative flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border transition-all duration-300
                        ${
                          selectedMediaType === type.id
                            ? `bg-gradient-to-br ${type.grad} border-transparent text-white shadow-xl scale-105`
                            : "bg-gray-900/40 border-white/5 hover:bg-gray-800/60 hover:border-white/10 text-gray-400"
                        }
                        ${
                          userCredits[type.id as MediaType] <= 0
                            ? "opacity-40 grayscale cursor-not-allowed"
                            : ""
                        }
                     `}
                >
                  <span className="text-2xl mb-1">{type.icon}</span>
                  <span className="text-sm font-semibold">{type.label}</span>
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Prompt Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-purple-200">
                    Your Vision
                  </label>
                  <span className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded border border-cyan-500/30">
                    AI Enhanced
                  </span>
                </div>
                <div className="relative group">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={`Describe your ${selectedMediaType} in detail...`}
                    rows={4}
                    className="w-full bg-gray-900/50 border border-white/10 rounded-2xl p-5 text-lg text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all resize-none shadow-inner backdrop-blur-sm"
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-purple-300">
                    {prompt.length} chars
                  </div>
                </div>
              </div>

              {/* Additional Settings Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-purple-200">
                    Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    className="w-full bg-gray-900/50 border border-white/10 rounded-xl p-3 text-white focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                    placeholder="Project Name"
                  />
                </div>

                {/* Reference Image */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-purple-200">
                    Reference (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className={`flex items-center justify-center w-full h-[50px] rounded-xl border border-dashed cursor-pointer transition-colors ${
                        referenceImageUrl
                          ? "border-green-500/50 bg-green-500/10"
                          : "border-white/20 hover:border-cyan-400/50 bg-gray-900/50"
                      }`}
                    >
                      {referenceImageUrl ? (
                        <span className="text-green-400 text-sm font-medium flex items-center gap-2">
                          ✓ Image Loaded
                        </span>
                      ) : (
                        <span className="text-purple-300 text-sm">
                          Upload Reference
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* Video Specific Controls */}
              {selectedMediaType === "video" && (
                <div className="p-6 bg-gray-900/30 border border-white/5 rounded-2xl space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-cyan-400">⚡</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Video Settings
                    </h3>
                  </div>

                  {/* Duration & Model */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs text-purple-300">
                        Duration
                      </label>
                      <div className="flex bg-gray-900/50 rounded-xl p-1 border border-white/10">
                        {[4, 8, 12].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setVideoDuration(d as any)}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                              videoDuration === d
                                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            {d}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-purple-300">Model</label>
                      <div className="flex bg-gray-900/50 rounded-xl p-1 border border-white/10">
                        {["sora-2", "sora-2-pro"].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setVideoModel(m as any)}
                            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                              videoModel === m
                                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            {m === "sora-2" ? "Sora 2" : "Sora Pro"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Aspect & Size */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs text-purple-300">
                        Aspect Ratio
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAspectRatio("16:9");
                            setVideoSize("1280x720");
                          }}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            aspectRatio === "16:9"
                              ? "border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/20"
                              : "border-white/10 hover:border-white/20 bg-gray-900/50"
                          }`}
                        >
                          <div className="text-white text-sm font-medium">
                            16:9
                          </div>
                          <div className="text-[10px] text-purple-200">
                            Landscape
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAspectRatio("9:16");
                            setVideoSize("720x1280");
                          }}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            aspectRatio === "9:16"
                              ? "border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/20"
                              : "border-white/10 hover:border-white/20 bg-gray-900/50"
                          }`}
                        >
                          <div className="text-white text-sm font-medium">
                            9:16
                          </div>
                          <div className="text-[10px] text-purple-200">
                            Mobile
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-purple-300">
                        Resolution
                      </label>
                      <select
                        value={videoSize}
                        onChange={(e: any) => setVideoSize(e.target.value)}
                        className="w-full bg-gray-900/50 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option
                          value={
                            aspectRatio === "16:9" ? "1280x720" : "720x1280"
                          }
                        >
                          HD (720p)
                        </option>
                        {videoModel === "sora-2-pro" && (
                          <option
                            value={
                              aspectRatio === "16:9" ? "1792x1024" : "1024x1792"
                            }
                          >
                            Premium (1024p)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Action - Restored Gradient Button */}
              <button
                type="submit"
                disabled={
                  generateMediaMutation.isPending ||
                  !prompt.trim() ||
                  userCredits[selectedMediaType] <= 0
                }
                className="group relative w-full py-5 rounded-2xl font-bold text-lg overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)] hover:shadow-[0_0_60px_-10px_rgba(168,85,247,0.7)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600 transition-all duration-300 group-hover:scale-[1.02]" />
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />

                <span className="relative flex items-center justify-center gap-3 text-white">
                  {generateMediaMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" variant="light" />
                      <span>Creating Magic...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">✨</span>
                      <span>
                        Generate{" "}
                        {selectedMediaType.charAt(0).toUpperCase() +
                          selectedMediaType.slice(1)}
                      </span>
                    </>
                  )}
                </span>
              </button>

              {generationState.status === "error" && (
                <ErrorAlert
                  message={generationState.error || "Error"}
                  onRetry={() => generateMediaMutation.mutate(buildFormData())}
                  type="error"
                />
              )}
            </form>
          </div>

          {/* RIGHT: Library / Archives - Glassmorphism */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xl font-bold text-white">Your Library</h3>
              <span className="text-xs text-purple-200 bg-white/10 px-2 py-0.5 rounded-full border border-white/5">
                {posts.filter((p: any) => p.status !== "CANCELLED").length}{" "}
                items
              </span>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 min-h-[500px] max-h-[800px] overflow-y-auto custom-scrollbar">
              {postsLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-4">
                  <LoadingSpinner size="md" variant="neon" />
                </div>
              ) : posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6 border-2 border-dashed border-white/10 rounded-2xl">
                  <div className="text-4xl mb-3 opacity-50">📂</div>
                  <p className="text-purple-200 font-medium">
                    No creations yet
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Start generating to see them here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts
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
                        userCredits={userCredits}
                        publishingPost={publishingPost}
                        primaryColor={primaryColor}
                        compact={true}
                      />
                    ))}
                </div>
              )}
              {postsError && (
                <div className="mt-4">
                  <ErrorAlert message="Failed to load posts" type="error" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollbar Styles for Dark Theme */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </div>
  );
}

export default Dashboard;
