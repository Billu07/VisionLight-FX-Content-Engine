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

// === CONFIGURATION ===
const ADMIN_EMAILS = ["snowfix07@gmail.com", "keith@picdrift.com"];

type EngineType = "kie" | "studio" | "openai";
type StudioMode = "image" | "carousel" | "edit";

// Visual Tab Type
type VisualTab = "picdrift" | "studio" | "videofx";

interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  result?: any;
  error?: string;
}

/**
 * Premium Dashboard Component
 * Redesigned for visual consistency, premium feel, and soothing aesthetics.
 * Preserves all original logic and functionality.
 */
function Dashboard() {
  // ==========================================
  // STATE (Preserved)
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
  const [kieDuration, setKieDuration] = useState<5 | 10 | 15>(5);
  const [kieResolution] = useState<"720p" | "1080p">("720p");
  const [kieAspect, setKieAspect] = useState<
    "landscape" | "portrait" | "square"
  >("portrait");
  const [kieModel, setKieModel] = useState<"kie-sora-2" | "kie-sora-2-pro">(
    "kie-sora-2"
  );

  // Video FX Sub-mode (Video vs PicDrift)
  const [videoFxMode, setVideoFxMode] = useState<"video" | "picdrift">(
    "picdrift"
  );

  // OpenAI (Video FX 2)
  const [videoDuration] = useState<4 | 8 | 12>(4);
  const [videoModel] = useState<"sora-2" | "sora-2-pro">("sora-2-pro");
  const [aspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoSize] = useState<
    "1280x720" | "1792x1024" | "720x1280" | "1024x1792"
  >("1792x1024");

  // Studio (Gemini) Aspect Ratio
  const [geminiAspect] = useState<"1:1" | "16:9" | "9:16">("9:16");

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
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  // === NEW PREVIEW STATE ===
  const [previewMedia, setPreviewMedia] = useState<{
    type: "image" | "video" | "carousel";
    url: string | string[];
  } | null>(null);
  const [previewCarouselIndex, setPreviewCarouselIndex] = useState(0);

  // State for Magic Edit Asset
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [editingVideoUrl, setEditingVideoUrl] = useState<string | undefined>(
    undefined
  );

  // New State for Extraction (Timeline Scissors)
  const [extractingVideoUrl, setExtractingVideoUrl] = useState<string | null>(
    null
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

  // ==========================================
  // LOGIC & HANDLERS (Preserved)
  // ==========================================

  const handleDriftFromPost = (post: any) => {
    setExtractingVideoUrl(post.mediaUrl);
  };

  useEffect(() => {
    setReferenceImages([]);
    setReferenceImageUrls([]);
    setPicDriftFrames({ start: null, end: null });
    setPicDriftUrls({ start: null, end: null });
  }, [activeEngine, studioMode, videoFxMode]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && !localStorage.getItem("visionlight_welcome_shown")) {
      setShowWelcomeTour(true);
      localStorage.setItem("visionlight_welcome_shown", "true");
    }
  }, [user]);

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
          (p.progress || 0) < 100
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
        (p: any) => p.status === "PROCESSING" || p.status === "NEW"
      );
      if (hasActive) {
        await apiEndpoints.checkActiveJobs();
      }
      return true;
    },
    refetchInterval: () => {
      const hasActive = posts.some(
        (p: any) => p.status === "PROCESSING" || p.status === "NEW"
      );
      return hasActive ? 5000 : false;
    },
    enabled: !!user && posts.length > 0,
  });

  const isCommercial = user?.creditSystem !== "INTERNAL";
  const creditLink = isCommercial
    ? "https://www.picdrift.com/fx-credits"
    : "https://www.picdrift.com/fx-request";
  const creditBtnText = isCommercial ? "Buy Credits" : "Request Credits";
  const isAdmin =
    user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

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

  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => apiEndpoints.deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleUseAsStartFrame = (mediaUrl: string) => {
    setVideoFxMode("picdrift");
    setActiveEngine("kie");
    setPicDriftUrls((prev) => ({ ...prev, start: mediaUrl }));
    setPicDriftFrames((prev) => ({ ...prev, start: null }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAssetSelect = (asset: any) => {
    if (activeLibrarySlot === "start") {
      setPicDriftUrls((prev) => ({ ...prev, start: asset.mediaUrl }));
      setPicDriftFrames((prev) => ({ ...prev, start: null }));
    } else if (activeLibrarySlot === "end") {
      setPicDriftUrls((prev) => ({ ...prev, end: asset.mediaUrl }));
      setPicDriftFrames((prev) => ({ ...prev, end: null }));
    } else if (activeLibrarySlot === "generic") {
      setReferenceImageUrls((prev) => [...prev, asset.mediaUrl]);
      setReferenceImages((prev) => [...prev, null as any]);
    }
    setActiveLibrarySlot(null);
  };

  const handlePicDriftUpload = (slot: "start" | "end", file: File) => {
    setPicDriftFrames((prev) => ({ ...prev, [slot]: file }));
    setPicDriftUrls((prev) => ({ ...prev, [slot]: URL.createObjectURL(file) }));
  };

  const handleGenericUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setReferenceImages((prev) => [...prev, ...files]);
    setReferenceImageUrls((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
  };

  const removePicDriftImage = (slot: "start" | "end") => {
    setPicDriftFrames((prev) => ({ ...prev, [slot]: null }));
    setPicDriftUrls((prev) => ({ ...prev, [slot]: null }));
  };

  const removeGenericImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
    setReferenceImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("title", videoTitle || "Untitled Creation");
    formData.append("engine", activeEngine);

    if (activeEngine === "kie") {
      formData.append("mode", videoFxMode);
      formData.append("duration", String(kieDuration));
      formData.append("resolution", kieResolution);
      formData.append("aspectRatio", kieAspect);
      formData.append("model", kieModel);

      if (videoFxMode === "picdrift") {
        if (picDriftFrames.start)
          formData.append("startFrame", picDriftFrames.start);
        else if (picDriftUrls.start)
          formData.append("startFrameUrl", picDriftUrls.start);

        if (picDriftFrames.end) formData.append("endFrame", picDriftFrames.end);
        else if (picDriftUrls.end)
          formData.append("endFrameUrl", picDriftUrls.end);
      } else {
        if (referenceImages[0]) formData.append("image", referenceImages[0]);
        else if (referenceImageUrls[0])
          formData.append("imageUrl", referenceImageUrls[0]);
      }
    } else if (activeEngine === "studio") {
      formData.append("mode", studioMode);
      formData.append("aspectRatio", geminiAspect);
      referenceImages.forEach((file) => {
        if (file) formData.append("images", file);
      });
      referenceImageUrls.forEach((url, idx) => {
        if (!referenceImages[idx]) formData.append("imageUrls", url);
      });
    } else if (activeEngine === "openai") {
      formData.append("duration", String(videoDuration));
      formData.append("model", videoModel);
      formData.append("aspectRatio", aspectRatio);
      formData.append("size", videoSize);
      if (referenceImages[0]) formData.append("image", referenceImages[0]);
      else if (referenceImageUrls[0])
        formData.append("imageUrl", referenceImageUrls[0]);
    }

    return formData;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setGenerationState({ status: "generating" });
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
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
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

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 selection:bg-indigo-500/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      {/* MODALS (Preserved) */}
      {activeLibrarySlot !== null && (
        <AssetLibrary
          onClose={() => setActiveLibrarySlot(null)}
          onSelect={handleAssetSelect}
          initialAspectRatio={getCurrentRatioForLibrary()}
        />
      )}

      {extractingVideoUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121216] border border-white/10 rounded-3xl w-full max-w-4xl p-8 relative shadow-2xl">
            <button
              onClick={() => setExtractingVideoUrl(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-indigo-400">✂️</span> Extract Frame from
              Video
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

      {previewMedia && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 animate-in fade-in duration-300"
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
                  className="max-h-[80vh] w-auto rounded-2xl shadow-2xl border border-white/10"
                />
                {previewMedia.url.length > 1 && (
                  <div className="flex gap-3 mt-6">
                    {previewMedia.url.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewCarouselIndex(idx)}
                        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                          idx === previewCarouselIndex
                            ? "bg-indigo-500 w-8"
                            : "bg-white/20 hover:bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="max-w-full max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
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
              className="absolute -top-14 right-0 text-white/60 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <span>Close</span>
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                ✕
              </div>
            </button>
          </div>
        </div>
      )}

      {showQueuedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-[#121216] border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🚀</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">
              Generation Started!
            </h3>
            <p className="text-slate-400 mb-8 leading-relaxed">
              Your content is being processed. You can track its progress in the
              timeline.
            </p>
            <button
              onClick={() => setShowQueuedModal(false)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showNoCreditsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-[#121216] border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
            <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">💎</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">
              Insufficient Credits
            </h3>
            <p className="text-slate-400 mb-8 leading-relaxed">
              You don't have enough credits to start this generation. Please top
              up to continue.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href={creditLink}
                target="_blank"
                rel="noreferrer"
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all text-center"
              >
                {creditBtnText}
              </a>
              <button
                onClick={() => setShowNoCreditsModal(false)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {showPromptInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-[#121216] border border-white/10 p-8 rounded-3xl max-w-2xl w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">
              Prompt Details
            </h3>
            <div className="bg-black/40 p-6 rounded-2xl text-slate-300 text-sm mb-6 max-h-80 overflow-y-auto leading-relaxed border border-white/5">
              {showPromptInfo}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(showPromptInfo);
                  setShowPromptInfo(null);
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-sm font-bold transition-all"
              >
                Copy Prompt
              </button>
              <button
                onClick={() => setShowPromptInfo(null)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-white text-sm font-bold transition-all"
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

      {/* MAIN CONTENT */}
      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
        {/* HEADER */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-2xl font-bold text-white">V</span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {companyName}
              </h1>
              <p className="text-slate-400 text-sm font-medium">
                Content Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-2.5 flex items-center gap-4">
              {!creditsLoading ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-lg">💎</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-bold text-base leading-none">
                      {userCredits}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">
                      Credits
                    </span>
                  </div>
                </div>
              ) : (
                <LoadingSpinner size="sm" />
              )}
              <div className="w-px h-8 bg-white/10" />
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    onClick={() => navigate("/admin")}
                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                    title="Admin Panel"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setShowBrandModal(true)}
                  className="p-2 text-slate-400 hover:text-indigo-400 transition-colors"
                  title="Dashboard Settings"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Logout"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <a
              href={creditLink}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
            >
              {creditBtnText}
            </a>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* GENERATOR PANEL */}
          <div className="flex-1">
            <div className="bg-[#121216]/60 backdrop-blur-xl rounded-[32px] border border-white/10 p-6 md:p-10 shadow-2xl">
              {/* BRANDING & LIBRARY */}
              <div className="mb-10 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="h-10 flex items-center">
                    <img
                      src={picdriftLogo}
                      alt="PICDRIFT"
                      className="h-full w-auto object-contain opacity-90"
                    />
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <p className="text-slate-400 text-sm font-medium tracking-wide">
                    Create Something Cinematic
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setActiveLibrarySlot(
                      currentVisualTab === "picdrift" ? "start" : "generic"
                    )
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all"
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
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                    />
                  </svg>
                  Asset Library
                </button>
              </div>

              {/* ENGINE NAVIGATION */}
              <div className="mb-10">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 ml-1">
                  Select Content Engine
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: "picdrift",
                      label: "PicDrift",
                      icon: "✨",
                      color: "from-rose-500 to-pink-600",
                      active: currentVisualTab === "picdrift",
                    },
                    {
                      id: "studio",
                      label: "Pic FX",
                      icon: "🎨",
                      color: "from-violet-500 to-purple-600",
                      active: currentVisualTab === "studio",
                    },
                    {
                      id: "videofx",
                      label: "Video FX",
                      icon: "🎬",
                      color: "from-blue-500 to-indigo-600",
                      active: currentVisualTab === "videofx",
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        if (tab.id === "picdrift") {
                          setActiveEngine("kie");
                          setVideoFxMode("picdrift");
                        } else if (tab.id === "studio") {
                          setActiveEngine("studio");
                        } else {
                          setActiveEngine("kie");
                          setVideoFxMode("video");
                        }
                      }}
                      className={`relative p-5 rounded-2xl border-2 transition-all duration-500 text-left group overflow-hidden ${
                        tab.active
                          ? `border-transparent bg-gradient-to-br ${tab.color} shadow-xl scale-[1.02]`
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10"
                      }`}
                    >
                      <div className="relative z-10 flex items-center justify-between">
                        <div>
                          <span
                            className={`text-xl mb-1 block ${
                              tab.active ? "opacity-100" : "opacity-50"
                            }`}
                          >
                            {tab.icon}
                          </span>
                          <div
                            className={`font-bold text-sm ${
                              tab.active ? "text-white" : "text-slate-400"
                            }`}
                          >
                            {tab.label}
                          </div>
                        </div>
                        {tab.active && (
                          <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-pulse" />
                        )}
                      </div>
                      {tab.active && (
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* FORM */}
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* PICDRIFT SPECIFIC: START/END FRAMES */}
                {currentVisualTab === "picdrift" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {[
                      {
                        slot: "start" as const,
                        label: "Start Frame",
                        url: picDriftUrls.start,
                      },
                      {
                        slot: "end" as const,
                        label: "End Frame",
                        url: picDriftUrls.end,
                      },
                    ].map((item) => (
                      <div key={item.slot} className="space-y-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                          {item.label}
                        </label>
                        <div className="relative aspect-video bg-black/40 rounded-2xl border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/[0.02] transition-all group overflow-hidden">
                          {item.url ? (
                            <>
                              <img
                                src={item.url}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => removePicDriftImage(item.slot)}
                                  className="p-3 bg-red-500/20 hover:bg-red-500 text-white rounded-xl transition-all"
                                >
                                  <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <svg
                                  className="w-6 h-6 text-slate-500"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                              </div>
                              <div className="flex gap-4">
                                <label className="cursor-pointer text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                                  Upload
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) =>
                                      e.target.files?.[0] &&
                                      handlePicDriftUpload(
                                        item.slot,
                                        e.target.files[0]
                                      )
                                    }
                                  />
                                </label>
                                <span className="text-slate-600 text-xs">
                                  •
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveLibrarySlot(item.slot)
                                  }
                                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                  Library
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* STUDIO SPECIFIC: MODES */}
                {currentVisualTab === "studio" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                      Studio Mode
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "image", label: "Single Image", icon: "🖼️" },
                        { id: "carousel", label: "Carousel", icon: "🎠" },
                        { id: "edit", label: "Magic Edit", icon: "🪄" },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setStudioMode(mode.id as any)}
                          className={`px-6 py-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center gap-2 ${
                            studioMode === mode.id
                              ? "bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                              : "bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10"
                          }`}
                        >
                          <span>{mode.icon}</span>
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* PROMPT & TITLE */}
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                      Describe your vision
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="A cinematic shot of a futuristic city at sunset, neon lights reflecting on wet pavement..."
                      className="w-full p-6 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all resize-none text-white placeholder-slate-600 text-base leading-relaxed"
                      rows={4}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                      Creation Title
                    </label>
                    <input
                      type="text"
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      placeholder="Name your masterpiece..."
                      className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent text-white placeholder-slate-600 font-medium"
                    />
                  </div>
                </div>

                {/* SETTINGS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
                  {/* DYNAMIC SETTINGS BASED ON TAB */}
                  {currentVisualTab === "videofx" && activeEngine === "kie" && (
                    <>
                      <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                          AI Model
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: "kie-sora-2", label: "Standard" },
                            { id: "kie-sora-2-pro", label: "Pro" },
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setKieModel(m.id as any)}
                              className={`p-3 rounded-xl border-2 text-center text-sm font-bold transition-all ${
                                kieModel === m.id
                                  ? "bg-indigo-600/20 border-indigo-500 text-white"
                                  : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                          Duration
                        </label>
                        <div className="flex gap-2">
                          {[10, 15].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setKieDuration(d as any)}
                              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                kieDuration === d
                                  ? "bg-indigo-600/20 border-indigo-500 text-white"
                                  : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                              }`}
                            >
                              {d}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {currentVisualTab === "picdrift" && (
                    <>
                      <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                          Duration
                        </label>
                        <div className="flex gap-2">
                          {[5, 10].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setKieDuration(d as any)}
                              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                kieDuration === d
                                  ? "bg-rose-600/20 border-rose-500 text-white"
                                  : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                              }`}
                            >
                              {d}s
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                          Aspect Ratio
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
                              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                kieAspect === a.id
                                  ? "bg-rose-600/20 border-rose-500 text-white"
                                  : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* REFERENCE IMAGES (Generic) */}
                  {(activeEngine !== "kie" || videoFxMode !== "picdrift") && (
                    <div className="md:col-span-2 space-y-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                        Reference Assets
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="h-32 border-2 border-dashed border-white/10 rounded-2xl hover:border-indigo-500/50 hover:bg-indigo-500/[0.02] transition-all group relative flex items-center justify-center">
                          <div className="flex items-center gap-8">
                            <label className="cursor-pointer flex flex-col items-center group-hover:scale-105 transition-transform">
                              <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mb-2">
                                <svg
                                  className="w-5 h-5 text-slate-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                  />
                                </svg>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
                            <div className="w-px h-10 bg-white/10" />
                            <button
                              type="button"
                              onClick={() => setActiveLibrarySlot("generic")}
                              className="flex flex-col items-center group-hover:scale-105 transition-transform"
                            >
                              <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mb-2">
                                <svg
                                  className="w-5 h-5 text-slate-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                  />
                                </svg>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Library
                              </span>
                            </button>
                          </div>
                        </div>

                        {referenceImageUrls.length > 0 && (
                          <div className="flex flex-wrap gap-3 content-start">
                            {referenceImageUrls.map((url, index) => (
                              <div
                                key={index}
                                className="relative w-20 h-20 group"
                              >
                                <img
                                  src={url}
                                  className="w-full h-full object-cover rounded-xl border border-white/10 shadow-lg"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeGenericImage(index)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={generateMediaMutation.isPending || !prompt.trim()}
                  className={`w-full py-6 rounded-[24px] font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-xl ${
                    generateMediaMutation.isPending || !prompt.trim()
                      ? "bg-white/5 text-slate-600 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 hover:scale-[1.01] active:scale-[0.99]"
                  }`}
                >
                  {generateMediaMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" variant="light" />
                      <span>Processing Vision...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span>
                        {currentVisualTab === "picdrift"
                          ? "Generate PicDrift"
                          : `Generate ${
                              activeEngine === "studio" ? studioMode : "Video"
                            }`}
                      </span>
                    </>
                  )}
                </button>
              </form>

              {generationState.status === "error" && (
                <div className="mt-6">
                  <ErrorAlert
                    message={generationState.error || "Generation failed"}
                    onRetry={() =>
                      prompt.trim() &&
                      generateMediaMutation.mutate(buildFormData())
                    }
                    type="error"
                  />
                </div>
              )}
            </div>
          </div>

          {/* TIMELINE PANEL */}
          <aside className="lg:w-[400px]">
            <div className="bg-[#121216]/60 backdrop-blur-xl rounded-[32px] border border-white/10 p-6 shadow-2xl sticky top-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-white">Timeline</h2>
                </div>

                <div className="flex items-center gap-2">
                  {postsLoading && <LoadingSpinner size="sm" variant="neon" />}
                  <button
                    onClick={() => setShowFullTimeline(true)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-all border border-white/5"
                    title="Expand Timeline"
                  >
                    <svg
                      className="w-5 h-5"
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
                </div>
              </div>

              <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
                {posts && Array.isArray(posts) && posts.length > 0 ? (
                  posts
                    .filter((post: any) => post.status !== "CANCELLED")
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime()
                    )
                    .map((post: any) => (
                      <div
                        key={post.id}
                        className="animate-in fade-in slide-in-from-right-4 duration-500"
                      >
                        <PostCard
                          post={post}
                          onPublishPost={() =>
                            handleShowPromptInfo(post.prompt)
                          }
                          userCredits={userCredits}
                          publishingPost={null}
                          primaryColor={brandConfig?.primaryColor}
                          compact={true}
                          onUseAsStartFrame={handleUseAsStartFrame}
                          onDrift={() => handleDriftFromPost(post)}
                          onPreview={() => {
                            let type = "image";
                            if (post.mediaType === "VIDEO") type = "video";
                            if (post.mediaType === "CAROUSEL")
                              type = "carousel";
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
                          onDelete={() =>
                            confirm(
                              "Are you sure you want to delete this post?"
                            ) && deletePostMutation.mutate(post.id)
                          }
                        />
                      </div>
                    ))
                ) : !postsLoading ? (
                  <div className="text-center py-16 bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
                    <div className="text-4xl mb-4 opacity-20">✨</div>
                    <p className="text-slate-500 text-sm font-medium">
                      No creations yet
                    </p>
                    <p className="text-slate-600 text-xs mt-1">
                      Start generating to see them here
                    </p>
                  </div>
                ) : null}
              </div>

              {postsError && (
                <div className="mt-6">
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
          </aside>
        </div>

        {/* FOOTER MODALS (Preserved) */}
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
              setEditingVideoUrl(undefined);
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
            onDelete={(id) =>
              confirm("Delete this post?") && deletePostMutation.mutate(id)
            }
          />
        )}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

export default Dashboard;
