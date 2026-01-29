import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorAlert } from "../components/ErrorAlert";
import { PostCard } from "../components/PostCard";
import { BrandConfigModal } from "../components/BrandConfigModal";
import { AssetLibrary } from "../components/AssetLibrary";
import { TimelineExpander } from "../components/TimelineExpander";
import { WelcomeTour } from "../components/WelcomeTour";
import { MediaPreview } from "../components/MediaPreview";
import { EditAssetModal } from "../components/EditAssetModal";
import { DriftFrameExtractor } from "../components/DriftFrameExtractor";

// Import your logo images
import picdriftLogo from "../assets/picdrift.png";
import fxLogo from "../assets/fx.png"; // Ensure this matches your file name

// === CONFIGURATION ===

type EngineType = "kie" | "studio" | "openai";
type StudioMode = "image" | "carousel" | "edit";

// Visual Tab Type
type VisualTab = "picdrift" | "studio" | "videofx";

interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  result?: any;
  error?: string;
}

function Dashboard() {
  // ==========================================
  // STATE
  // ==========================================

  // Core
  const [prompt, setPrompt] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [activeLibrarySlot, setActiveLibrarySlot] = useState<
    "start" | "end" | "generic" | null
  >(null);

  // Engine Selection
  const [activeEngine, setActiveEngine] = useState<EngineType>("kie");
  const [studioMode, setStudioMode] = useState<StudioMode>("image");

  // Kie AI (Video FX & PicDrift)
  const [kieDuration, setKieDuration] = useState<5 | 10 | 15>(15);
  const [kieResolution, setKieResolution] = useState<"720p" | "1080p">("1080p");
  const [kieAspect, setKieAspect] = useState<
    "landscape" | "portrait" | "square"
  >("portrait");
  const [kieModel, setKieModel] = useState<"kie-sora-2" | "kie-sora-2-pro">(
    "kie-sora-2-pro",
  );

  // Video FX Sub-mode
  const [videoFxMode, setVideoFxMode] = useState<"video" | "picdrift">(
    "picdrift",
  );

  // OpenAI (Video FX 2)
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(12);
  const [videoModel, setVideoModel] = useState<"sora-2" | "sora-2-pro">(
    "sora-2-pro",
  );
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const [videoSize, setVideoSize] = useState<
    "1280x720" | "1792x1024" | "720x1280" | "1024x1792"
  >("1024x1792");

  // Studio (Gemini) Aspect Ratio
  const [geminiAspect, setGeminiAspect] = useState<"1:1" | "16:9" | "9:16">(
    "9:16",
  );

  // Upload & UI
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);

  // Explicit State for PicDrift Frames
  const [picDriftFrames, setPicDriftFrames] = useState<{
    start: File | null;
    end: File | null;
  }>({ start: null, end: null });
  const [picDriftUrls, setPicDriftUrls] = useState<{
    start: string | null;
    end: string | null;
  }>({ start: null, end: null });

  const [generationState, setGenerationState] = useState<GenerationState>({
    status: "idle",
  });

  // Modals & UI Flags
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [showQueuedModal, setShowQueuedModal] = useState(false);
  const [showNoCreditsModal, setShowNoCreditsModal] = useState(false);
  const [showPromptInfo, setShowPromptInfo] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  // Preview State
  const [previewMedia, setPreviewMedia] = useState<{
    type: "image" | "video" | "carousel";
    url: string | string[];
  } | null>(null);
  const [previewCarouselIndex, setPreviewCarouselIndex] = useState(0);

  // Editor States
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [editingVideoUrl, setEditingVideoUrl] = useState<string | undefined>(
    undefined,
  );
  const [extractingVideoUrl, setExtractingVideoUrl] = useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  // Helper to determine the current "Visual Tab"
  const currentVisualTab: VisualTab =
    activeEngine === "studio"
      ? "studio"
      : activeEngine === "kie" && videoFxMode === "picdrift"
        ? "picdrift"
        : "videofx";

  // Dynamic Theme Colors based on Tab
  const getThemeColors = () => {
    if (currentVisualTab === "picdrift")
      return {
        accent: "text-rose-400",
        border: "border-rose-500/50",
        bg: "bg-rose-500",
        gradient: "from-rose-600 to-pink-600",
        glow: "shadow-rose-500/20",
        ring: "focus:ring-rose-500",
      };
    if (currentVisualTab === "studio")
      return {
        accent: "text-violet-400",
        border: "border-violet-500/50",
        bg: "bg-violet-600",
        gradient: "from-violet-600 to-indigo-600",
        glow: "shadow-violet-500/20",
        ring: "focus:ring-violet-500",
      };
    return {
      // videofx
      accent: "text-cyan-400",
      border: "border-cyan-500/50",
      bg: "bg-cyan-600",
      gradient: "from-cyan-600 to-blue-600",
      glow: "shadow-cyan-500/20",
      ring: "focus:ring-cyan-500",
    };
  };
  const theme = getThemeColors();

  // HANDLER: Open Timeline Video in Drift
  const handleDriftFromPost = (post: any) => {
    setExtractingVideoUrl(post.mediaUrl);
  };

  // Reset Files on Engine Change
  useEffect(() => {
    setReferenceImages([]);
    setReferenceImageUrls([]);
    setPicDriftFrames({ start: null, end: null });
    setPicDriftUrls({ start: null, end: null });
  }, [activeEngine, studioMode, videoFxMode]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && !localStorage.getItem("visionlight_welcome_shown")) {
      setShowWelcomeTour(true);
      localStorage.setItem("visionlight_welcome_shown", "true");
    }
  }, [user]);

  // === DATA FETCHING ===
  const { data: brandConfig } = useQuery({
    queryKey: ["brand-config"],
    queryFn: async () => (await apiEndpoints.getBrandConfig()).data.config,
    enabled: !!user,
  });

  useEffect(() => {
    const primary = brandConfig?.primaryColor || "#6366f1";
    document.documentElement.style.setProperty("--primary-brand", primary);
  }, [brandConfig]);

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
          (p.progress || 0) < 100,
      );
      return hasProcessing ? 5000 : false;
    },
    staleTime: 1000,
  });

  const { data: userCredits = 0, isLoading: creditsLoading } = useQuery({
    queryKey: ["user-credits"],
    queryFn: async () => {
      const res = await apiEndpoints.getUserCredits();
      return typeof res.data.credits === "number" ? res.data.credits : 0;
    },
    enabled: !!user,
  });

  useQuery({
    queryKey: ["check-jobs"],
    queryFn: async () => {
      const hasActive = posts.some(
        (p: any) => p.status === "PROCESSING" || p.status === "NEW",
      );
      if (hasActive) {
        await apiEndpoints.checkActiveJobs();
      }
      return true;
    },
    refetchInterval: () => {
      const hasActive = posts.some(
        (p: any) => p.status === "PROCESSING" || p.status === "NEW",
      );
      return hasActive ? 5000 : false;
    },
    enabled: !!user && posts.length > 0,
  });

  // Credit Logic
  // @ts-ignore
  const system = user?.creditSystem
    ? user.creditSystem.toUpperCase()
    : "COMMERCIAL";
  const isCommercial = system !== "INTERNAL";
  const [isRequesting, setIsRequesting] = useState(false);
  const creditLink = isCommercial
    ? "http://picdrift.com/fx-Credits"
    : "http://PicDrift.com/fx-request";
  const creditBtnText = isCommercial ? "Buy Credit" : "Request Credit";
  const isAdmin = user?.role === "ADMIN";

  // === ACTIONS ===

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
        setPicDriftFrames({ start: null, end: null });
        setPicDriftUrls({ start: null, end: null });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      }
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setShowNoCreditsModal(true);
      } else {
        setGenerationState({ status: "error", error: err.message });
      }
    },
  });

  const handleShowPromptInfo = (promptText: string) => {
    setShowPromptInfo(promptText);
  };

  const handleMoveToAssets = async (postId: string) => {
    if (!confirm("Save this content to your Asset Library?")) return;
    try {
      await apiEndpoints.movePostToAsset(postId);
      alert("✅ Saved! Check your Asset Library.");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (e: any) {
      alert("Failed to save: " + e.message);
    }
  };

  const handleRequestCredits = async () => {
    if (!confirm("Send a notification to Admin requesting more credits?"))
      return;
    setIsRequesting(true);
    try {
      await apiEndpoints.requestCredits();
      alert("✅ Request sent! The admin has been notified.");
    } catch (err) {
      alert("Failed to send request.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleAssetSelect = (file: File, url: string, ratio?: string) => {
    if (activeLibrarySlot === "start") {
      setPicDriftFrames((prev) => ({ ...prev, start: file }));
      setPicDriftUrls((prev) => ({ ...prev, start: url }));
    } else if (activeLibrarySlot === "end") {
      setPicDriftFrames((prev) => ({ ...prev, end: file }));
      setPicDriftUrls((prev) => ({ ...prev, end: url }));
    } else {
      if (activeEngine === "studio" && studioMode === "carousel") {
        setReferenceImages((prev) => [...prev, file]);
        setReferenceImageUrls((prev) => [...prev, url]);
      } else {
        setReferenceImages([file]);
        setReferenceImageUrls([url]);
      }
    }

    if (ratio && ratio !== "original") {
      const r = ratio as "16:9" | "9:16" | "1:1";
      if (activeEngine === "kie") {
        if (r === "16:9") setKieAspect("landscape");
        else if (r === "9:16") setKieAspect("portrait");
        else if (r === "1:1") setKieAspect("square");
      } else if (activeEngine === "openai") {
        if (r === "16:9") {
          setAspectRatio("16:9");
          setVideoSize("1792x1024");
        } else if (r === "9:16") {
          setAspectRatio("9:16");
          setVideoSize("1024x1792");
        }
      } else if (activeEngine === "studio") {
        setGeminiAspect(r);
      }
    }
    setActiveLibrarySlot(null);
  };

  const handleUseAsStartFrame = async (url: string) => {
    try {
      setActiveEngine("kie");
      setVideoFxMode("picdrift");
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], "start_frame_reused.jpg", {
        type: "image/jpeg",
      });
      setPicDriftFrames({ start: file, end: null });
      setPicDriftUrls({ start: url, end: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Failed to reuse frame:", error);
      alert("Could not load frame. Please try downloading it.");
    }
  };

  const handleGenericUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const maxFiles = 14;
    if (files.length + referenceImages.length > maxFiles) {
      alert(`❌ Only ${maxFiles} image(s) allowed for this mode.`);
      return;
    }
    const newFiles = Array.from(files);
    setReferenceImages((prev) => [...prev, ...newFiles]);
    const newUrls = newFiles.map((file) => URL.createObjectURL(file));
    setReferenceImageUrls((prev) => [...prev, ...newUrls]);
  };

  const handleMagicEditUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("raw", "true");
      const res = await apiEndpoints.uploadAssetSync(formData);
      if (res.data.success && res.data.asset) {
        setEditingAsset(res.data.asset);
        e.target.value = "";
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    }
  };

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => apiEndpoints.deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: any) => alert("Failed to delete post: " + err.message),
  });

  const removeGenericImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
    setReferenceImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePicDriftUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "start" | "end",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicDriftFrames((prev) => ({ ...prev, [type]: file }));
    setPicDriftUrls((prev) => ({ ...prev, [type]: URL.createObjectURL(file) }));
  };

  const removePicDriftImage = (type: "start" | "end") => {
    setPicDriftFrames((prev) => ({ ...prev, [type]: null }));
    setPicDriftUrls((prev) => ({ ...prev, [type]: null }));
  };

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("title", videoTitle);

    if (activeEngine === "kie" && videoFxMode === "picdrift") {
      formData.append("mediaType", "video");
      formData.append("model", "kling-2.5");
      if (picDriftFrames.start)
        formData.append("referenceImages", picDriftFrames.start);
      if (picDriftFrames.end)
        formData.append("referenceImages", picDriftFrames.end);
      formData.append("duration", kieDuration.toString());
      formData.append("aspectRatio", kieAspect);
      formData.append("resolution", kieResolution);
    } else if (activeEngine === "kie" && videoFxMode === "video") {
      formData.append("mediaType", "video");
      formData.append("model", kieModel);
      referenceImages.forEach((file) =>
        formData.append("referenceImages", file),
      );
      formData.append("duration", kieDuration.toString());
      formData.append("aspectRatio", kieAspect);
      formData.append("resolution", kieResolution);
    } else if (activeEngine === "openai") {
      formData.append("mediaType", "video");
      formData.append("model", videoModel);
      formData.append("duration", videoDuration.toString());
      formData.append("size", videoSize);
      formData.append("aspectRatio", aspectRatio);
      referenceImages.forEach((file) =>
        formData.append("referenceImages", file),
      );
    } else {
      formData.append("mediaType", studioMode);
      let sizeStr = "1024x1024";
      if (geminiAspect === "16:9") sizeStr = "1792x1024";
      if (geminiAspect === "9:16") sizeStr = "1024x1792";
      formData.append("size", sizeStr);
      formData.append("aspectRatio", geminiAspect);
      referenceImages.forEach((file) =>
        formData.append("referenceImages", file),
      );
    }
    return formData;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userCredits <= 0) {
      setShowNoCreditsModal(true);
      return;
    }
    if (!prompt.trim()) return;
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (!user) return null;

  const getCurrentRatioForLibrary = () => {
    if (activeEngine === "kie") return kieAspect;
    if (activeEngine === "openai") return aspectRatio;
    if (activeEngine === "studio") return geminiAspect;
    return undefined;
  };

  const getHeaderContent = () => {
    if (currentVisualTab === "picdrift")
      return { logo: picdriftLogo, text: "Photo to Photo Movement" };
    if (currentVisualTab === "studio")
      return { logo: fxLogo, text: "Image Generation" };
    return { logo: fxLogo, text: "Video Generation" };
  };
  const { logo: currentLogo, text: currentHeaderText } = getHeaderContent();

  return (
    // ✅ 1. DARKER, PREMIUM BACKGROUND (Zinc-950 with Spotlight)
    <div className="min-h-screen bg-[#0a0a0a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/20 via-[#0a0a0a] to-black text-zinc-100 font-sans">
      {/* ... MODALS (Kept exactly same) ... */}
      {activeLibrarySlot !== null && (
        <AssetLibrary
          onClose={() => setActiveLibrarySlot(null)}
          onSelect={handleAssetSelect}
          initialAspectRatio={getCurrentRatioForLibrary()}
        />
      )}
      {extractingVideoUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-4xl p-6 relative flex flex-col items-center">
            <button
              onClick={() => setExtractingVideoUrl(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-white font-bold mb-4 self-start">
              ✂️ Extract Frame from Video
            </h3>
            <DriftFrameExtractor
              videoUrl={extractingVideoUrl}
              onExtract={async (blob) => {
                const file = new File([blob], "timeline_extract.jpg", {
                  type: "image/jpeg",
                });
                const formData = new FormData();
                formData.append("image", file);
                formData.append("raw", "true");
                await apiEndpoints.uploadAssetSync(formData);
                alert("✅ Frame Saved to Asset Library!");
                queryClient.invalidateQueries({ queryKey: ["assets"] });
                setExtractingVideoUrl(null);
              }}
              onCancel={() => setExtractingVideoUrl(null)}
            />
          </div>
        </div>
      )}
      {/* ... (Other modals kept same logic, just styled dark) ... */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => {
            setPreviewMedia(null);
            setPreviewCarouselIndex(0);
          }}
        >
          <div
            className="relative w-full max-w-5xl flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {previewMedia.type === "carousel" &&
            Array.isArray(previewMedia.url) ? (
              <div className="flex flex-col items-center w-full">
                <img
                  src={previewMedia.url[previewCarouselIndex]}
                  className="max-h-[80vh] w-auto rounded-lg shadow-2xl border border-zinc-800"
                />
                {previewMedia.url.length > 1 && (
                  <div className="flex gap-2 mt-4">
                    {previewMedia.url.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewCarouselIndex(idx)}
                        className={`w-3 h-3 rounded-full transition-all ${
                          idx === previewCarouselIndex
                            ? "bg-white scale-125"
                            : "bg-white/30 hover:bg-white/60"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="max-w-full max-h-[85vh]">
                  <MediaPreview
                    mediaUrl={previewMedia.url as string}
                    mediaType={
                      previewMedia.type === "video" ? "video" : "image"
                    }
                  />
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setPreviewMedia(null);
                setPreviewCarouselIndex(0);
              }}
              className="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
      {showQueuedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Request Received Successfully
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              Our AI model is now generating your result. Check Timeline for
              updates.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowQueuedModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-black text-sm font-medium"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ... Keeping other modals ... */}
      {showNoCreditsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="bg-zinc-900 rounded-2xl border border-red-500/30 shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="text-4xl mb-3">💎</div>
            <h3 className="text-xl font-bold text-white mb-2">
              Insufficient Credits
            </h3>
            <p className="text-sm text-zinc-400 mb-6">
              You need more credits to start this generation.
            </p>
            <div className="flex flex-col gap-3">
              {isCommercial ? (
                <a
                  href={creditLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 bg-green-600 rounded-xl font-bold"
                >
                  {creditBtnText}
                </a>
              ) : (
                <button
                  onClick={handleRequestCredits}
                  disabled={isRequesting}
                  className="w-full py-3 bg-purple-600 rounded-xl font-bold"
                >
                  {isRequesting ? "Sending..." : "Request Credit"}
                </button>
              )}
              <button
                onClick={() => setShowNoCreditsModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showPromptInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={() => setShowPromptInfo(null)}
        >
          <div
            className="bg-zinc-900 rounded-2xl border border-zinc-700 max-w-md w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-3">
              Generation Prompt
            </h3>
            <div className="bg-black/50 p-4 rounded-lg text-zinc-300 text-sm mb-4 max-h-60 overflow-y-auto font-mono">
              {showPromptInfo}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(showPromptInfo);
                  setShowPromptInfo(null);
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm border border-zinc-700"
              >
                Copy
              </button>
              <button
                onClick={() => setShowPromptInfo(null)}
                className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showWelcomeTour && (
        <WelcomeTour onClose={() => setShowWelcomeTour(false)} />
      )}

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
        {/* HEADER */}
        <div className="mb-6 sm:mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold leading-tight text-white tracking-tight">
                  {companyName}
                </h1>
              </div>
            </div>
            {isMobile && (
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    onClick={() => navigate("/admin")}
                    className="p-2 bg-red-900/50 border border-red-500/30 rounded-xl text-red-300"
                  >
                    ⚙️
                  </button>
                )}
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="p-2 bg-zinc-800/60 border border-zinc-700 rounded-xl text-zinc-300"
                >
                  🎨
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-zinc-800/60 border border-zinc-700 rounded-xl text-zinc-300"
                >
                  🚪
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Credits Pill - Clean Dark Mode */}
            <div className="bg-black/40 backdrop-blur-md rounded-full px-5 py-2 border border-white/5 w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-4">
                {!creditsLoading ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💎</span>
                    <div className="flex flex-col">
                      <span className="text-white font-bold text-base leading-none">
                        {userCredits}
                      </span>
                      <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">
                        Credits
                      </span>
                    </div>
                  </div>
                ) : (
                  <LoadingSpinner size="sm" />
                )}
              </div>
            </div>
            {!isMobile && (
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    onClick={() => navigate("/admin")}
                    className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                  >
                    Admin
                  </button>
                )}
                {isCommercial ? (
                  <a
                    href={creditLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors flex items-center gap-2"
                  >
                    {creditBtnText}
                  </a>
                ) : (
                  <button
                    onClick={handleRequestCredits}
                    disabled={isRequesting}
                    className="px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors"
                  >
                    {isRequesting ? "Sending..." : "Request Credit"}
                  </button>
                )}
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  Edit Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="flex-1">
            {/* ✅ MAIN CREATION CARD - GLASS DARK */}
            <div className="bg-black/20 backdrop-blur-xl rounded-3xl border border-white/5 p-4 sm:p-6 lg:p-8 shadow-2xl relative overflow-hidden">
              {/* Subtle top Glow based on Theme */}
              <div
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-1 bg-${
                  currentVisualTab === "picdrift"
                    ? "rose"
                    : currentVisualTab === "studio"
                      ? "violet"
                      : "cyan"
                }-500/30 blur-xl`}
              ></div>

              <div className="mb-6 sm:mb-8 flex justify-between items-start relative z-10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 sm:h-14 flex items-center justify-center">
                      <img
                        src={currentLogo}
                        alt="LOGO"
                        className="h-full w-auto object-contain drop-shadow-lg"
                      />
                    </div>
                  </div>
                  <p className="text-zinc-400 text-sm ml-1 font-medium tracking-wide">
                    {currentHeaderText}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveLibrarySlot(
                      currentVisualTab === "picdrift" ? "start" : "generic",
                    );
                  }}
                  className={`text-xs px-4 py-2.5 rounded-lg border flex items-center gap-2 transition-all font-semibold shadow-lg ${
                    theme.border
                  } bg-black/40 hover:bg-white/5 text-zinc-200`}
                >
                  <span>📂</span> Open Library
                </button>
              </div>

              {/* ✅ NAVIGATION BAR - High Quality Cards */}
              <div className="mb-6 sm:mb-8 relative z-10">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
                  Select Engine
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* TAB 1: PICDRIFT */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveEngine("kie");
                      setVideoFxMode("picdrift");
                    }}
                    className={`p-4 rounded-xl border transition-all duration-300 text-left group relative overflow-hidden ${
                      currentVisualTab === "picdrift"
                        ? "border-rose-500/50 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.1)]"
                        : "border-white/5 bg-zinc-900/50 hover:bg-zinc-800 hover:border-white/10"
                    }`}
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      <span className="text-xl group-hover:scale-110 transition-transform duration-300">
                        ✨
                      </span>
                      <div className="flex-1">
                        <div
                          className={`font-bold text-sm ${
                            currentVisualTab === "picdrift"
                              ? "text-white"
                              : "text-zinc-400 group-hover:text-zinc-200"
                          }`}
                        >
                          PicDrift
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* TAB 2: PIC FX */}
                  <button
                    type="button"
                    onClick={() => setActiveEngine("studio")}
                    className={`p-4 rounded-xl border transition-all duration-300 text-left group relative overflow-hidden ${
                      currentVisualTab === "studio"
                        ? "border-violet-500/50 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,0.1)]"
                        : "border-white/5 bg-zinc-900/50 hover:bg-zinc-800 hover:border-white/10"
                    }`}
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      <span className="text-xl group-hover:scale-110 transition-transform duration-300">
                        🎨
                      </span>
                      <div className="flex-1">
                        <div
                          className={`font-bold text-sm ${
                            currentVisualTab === "studio"
                              ? "text-white"
                              : "text-zinc-400 group-hover:text-zinc-200"
                          }`}
                        >
                          Pic FX
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* TAB 3: VIDEO FX */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveEngine("kie");
                      setVideoFxMode("video");
                    }}
                    className={`p-4 rounded-xl border transition-all duration-300 text-left group relative overflow-hidden ${
                      currentVisualTab === "videofx"
                        ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_30px_rgba(6,182,212,0.1)]"
                        : "border-white/5 bg-zinc-900/50 hover:bg-zinc-800 hover:border-white/10"
                    }`}
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      <span className="text-xl group-hover:scale-110 transition-transform duration-300">
                        🎥
                      </span>
                      <div className="flex-1">
                        <div
                          className={`font-bold text-sm ${
                            currentVisualTab === "videofx"
                              ? "text-white"
                              : "text-zinc-400 group-hover:text-zinc-200"
                          }`}
                        >
                          Video FX
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* SETTINGS PANEL (Darker, Integrated) */}
              <div className="relative z-10">
                {/* STUDIO SUB-MENU */}
                {currentVisualTab === "studio" && (
                  <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                    <div className="flex bg-black/40 p-1 rounded-lg max-w-sm border border-white/5 mb-4">
                      {["image", "carousel", "edit"].map((m) => (
                        <button
                          key={m}
                          onClick={() => setStudioMode(m as StudioMode)}
                          className={`flex-1 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide rounded-md transition-all ${
                            studioMode === m
                              ? "bg-violet-600 text-white shadow-lg"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {studioMode !== "edit" && (
                      <div className="flex gap-3">
                        {[
                          { id: "16:9", label: "Landscape" },
                          { id: "9:16", label: "Portrait" },
                          { id: "1:1", label: "Square" },
                        ].map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setGeminiAspect(a.id as any)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              geminiAspect === a.id
                                ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600"
                            }`}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* VIDEO FX SUB-MENU */}
                {currentVisualTab === "videofx" && (
                  <div className="mb-6 animate-in fade-in space-y-4">
                    <div className="flex bg-black/40 p-1 rounded-lg max-w-sm border border-white/5">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveEngine("kie");
                          setVideoFxMode("video");
                        }}
                        className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${
                          activeEngine === "kie"
                            ? "bg-cyan-600 text-white shadow-lg"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Gen-1
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveEngine("openai")}
                        className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${
                          activeEngine === "openai"
                            ? "bg-cyan-600 text-white shadow-lg"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Gen-2
                      </button>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSubmit}
                  className="space-y-4 sm:space-y-6"
                >
                  {/* MAGIC EDIT UI */}
                  {currentVisualTab === "studio" && studioMode === "edit" ? (
                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center space-y-5 animate-in fade-in">
                      <div className="w-16 h-16 bg-violet-500/10 rounded-full flex items-center justify-center mx-auto border border-violet-500/20">
                        <span className="text-3xl">🪄</span>
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-xl mb-1">
                          Picture Editor
                        </h3>
                        <p className="text-zinc-500 text-sm max-w-md mx-auto">
                          Upload an image to start a chat session. Change
                          lighting, add objects, or completely style-transfer.
                        </p>
                      </div>
                      <label className="block w-full max-w-sm mx-auto cursor-pointer group">
                        <div className="w-full py-3 bg-violet-600 rounded-lg text-white font-bold text-sm group-hover:bg-violet-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-900/20">
                          <span>📤 Upload to Start</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleMagicEditUpload}
                        />
                      </label>
                      <p className="text-[10px] text-zinc-600">
                        Or select from{" "}
                        <button
                          type="button"
                          onClick={() => setActiveLibrarySlot("generic")}
                          className="underline text-violet-400 hover:text-violet-300"
                        >
                          Asset Library
                        </button>
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* PICDRIFT FRAMES */}
                      {currentVisualTab === "picdrift" && (
                        <div className="grid grid-cols-2 gap-4 mb-4 animate-in fade-in">
                          {/* Start Frame */}
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">
                                Start Frame
                              </label>
                            </div>
                            <div className="relative aspect-video bg-black/40 border border-dashed border-rose-500/30 rounded-xl overflow-hidden hover:border-rose-500/60 transition-colors group">
                              {picDriftUrls.start ? (
                                <>
                                  <img
                                    src={picDriftUrls.start}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removePicDriftImage("start")}
                                    className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full text-xs hover:bg-red-600"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                  <label className="flex flex-col items-center justify-center cursor-pointer">
                                    <span className="text-rose-500/50 text-2xl group-hover:text-rose-400 transition-colors">
                                      +
                                    </span>
                                    <span className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                                      Upload
                                    </span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) =>
                                        handlePicDriftUpload(e, "start")
                                      }
                                    />
                                  </label>
                                  <div className="text-zinc-700 text-[9px] font-bold">
                                    OR
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActiveLibrarySlot("start")
                                    }
                                    className="text-[10px] bg-zinc-800 text-zinc-400 px-3 py-1 rounded hover:text-white transition-colors"
                                  >
                                    Library
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* End Frame */}
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                End Frame (Optional)
                              </label>
                            </div>
                            <div className="relative aspect-video bg-black/40 border border-dashed border-zinc-700 rounded-xl overflow-hidden hover:border-rose-500/30 transition-colors group">
                              {picDriftUrls.end ? (
                                <>
                                  <img
                                    src={picDriftUrls.end}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removePicDriftImage("end")}
                                    className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full text-xs hover:bg-red-600"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                  <label className="flex flex-col items-center justify-center cursor-pointer">
                                    <span className="text-zinc-600 text-2xl group-hover:text-rose-500/50 transition-colors">
                                      +
                                    </span>
                                    <span className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                                      Upload
                                    </span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) =>
                                        handlePicDriftUpload(e, "end")
                                      }
                                    />
                                  </label>
                                  <div className="text-zinc-700 text-[9px] font-bold">
                                    OR
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setActiveLibrarySlot("end")}
                                    className="text-[10px] bg-zinc-800 text-zinc-400 px-3 py-1 rounded hover:text-white transition-colors"
                                  >
                                    Library
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PROMPT & TITLE */}
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                          Description
                        </label>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="Describe your creative vision..."
                          className={`w-full p-4 bg-black/30 border border-white/5 rounded-xl ${theme.ring} focus:outline-none focus:border-transparent transition-all resize-none text-white placeholder-zinc-600 text-sm leading-relaxed shadow-inner`}
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                          Project Title
                        </label>
                        <input
                          type="text"
                          value={videoTitle}
                          onChange={(e) => setVideoTitle(e.target.value)}
                          placeholder="Name your creation..."
                          className={`w-full p-3 bg-black/30 border border-white/5 rounded-xl ${theme.ring} focus:outline-none focus:border-transparent text-white placeholder-zinc-600 text-sm shadow-inner`}
                        />
                      </div>

                      {/* SETTINGS (Re-Styled) */}
                      {currentVisualTab === "videofx" &&
                        activeEngine === "kie" && (
                          <div className="space-y-4 animate-in fade-in">
                            {/* Model */}
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                                Model
                              </label>
                              <div className="flex gap-2">
                                {[
                                  { id: "kie-sora-2", label: "Standard" },
                                  { id: "kie-sora-2-pro", label: "Pro" },
                                ].map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setKieModel(m.id as any)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                      kieModel === m.id
                                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Params */}
                            <div className="grid grid-cols-2 gap-3">
                              {/* Duration */}
                              <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                                  Duration
                                </label>
                                <div className="flex gap-2">
                                  {[10, 15].map((d) => (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={() => setKieDuration(d as any)}
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                        kieDuration === d
                                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                      }`}
                                    >
                                      {d}s
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Aspect */}
                              <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                                  Aspect Ratio
                                </label>
                                <div className="flex gap-2">
                                  {[
                                    { id: "landscape", label: "16:9" },
                                    { id: "portrait", label: "9:16" },
                                  ].map((a) => (
                                    <button
                                      key={a.id}
                                      type="button"
                                      onClick={() => setKieAspect(a.id as any)}
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                        kieAspect === a.id
                                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                      }`}
                                    >
                                      {a.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Quality */}
                              <div className="col-span-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
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
                                      onClick={() =>
                                        setKieResolution(r.id as any)
                                      }
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                        kieResolution === r.id
                                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
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

                      {/* PICDRIFT SETTINGS */}
                      {currentVisualTab === "picdrift" && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                              Duration
                            </label>
                            <div className="flex gap-2">
                              {[5, 10].map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setKieDuration(d as any)}
                                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                    kieDuration === d
                                      ? "bg-rose-500/20 border-rose-500/50 text-rose-200"
                                      : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                  }`}
                                >
                                  {d}s
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                              Ratio
                            </label>
                            <div className="flex gap-2">
                              {[
                                { id: "landscape", label: "16:9" },
                                { id: "portrait", label: "9:16" },
                                { id: "square", label: "1:1" },
                              ].map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => setKieAspect(a.id as any)}
                                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                    kieAspect === a.id
                                      ? "bg-rose-500/20 border-rose-500/50 text-rose-200"
                                      : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                  }`}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* OPENAI SETTINGS */}
                      {currentVisualTab === "videofx" &&
                        activeEngine === "openai" && (
                          <div className="space-y-4 animate-in fade-in">
                            {/* Model */}
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                                Model
                              </label>
                              <div className="flex gap-2">
                                {[
                                  { id: "sora-2", label: "Standard" },
                                  { id: "sora-2-pro", label: "Pro" },
                                ].map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setVideoModel(m.id as any)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                      videoModel === m.id
                                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Params */}
                            <div className="grid grid-cols-2 gap-3">
                              {/* Ratio */}
                              <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                                  Ratio
                                </label>
                                <div className="flex gap-2">
                                  {[
                                    { ratio: "16:9", label: "16:9" },
                                    { ratio: "9:16", label: "9:16" },
                                  ].map(({ ratio, label }) => (
                                    <button
                                      key={ratio}
                                      type="button"
                                      onClick={() => {
                                        setAspectRatio(ratio as any);
                                        setVideoSize(
                                          ratio === "16:9"
                                            ? "1792x1024"
                                            : "1024x1792",
                                        );
                                      }}
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                        aspectRatio === ratio
                                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Duration */}
                              <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                                  Duration
                                </label>
                                <div className="flex gap-2">
                                  {[4, 8, 12].map((sec) => (
                                    <button
                                      key={sec}
                                      type="button"
                                      onClick={() =>
                                        setVideoDuration(sec as any)
                                      }
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                        videoDuration === sec
                                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                      }`}
                                    >
                                      {sec}s
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Video Size (Full Width) */}
                              <div className="col-span-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                                  Size
                                </label>
                                <div className="flex gap-2">
                                  {(aspectRatio === "16:9"
                                    ? [
                                        { size: "1280x720", label: "720p HD" },
                                        ...(videoModel === "sora-2-pro"
                                          ? [
                                              {
                                                size: "1792x1024",
                                                label: "1080p",
                                              },
                                            ]
                                          : []),
                                      ]
                                    : [
                                        { size: "720x1280", label: "720p HD" },
                                        ...(videoModel === "sora-2-pro"
                                          ? [
                                              {
                                                size: "1024x1792",
                                                label: "1080p",
                                              },
                                            ]
                                          : []),
                                      ]
                                  ).map(({ size, label }) => (
                                    <button
                                      key={size}
                                      type="button"
                                      onClick={() => setVideoSize(size as any)}
                                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                        videoSize === size
                                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* 4. REFERENCE IMAGES */}
                      {activeEngine !== "kie" || videoFxMode !== "picdrift" ? (
                        <div className="space-y-2 sm:space-y-3 pt-4 border-t border-white/5">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                              Reference Images
                            </label>
                          </div>
                          <div className="space-y-3">
                            <div className="w-full h-20 border border-dashed border-zinc-700 bg-black/30 rounded-xl hover:border-white/20 transition-all group relative flex items-center justify-center">
                              <div className="flex items-center gap-6">
                                <label className="cursor-pointer flex flex-col items-center group-hover:scale-105 transition-transform">
                                  <span className="text-xl mb-1 text-zinc-500 group-hover:text-white">
                                    📂
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-white">
                                    Upload
                                  </span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    multiple={
                                      activeEngine === "studio" &&
                                      studioMode === "carousel"
                                    }
                                    accept="image/*"
                                    onChange={handleGenericUpload}
                                  />
                                </label>
                                <div className="h-8 w-px bg-zinc-800"></div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveLibrarySlot("generic")
                                  }
                                  className="flex flex-col items-center group-hover:scale-105 transition-transform"
                                >
                                  <span className="text-xl mb-1 text-zinc-500 group-hover:text-white">
                                    📚
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-white">
                                    Library
                                  </span>
                                </button>
                              </div>
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
                                      className="w-full h-full object-cover rounded-lg border border-white/20"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeGenericImage(index)}
                                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {/* ✅ THEMED GENERATE BUTTON */}
                      <button
                        type="submit"
                        disabled={
                          generateMediaMutation.isPending || !prompt.trim()
                        }
                        className={`w-full py-4 sm:py-5 px-6 sm:px-8 rounded-2xl hover:shadow-2xl disabled:opacity-50 font-bold text-base sm:text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] bg-gradient-to-r ${theme.gradient} text-white shadow-lg ${theme.glow}`}
                      >
                        {generateMediaMutation.isPending ? (
                          <>
                            <LoadingSpinner size="sm" variant="light" />
                            <span>
                              {currentVisualTab === "picdrift"
                                ? "Generating Drift"
                                : currentVisualTab === "studio"
                                  ? "Painting Your Image"
                                  : "Creating Your Video"}
                              ...
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xl">✨</span>
                            <span>
                              {currentVisualTab === "picdrift"
                                ? "Generate PicDrift"
                                : currentVisualTab === "studio"
                                  ? "Generate Image"
                                  : "Generate Video"}
                            </span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </form>

                {generationState.status === "error" && (
                  <div className="mt-4">
                    <ErrorAlert
                      message={generationState.error || "Generation failed"}
                      onRetry={() => {
                        if (!prompt.trim()) return;
                        generateMediaMutation.mutate(buildFormData());
                      }}
                      type="error"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:w-96">
            <div className="bg-black/20 backdrop-blur-xl rounded-3xl border border-white/5 p-4 sm:p-6 shadow-2xl sticky top-4">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>Timeline</span>
                </h2>
                <button
                  onClick={() => setShowFullTimeline(true)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                  title="Expand Timeline"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
                {postsLoading && <LoadingSpinner size="sm" variant="neon" />}
              </div>
              <div className="space-y-3 max-h-[500px] sm:max-h-[600px] overflow-y-auto custom-scrollbar">
                {posts && Array.isArray(posts) && posts.length > 0 ? (
                  posts
                    .filter((post: any) => post.status !== "CANCELLED")
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    )
                    .map((post: any) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onPublishPost={() => handleShowPromptInfo(post.prompt)}
                        userCredits={userCredits}
                        publishingPost={null}
                        primaryColor={brandConfig?.primaryColor}
                        compact={true}
                        onUseAsStartFrame={handleUseAsStartFrame}
                        onDrift={() => handleDriftFromPost(post)}
                        onPreview={() => {
                          let type = "image";
                          if (post.mediaType === "VIDEO") type = "video";
                          if (post.mediaType === "CAROUSEL") type = "carousel";
                          let url = post.mediaUrl;
                          if (type === "carousel") {
                            try {
                              url = JSON.parse(post.mediaUrl);
                            } catch (e) {}
                          }
                          setPreviewMedia({ type: type as any, url });
                        }}
                        onMoveToAsset={
                          post.mediaType === "IMAGE" ||
                          post.mediaType === "CAROUSEL"
                            ? () => handleMoveToAssets(post.id)
                            : undefined
                        }
                        onDelete={() => {
                          if (
                            confirm(
                              "Are you sure you want to delete this post?",
                            )
                          ) {
                            deletePostMutation.mutate(post.id);
                          }
                        }}
                      />
                    ))
                ) : !postsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-zinc-600 text-sm mb-3">
                      No content yet
                    </div>
                    <div className="text-4xl grayscale opacity-50">✨</div>
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
        {/* ... Extra Modals (Kept Same) ... */}
        {showBrandModal && (
          <BrandConfigModal
            onClose={() => setShowBrandModal(false)}
            currentConfig={brandConfig}
          />
        )}
        {editingAsset && (
          <EditAssetModal
            asset={editingAsset}
            initialVideoUrl={editingVideoUrl}
            onClose={() => {
              setEditingAsset(null);
              setEditingVideoUrl(undefined); // Reset
            }}
          />
        )}
        {showFullTimeline && (
          <TimelineExpander
            posts={posts}
            onClose={() => setShowFullTimeline(false)}
            userCredits={userCredits}
            brandConfig={brandConfig}
            onPublishPost={(t) => handleShowPromptInfo(t)}
            onUseAsStartFrame={handleUseAsStartFrame}
            onDrift={(p) => handleDriftFromPost(p)}
            onPreview={(media) => {
              let type = "image";
              if (media.mediaType === "VIDEO") type = "video";
              if (media.mediaType === "CAROUSEL") type = "carousel";
              let url = media.mediaUrl;
              if (type === "carousel") {
                try {
                  url = JSON.parse(media.mediaUrl);
                } catch (e) {}
              }
              setPreviewMedia({ type: type as any, url });
            }}
            onMoveToAsset={(id) => handleMoveToAssets(id)}
            onDelete={(id) => {
              if (confirm("Delete this post?")) deletePostMutation.mutate(id);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard;
