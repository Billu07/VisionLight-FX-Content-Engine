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

// === TYPES FROM FINAL VERSION ===
type EngineType = "kie" | "studio" | "openai";
type StudioMode = "image" | "carousel";

interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  result?: any;
  error?: string;
}

function Dashboard() {
  // ==========================================
  // LOGIC & STATE (FROM FINAL VERSION)
  // ==========================================

  // === STATE: CORE ===
  const [prompt, setPrompt] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  // === STATE: ENGINE SELECTION ===
  const [activeEngine, setActiveEngine] = useState<EngineType>("kie");
  const [studioMode, setStudioMode] = useState<StudioMode>("image");

  // === STATE: KIE AI ===
  const [kieDuration, setKieDuration] = useState<10 | 15>(10);
  const [kieResolution, setKieResolution] = useState<"720p" | "1080p">("720p");
  const [kieAspect, setKieAspect] = useState<"landscape" | "portrait">(
    "landscape"
  );
  const [kieModel, setKieModel] = useState<"kie-sora-2" | "kie-sora-2-pro">(
    "kie-sora-2"
  );

  // === STATE: OPENAI / ORIGINAL VIDEO ===
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(12);
  const [videoModel, setVideoModel] = useState<"sora-2" | "sora-2-pro">(
    "sora-2"
  );
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoSize, setVideoSize] = useState<
    "1280x720" | "1792x1024" | "720x1280" | "1024x1792"
  >("1280x720");

  // === STATE: UPLOAD & UI ===
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({
    status: "idle",
  });
  const [copyingPostId, setCopyingPostId] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showQueuedModal, setShowQueuedModal] = useState(false);
  const [showPromptApproval, setShowPromptApproval] = useState(false);
  const [pendingApprovalPostId, setPendingApprovalPostId] = useState<
    string | null
  >(null);

  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  // --- EFFECT: Reset Files on Engine Change ---
  useEffect(() => {
    setReferenceImages([]);
    setReferenceImageUrls([]);
  }, [activeEngine, studioMode]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auth checks
  useEffect(() => {
    useAuth.getState().checkAuth();
  }, []);
  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  const { data: brandConfig } = useQuery({
    queryKey: ["brand-config"],
    queryFn: async () => (await apiEndpoints.getBrandConfig()).data.config,
    enabled: !!user,
  });

  useEffect(() => {
    const primary = brandConfig?.primaryColor || "#6366f1";
    document.documentElement.style.setProperty("--primary-brand", primary);
  }, [brandConfig]);

  useEffect(() => {
    if (user && !localStorage.getItem("visionlight_welcome_shown")) {
      setShowWelcomeTour(true);
      localStorage.setItem("visionlight_welcome_shown", "true");
    }
  }, [user]);

  const {
    data: posts = [],
    isLoading: postsLoading,
    error: postsError,
  } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      try {
        const response = await apiEndpoints.getPosts();
        return Array.isArray(response.data.posts) ? response.data.posts : [];
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
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

  const postNeedingApproval = useMemo(() => {
    if (!posts || !Array.isArray(posts)) return null;
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
    }
  }, [postNeedingApproval]);

  const {
    data: userCredits = { video: 0, image: 0, carousel: 0 },
    isLoading: creditsLoading,
  } = useQuery({
    queryKey: ["user-credits"],
    queryFn: async () =>
      (await apiEndpoints.getUserCredits()).data.credits || {
        video: 0,
        image: 0,
        carousel: 0,
      },
    enabled: !!user,
  });

  const generateMediaMutation = useMutation({
    mutationFn: async (formData: FormData) =>
      apiEndpoints.generateMediaDirect(formData),
    onSuccess: (response: any) => {
      if (response?.data?.success) {
        setGenerationState({
          status: "generating",
          result: { postId: response.data.postId },
        });
        setShowQueuedModal(true);
        setPrompt("");
        setVideoTitle("");
        setReferenceImages([]);
        setReferenceImageUrls([]);
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      }
    },
    onError: (err: any) =>
      setGenerationState({ status: "error", error: err.message }),
  });

  const approvePromptMutation = useMutation({
    mutationFn: (data: { postId: string; finalPrompt: string }) =>
      apiEndpoints.approvePrompt(data),
    onSuccess: () => {
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const cancelPromptMutation = useMutation({
    mutationFn: (postId: string) => apiEndpoints.cancelPrompt(postId),
    onSuccess: () => {
      setShowPromptApproval(false);
      setPendingApprovalPostId(null);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleCopyPrompt = async (data: { prompt: string; postId: string }) => {
    try {
      setCopyingPostId(data.postId);
      await navigator.clipboard.writeText(data.prompt);
      setTimeout(() => setCopyingPostId(null), 1000);
    } catch (err) {}
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limits
    const maxFiles =
      activeEngine === "studio" && studioMode === "carousel" ? 5 : 1;

    if (files.length + referenceImages.length > maxFiles) {
      alert(`❌ Only ${maxFiles} image(s) allowed for this mode.`);
      return;
    }

    const newFiles = Array.from(files);
    setReferenceImages((prev) => [...prev, ...newFiles]);
    const newUrls = newFiles.map((file) => URL.createObjectURL(file));
    setReferenceImageUrls((prev) => [...prev, ...newUrls]);
  };

  const removeImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
    setReferenceImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // === FORM DATA BUILDER (CRITICAL LOGIC) ===
  const buildFormData = () => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("title", videoTitle);

    if (activeEngine === "kie") {
      formData.append("mediaType", "video");
      formData.append("model", kieModel);
      formData.append("duration", kieDuration.toString());
      formData.append(
        "aspectRatio",
        kieAspect === "landscape" ? "16:9" : "9:16"
      );

      // Resolution Calculation
      let w = 1280;
      let h = 720;
      if (kieResolution === "1080p") {
        w = 1920;
        h = 1080;
      }
      if (kieAspect === "portrait") {
        const t = w;
        w = h;
        h = t;
      }
      formData.append("size", `${w}x${h}`);
    } else if (activeEngine === "openai") {
      formData.append("mediaType", "video");
      formData.append("model", videoModel);
      formData.append("duration", videoDuration.toString());
      formData.append("size", videoSize);
      formData.append("aspectRatio", aspectRatio);
    } else {
      // Studio
      formData.append("mediaType", studioMode);
    }

    referenceImages.forEach((file) => formData.append("referenceImages", file));
    return formData;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let typeToCheck = "video";
    if (activeEngine === "studio") typeToCheck = studioMode;

    const credits = userCredits?.[typeToCheck as keyof typeof userCredits] ?? 0;
    if (!prompt.trim() || credits <= 0) return;
    setGenerationState({ status: "idle" });
    generateMediaMutation.mutate(buildFormData());
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const companyName =
    brandConfig?.companyName || user?.name || "Visionlight AI";

  if (authLoading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (!user) return null;

  // ==========================================
  // RENDER: OLD VISUAL THEME
  // ==========================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      {/* --- MODALS (Kept functional but styled consistently) --- */}
      {showQueuedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 rounded-2xl border border-cyan-400/40 shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Queued Successfully
            </h3>
            <p className="text-sm text-purple-200 mb-4">
              We are processing your request. Check library for updates.
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

      {showWelcomeTour && (
        <WelcomeTour onClose={() => setShowWelcomeTour(false)} />
      )}

      <PromptApprovalModal
        postId={pendingApprovalPostId || ""}
        isOpen={showPromptApproval}
        onClose={() => setShowPromptApproval(false)}
        onApprove={(p) =>
          approvePromptMutation.mutate({
            postId: pendingApprovalPostId || "",
            finalPrompt: p,
          })
        }
        onCancel={(id) => cancelPromptMutation.mutate(id)}
        isLoading={approvePromptMutation.isPending}
      />

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
        {/* --- HEADER (OLD VISUALS) --- */}
        <div className="mb-6 sm:mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
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
            <div className="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center mt-14">
              <div className="h-14 sm:h-16 flex items-center justify-center mb-1">
                <img
                  src={fxLogo}
                  alt="FX"
                  className="h-full w-auto object-contain"
                />
              </div>
              <p className="text-purple-300 text-xs sm:text-sm text-center">
                Your AI-Powered Creation Engine
              </p>
            </div>
            {isMobile && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="p-2 bg-gray-800/60 border border-cyan-400/30 rounded-xl"
                >
                  🎨
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-gray-800/60 border border-purple-400/30 rounded-xl"
                >
                  🚪
                </button>
              </div>
            )}
          </div>

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
                    {/* CREDITS DISPLAY ADAPTED TO OLD LAYOUT */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🎬</span>
                        <span
                          className={`text-xs font-semibold ${
                            userCredits.video > 0
                              ? "text-white"
                              : "text-gray-400"
                          }`}
                        >
                          {userCredits.video}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🖼️</span>
                        <span
                          className={`text-xs font-semibold ${
                            userCredits.image > 0
                              ? "text-white"
                              : "text-gray-400"
                          }`}
                        >
                          {userCredits.image}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">📱</span>
                        <span
                          className={`text-xs font-semibold ${
                            userCredits.carousel > 0
                              ? "text-white"
                              : "text-gray-400"
                          }`}
                        >
                          {userCredits.carousel}
                        </span>
                      </div>
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
            {!isMobile && (
              <div className="flex gap-2">
                <a
                  href="https://www.picdrift.com/fx-credits"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 bg-gray-800/60 border border-green-400/30 rounded-xl text-green-400 text-sm hover:bg-green-400/10 flex items-center gap-2"
                >
                  Buy FX Credits
                </a>
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="px-4 py-2.5 bg-gray-800/60 border border-cyan-400/30 rounded-xl text-cyan-400 text-sm hover:bg-cyan-400/10"
                >
                  Edit Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2.5 bg-gray-800/60 border border-purple-400/30 rounded-xl text-purple-300 text-sm hover:bg-purple-400/10"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* --- MAIN CREATION AREA --- */}
          <div className="flex-1">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 lg:p-8 shadow-2xl">
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
                  Create Something Cinematic
                </p>
              </div>

              {/* === ENGINE SELECTOR (STYLED LIKE OLD TYPES) === */}
              <div className="mb-6 sm:mb-8">
                <label className="block text-sm font-semibold text-white mb-3 sm:mb-4">
                  🎬 Select Content Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {[
                    {
                      id: "kie",
                      label: "Video FX",

                      grad: "from-blue-700 to-cyan-700",
                    },
                    {
                      id: "studio",
                      label: "Studio FX",
                      sub: "Image & Carousel",

                      grad: "from-pink-500 to-rose-500",
                    },
                    {
                      id: "openai",
                      label: "Video FX 2",

                      grad: "from-violet-700 to-purple-700",
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveEngine(item.id as EngineType)}
                      className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                        activeEngine === item.id
                          ? `border-white/20 bg-gradient-to-br ${item.grad} shadow-2xl scale-105`
                          : "border-white/5 bg-gray-800/50 hover:border-white/10 hover:scale-102"
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xl sm:text-2xl group-hover:scale-110 transition-transform">
                          {item.icon}
                        </span>
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-white">
                            {item.label}
                          </div>
                          <div
                            className={`text-xs ${
                              activeEngine === item.id
                                ? "text-white/80"
                                : "text-purple-300"
                            }`}
                          >
                            {item.sub}
                          </div>
                        </div>
                        {activeEngine === item.id && (
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* === STUDIO TOGGLE (NEW LOGIC, OLD STYLE) === */}
              {activeEngine === "studio" && (
                <div className="flex bg-gray-900/50 p-1 rounded-xl mb-6 max-w-xs mx-auto border border-white/5 animate-in fade-in">
                  <button
                    onClick={() => setStudioMode("image")}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      studioMode === "image"
                        ? "bg-cyan-500 text-white shadow-lg"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Image FX
                  </button>
                  <button
                    onClick={() => setStudioMode("carousel")}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      studioMode === "carousel"
                        ? "bg-green-500 text-white shadow-lg"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Carousel FX
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                {/* PROMPT INPUT (OLD STYLE) */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2 sm:mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    Your Creative Vision
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={`Describe your ${
                      activeEngine === "studio" ? studioMode : "video"
                    } vision...`}
                    className="w-full p-4 sm:p-5 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all resize-none text-white placeholder-purple-300/60 backdrop-blur-sm text-base leading-relaxed"
                    rows={isMobile ? 3 : 4}
                  />
                </div>

                {/* TITLE INPUT (OLD STYLE) */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="block text-sm font-semibold text-white capitalize">
                    {activeEngine === "studio" ? studioMode : "video"} Title
                    (Optional)
                  </label>
                  <input
                    type="text"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="Give your creation a memorable name..."
                    className="w-full p-3 sm:p-4 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-purple-300/60 backdrop-blur-sm"
                  />
                </div>

                {/* === KIE AI CONTROLS (NEW LOGIC, OLD "PILL" STYLE) === */}
                {activeEngine === "kie" && (
                  <div className="space-y-4 sm:space-y-6 animate-in fade-in">
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {[
                        { id: "kie-sora-2", label: "Video FX" },
                        { id: "kie-sora-2-pro", label: "Video FX Pro" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setKieModel(m.id as any)}
                          className={`p-3 rounded-xl border text-sm font-bold transition-all ${
                            kieModel === m.id
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg"
                              : "border-white/10 bg-gray-800/50 text-gray-400"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="text-sm font-semibold text-white mb-2 block">
                          Duration
                        </label>
                        <div className="flex gap-2">
                          {[10, 15].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setKieDuration(d as any)}
                              className={`flex-1 py-2 rounded-lg border ${
                                kieDuration === d
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "border-white/10 bg-gray-800/50 text-gray-400"
                              }`}
                            >
                              {d}s
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-white mb-2 block">
                          Aspect Ratio
                        </label>
                        <div className="flex gap-2">
                          {[
                            { id: "landscape", label: "Landscape" },
                            { id: "portrait", label: "Portrait" },
                          ].map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setKieAspect(a.id as any)}
                              className={`flex-1 py-2 rounded-lg border ${
                                kieAspect === a.id
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "border-white/10 bg-gray-800/50 text-gray-400"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-sm font-semibold text-white mb-2 block">
                          Resolution
                        </label>
                        <div className="flex gap-2">
                          {[
                            { id: "720p", label: "720p (Fast)" },
                            { id: "1080p", label: "1080p (HD)" },
                          ].map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setKieResolution(r.id as any)}
                              className={`flex-1 py-2 rounded-lg border ${
                                kieResolution === r.id
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "border-white/10 bg-gray-800/50 text-gray-400"
                              }`}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* === OPENAI CONTROLS (NEW LOGIC, OLD VISUAL LAYOUT) === */}
                {activeEngine === "openai" && (
                  <div className="space-y-4 sm:space-y-6 animate-in fade-in">
                    {/* Model Selector */}
                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        AI Model
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {[
                          { id: "sora-2", label: "Video FX 2" },
                          { id: "sora-2-pro", label: "Video FX 2 Pro" },
                        ].map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => setVideoModel(model.id as any)}
                            className={`p-3 sm:p-4 rounded-2xl border-2 transition-all text-left group ${
                              videoModel === model.id
                                ? "border-cyan-400 bg-cyan-500/20"
                                : "border-white/10 bg-gray-800/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-white text-sm flex items-center gap-2">
                                {model.label}
                              </div>
                              {videoModel === model.id && (
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aspect Ratio */}
                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        Aspect Ratio
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {[
                          {
                            ratio: "16:9",
                            label: "Landscape",

                            desc: "Widescreen",
                          },
                          {
                            ratio: "9:16",
                            label: "Portrait",

                            desc: "Mobile",
                          },
                        ].map(({ ratio, label, icon, desc }) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => {
                              setAspectRatio(ratio as any);
                              setVideoSize(
                                ratio === "16:9"
                                  ? videoModel === "sora-2-pro"
                                    ? "1792x1024"
                                    : "1280x720"
                                  : videoModel === "sora-2-pro"
                                  ? "1024x1792"
                                  : "720x1280"
                              );
                            }}
                            className={`p-3 sm:p-4 rounded-2xl border-2 transition-all text-center group ${
                              aspectRatio === ratio
                                ? "border-purple-400 bg-purple-500/20"
                                : "border-white/10 bg-gray-800/50"
                            }`}
                          >
                            <div className="text-xl sm:text-2xl mb-2 group-hover:scale-110">
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

                    {/* Video Size */}
                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        Video Size
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
                          Upgrade to Video FX 2 Pro for enhanced 1024p
                          resolution
                        </p>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="space-y-2 sm:space-y-3">
                      <label className="block text-sm font-semibold text-white">
                        ⏱️ Video Duration
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[4, 8, 12].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setVideoDuration(sec as any)}
                            className={`px-3 sm:px-5 py-2 sm:py-3 rounded-xl border text-sm font-semibold flex-1 min-w-[80px] ${
                              videoDuration === sec
                                ? "bg-cyan-500 border-cyan-500 text-white"
                                : "bg-gray-800/50 border-white/10 text-purple-200"
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* === UPLOAD UI (OLD VISUALS) === */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="block text-sm font-semibold text-white">
                    Reference Images (Optional)
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-cyan-500 hover:bg-gray-800/50 transition-all group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <div className="text-4xl mb-2 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                          <p className="text-sm text-gray-400">
                            <span className="font-semibold text-cyan-400">
                              Click to upload
                            </span>{" "}
                            or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">
                            {activeEngine === "studio" &&
                            studioMode === "carousel"
                              ? "Up to 5 images"
                              : "Single frame"}{" "}
                            (PNG/JPG, Max 10MB)
                          </p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          multiple={
                            activeEngine === "studio" &&
                            studioMode === "carousel"
                          }
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                      </label>
                    </div>
                    {referenceImageUrls.length > 0 && (
                      <div className="grid grid-cols-5 gap-2 animate-in fade-in">
                        {referenceImageUrls.map((url, index) => (
                          <div
                            key={index}
                            className="relative aspect-square group"
                          >
                            <img
                              src={url}
                              alt={`Ref ${index}`}
                              className="w-full h-full object-cover rounded-lg border border-white/20"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    generateMediaMutation.isPending ||
                    !prompt.trim() ||
                    (userCredits[
                      activeEngine === "studio" ? studioMode : "video"
                    ] || 0) <= 0
                  }
                  className="w-full gradient-brand text-white py-4 sm:py-5 px-6 sm:px-8 rounded-2xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-bold text-base sm:text-lg flex items-center justify-center gap-3 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  {generateMediaMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" variant="light" />
                      <span>
                        Starting{" "}
                        {activeEngine === "studio" ? studioMode : "video"}...
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:scale-110 transition-transform text-lg sm:text-xl">
                        ✨
                      </span>
                      <span>
                        Generate{" "}
                        {activeEngine === "studio"
                          ? studioMode === "image"
                            ? "Image"
                            : "Carousel"
                          : "Video"}
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

          {/* --- SIDEBAR (OLD VISUALS) --- */}
          <div className="lg:w-96">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 shadow-2xl sticky top-4">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>📚</span> Your Library{" "}
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
                        onPublishPost={handleCopyPrompt}
                        userCredits={
                          userCredits || { video: 0, image: 0, carousel: 0 }
                        }
                        publishingPost={copyingPostId}
                        primaryColor={brandConfig?.primaryColor || "#6366f1"}
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
