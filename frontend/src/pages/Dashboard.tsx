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
  const [kieDuration, setKieDuration] = useState<5 | 10 | 15>(5);
  const [kieResolution, setKieResolution] = useState<"720p" | "1080p">("720p");

  // ✅ CHANGED: Added "square" to type and set default to "portrait"
  const [kieAspect, setKieAspect] = useState<
    "landscape" | "portrait" | "square"
  >("portrait");

  const [kieModel, setKieModel] = useState<"kie-sora-2" | "kie-sora-2-pro">(
    "kie-sora-2",
  );

  // Video FX Sub-mode (Video vs PicDrift)
  const [videoFxMode, setVideoFxMode] = useState<"video" | "picdrift">(
    "picdrift",
  );

  // OpenAI (Video FX 2)
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(4);
  const [videoModel, setVideoModel] = useState<"sora-2" | "sora-2-pro">(
    "sora-2-pro",
  );
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoSize, setVideoSize] = useState<
    "1280x720" | "1792x1024" | "720x1280" | "1024x1792"
  >("1792x1024");

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

  // === NEW PREVIEW STATE ===
  const [previewMedia, setPreviewMedia] = useState<{
    type: "image" | "video" | "carousel";
    url: string | string[];
  } | null>(null);
  const [previewCarouselIndex, setPreviewCarouselIndex] = useState(0);

  // State for Magic Edit Asset
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [editingVideoUrl, setEditingVideoUrl] = useState<string | undefined>(
    undefined,
  );

  // New State for Extraction (Timeline Scissors)
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

  // HANDLER: Open Timeline Video in Drift
  const handleDriftFromPost = (post: any) => {
    // If it's a video, open the extractor directly
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

  // @ts-ignore
  const isCommercial = user?.creditSystem !== "INTERNAL";
  const [isRequesting, setIsRequesting] = useState(false);
  const creditLink = isCommercial
    ? "https://www.picdrift.com/fx-credits"
    : "https://www.picdrift.com/fx-request";
  const creditBtnText = isCommercial ? "Buy Credits" : "Request Credits";
  const isAdmin =
    user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

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

  // --- 1. ASSET LIBRARY SELECTION HANDLER ---
  const handleAssetSelect = (file: File, url: string, ratio?: string) => {
    // 1. Handle File Setting (Existing Logic)
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

    // 2. ✅ NEW: Auto-Update Aspect Ratio based on Selection
    if (ratio && ratio !== "original") {
      console.log(`Auto-setting ratio to: ${ratio}`);

      // Determine standardized Ratio ID
      const r = ratio as "16:9" | "9:16" | "1:1";

      // A. KIE / VIDEO FX 1 / PICDRIFT
      if (activeEngine === "kie") {
        if (r === "16:9") setKieAspect("landscape");
        else if (r === "9:16") setKieAspect("portrait");
        else if (r === "1:1") setKieAspect("square");
      }

      // B. OPENAI / VIDEO FX 2
      else if (activeEngine === "openai") {
        // OpenAI typically only supports 16:9 / 9:16 in standard UI, fallback to 1:1 if needed
        if (r === "16:9") {
          setAspectRatio("16:9");
          setVideoSize("1792x1024");
        } else if (r === "9:16") {
          setAspectRatio("9:16");
          setVideoSize("1024x1792");
        }
      }

      // C. STUDIO / GEMINI
      else if (activeEngine === "studio") {
        setGeminiAspect(r);
      }
    }

    setActiveLibrarySlot(null);
  };

  // --- 2. REUSE END FRAME HANDLER ---
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

  // Delete Post Mutation
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (!user) return null;

  // ✅ HELPER: Get currently selected aspect ratio string for context-aware library
  const getCurrentRatioForLibrary = () => {
    if (activeEngine === "kie") return kieAspect; // "portrait", "landscape", "square"
    if (activeEngine === "openai") return aspectRatio; // "16:9", "9:16"
    if (activeEngine === "studio") return geminiAspect; // "1:1", "16:9", "9:16"
    return undefined;
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      {/* ... MODALS ... */}
      {activeLibrarySlot !== null && (
        <AssetLibrary
          onClose={() => setActiveLibrarySlot(null)}
          onSelect={handleAssetSelect}
          initialAspectRatio={getCurrentRatioForLibrary()}
        />
      )}

      {/* EXTRACTOR MODAL */}
      {extractingVideoUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4 animate-in fade-in">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl p-6 relative flex flex-col items-center">
            <button
              onClick={() => setExtractingVideoUrl(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
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
                  className="max-h-[80vh] w-auto rounded-lg shadow-2xl border border-gray-800"
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
      {showNoCreditsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="bg-gray-800 rounded-2xl border border-red-500/30 shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="text-4xl mb-3">💎</div>
            <h3 className="text-xl font-bold text-white mb-2">
              Insufficient Credits
            </h3>
            <p className="text-sm text-gray-300 mb-6">
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
                  {isRequesting ? "Sending..." : "Request Credits"}
                </button>
              )}
              <button
                onClick={() => setShowNoCreditsModal(false)}
                className="text-gray-400 text-sm"
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
            className="bg-gray-800 rounded-2xl border border-gray-600 max-w-md w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-3">
              Generation Prompt
            </h3>
            <div className="bg-gray-900 p-4 rounded-lg text-gray-300 text-sm mb-4 max-h-60 overflow-y-auto">
              {showPromptInfo}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(showPromptInfo);
                  setShowPromptInfo(null);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-sm"
              >
                Copy
              </button>
              <button
                onClick={() => setShowPromptInfo(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
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
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold leading-tight brand-gradient-text">
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
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">💎</span>
                    <div className="flex flex-col">
                      <span className="text-white font-bold text-lg leading-none">
                        {userCredits}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
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
                    className="px-4 py-2.5 bg-red-600/20 border border-red-500/50 rounded-xl text-red-300 text-sm font-bold"
                  >
                    Admin Panel
                  </button>
                )}
                {isCommercial ? (
                  <a
                    href={creditLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 bg-gray-800/60 border border-green-400/30 rounded-xl text-green-400 text-sm hover:bg-green-400/10 flex items-center gap-2"
                  >
                    {creditBtnText}
                  </a>
                ) : (
                  <button
                    onClick={handleRequestCredits}
                    disabled={isRequesting}
                    className="px-4 py-2.5 bg-purple-600/20 border border-purple-500/50 rounded-xl text-purple-300 text-sm"
                  >
                    {isRequesting ? "Sending..." : "Request Credits 🔔"}
                  </button>
                )}
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
          <div className="flex-1">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 lg:p-8 shadow-2xl">
              {/* ✅ UPDATED HEADER: Logo Left, Library Button Right */}
              <div className="mb-6 sm:mb-8 flex justify-between items-start">
                <div>
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

                {/* ✅ GLOBAL OPEN LIBRARY BUTTON */}
                <button
                  type="button"
                  onClick={() => {
                    // For PicDrift, open 'Start Frame' slot. For others, open 'Generic'.
                    setActiveLibrarySlot(
                      currentVisualTab === "picdrift" ? "start" : "generic",
                    );
                  }}
                  className={`text-xs px-4 py-2 rounded-lg border flex items-center gap-2 transition-all font-semibold shadow-lg ${
                    currentVisualTab === "picdrift"
                      ? "bg-rose-900/50 text-rose-300 border-rose-700/50 hover:bg-rose-800 hover:border-rose-500"
                      : "bg-cyan-900/50 text-cyan-300 border-cyan-700/50 hover:bg-cyan-800 hover:border-cyan-500"
                  }`}
                >
                  <span></span> Open Library
                </button>
              </div>

              {/* === MODERN ENGINE SELECTOR === */}
              <div className="mb-6 bg-black/40 p-1.5 rounded-xl flex gap-1 border border-white/5 relative">
                {[
                  { id: "picdrift", label: "PicDrift", icon: "✨" },
                  { id: "studio", label: "Pic FX", icon: "🎨" },
                  { id: "videofx", label: "Video FX", icon: "🎥" },
                ].map((tab) => {
                  const isActive = currentVisualTab === tab.id;
                  return (
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
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        isActive
                          ? "bg-gray-700/80 text-white shadow-lg shadow-black/20 border border-white/10"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* === INTEGRATED SETTINGS PANEL === */}
              <div className="bg-gray-900/40 border border-white/5 rounded-2xl p-4 sm:p-5 mb-6 backdrop-blur-sm shadow-inner">
                {/* STUDIO MODES */}
                {currentVisualTab === "studio" && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <div className="flex gap-4 mb-4 border-b border-white/5 pb-4">
                      {["image", "carousel", "edit"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setStudioMode(m as StudioMode)}
                          className={`text-xs font-bold uppercase tracking-wider pb-2 -mb-4.5 border-b-2 transition-all ${
                            studioMode === m
                              ? "text-cyan-400 border-cyan-400"
                              : "text-gray-500 border-transparent hover:text-gray-300"
                          }`}
                        >
                          {m === "edit" ? "Magic Editor" : `${m} FX`}
                        </button>
                      ))}
                    </div>
                    {/* STUDIO RATIO TOOLBAR */}
                    {studioMode !== "edit" && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 font-semibold uppercase">
                          Aspect Ratio
                        </span>
                        <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                          {[
                            { id: "16:9", label: "16:9" },
                            { id: "9:16", label: "9:16" },
                            { id: "1:1", label: "1:1" },
                          ].map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setGeminiAspect(a.id as any)}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                geminiAspect === a.id
                                  ? "bg-gray-700 text-white shadow-sm"
                                  : "text-gray-400 hover:text-white"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* VIDEO FX MODES & SETTINGS */}
                {currentVisualTab === "videofx" && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    {/* ENGINE SWITCHER */}
                    <div className="flex gap-4 mb-4 border-b border-white/5 pb-4">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveEngine("kie");
                          setVideoFxMode("video");
                        }}
                        className={`text-xs font-bold uppercase tracking-wider pb-2 -mb-4.5 border-b-2 transition-all ${
                          activeEngine === "kie"
                            ? "text-cyan-400 border-cyan-400"
                            : "text-gray-500 border-transparent hover:text-gray-300"
                        }`}
                      >
                        Gen-1 (Kling)
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveEngine("openai")}
                        className={`text-xs font-bold uppercase tracking-wider pb-2 -mb-4.5 border-b-2 transition-all ${
                          activeEngine === "openai"
                            ? "text-cyan-400 border-cyan-400"
                            : "text-gray-500 border-transparent hover:text-gray-300"
                        }`}
                      >
                        Gen-2 (Sora)
                      </button>
                    </div>

                    {/* ✅ NEW: MODEL & QUALITY SETTINGS (Fixes the TS Error) */}
                    <div className="flex flex-wrap items-center gap-4 mb-4 border-b border-white/5 pb-4">
                      {/* 1. MODEL SELECTION */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-semibold uppercase">
                          Model
                        </span>
                        <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                          {activeEngine === "kie"
                            ? // KIE MODELS
                              [
                                { id: "kie-sora-2", label: "Standard" },
                                { id: "kie-sora-2-pro", label: "Pro" },
                              ].map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setKieModel(m.id as any)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    kieModel === m.id
                                      ? "bg-gray-700 text-white shadow-sm"
                                      : "text-gray-400 hover:text-white"
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))
                            : // OPENAI MODELS
                              [
                                { id: "sora-2", label: "Standard" },
                                { id: "sora-2-pro", label: "Pro" },
                              ].map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setVideoModel(m.id as any)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    videoModel === m.id
                                      ? "bg-gray-700 text-white shadow-sm"
                                      : "text-gray-400 hover:text-white"
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                        </div>
                      </div>

                      {/* 2. RESOLUTION (Only for Kie/Kling) */}
                      {activeEngine === "kie" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-semibold uppercase">
                            Quality
                          </span>
                          <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                            {[
                              { id: "720p", label: "720p" },
                              { id: "1080p", label: "1080p" },
                            ].map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setKieResolution(r.id as any)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                  kieResolution === r.id
                                    ? "bg-gray-700 text-white shadow-sm"
                                    : "text-gray-400 hover:text-white"
                                }`}
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* DURATION & RATIO */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-semibold uppercase">
                          Duration
                        </span>
                        <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                          {(activeEngine === "kie" ? [5, 10] : [4, 8, 12]).map(
                            (d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() =>
                                  activeEngine === "kie"
                                    ? setKieDuration(d as any)
                                    : setVideoDuration(d as any)
                                }
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                  (
                                    activeEngine === "kie"
                                      ? kieDuration === d
                                      : videoDuration === d
                                  )
                                    ? "bg-gray-700 text-white shadow-sm"
                                    : "text-gray-400 hover:text-white"
                                }`}
                              >
                                {d}s
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-semibold uppercase">
                          Ratio
                        </span>
                        <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                          {(activeEngine === "kie"
                            ? [
                                { id: "landscape", label: "16:9" },
                                { id: "portrait", label: "9:16" },
                              ]
                            : [
                                { id: "16:9", label: "16:9" },
                                { id: "9:16", label: "9:16" },
                              ]
                          ).map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                if (activeEngine === "kie")
                                  setKieAspect(a.id as any);
                                else {
                                  setAspectRatio(a.id as any);
                                  setVideoSize(
                                    a.id === "16:9" ? "1792x1024" : "1024x1792",
                                  );
                                }
                              }}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                (
                                  activeEngine === "kie"
                                    ? kieAspect === a.id
                                    : aspectRatio === a.id
                                )
                                  ? "bg-gray-700 text-white shadow-sm"
                                  : "text-gray-400 hover:text-white"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PICDRIFT SETTINGS */}
                {currentVisualTab === "picdrift" && (
                  <div className="animate-in fade-in flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-rose-400 font-semibold uppercase">
                        Duration
                      </span>
                      <div className="flex bg-black/30 rounded-lg p-1 border border-rose-500/20">
                        {[5, 10].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setKieDuration(d as any)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                              kieDuration === d
                                ? "bg-rose-900/60 text-white shadow-sm border border-rose-500/30"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            {d}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-rose-400 font-semibold uppercase">
                        Ratio
                      </span>
                      <div className="flex bg-black/30 rounded-lg p-1 border border-rose-500/20">
                        {[
                          { id: "landscape", label: "16:9" },
                          { id: "portrait", label: "9:16" },
                          { id: "square", label: "1:1" },
                        ].map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setKieAspect(a.id as any)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                              kieAspect === a.id
                                ? "bg-rose-900/60 text-white shadow-sm border border-rose-500/30"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                {/* MAGIC EDIT UI */}
                {currentVisualTab === "studio" && studioMode === "edit" ? (
                  <div className="bg-gray-900/50 border border-cyan-500/30 rounded-2xl p-8 text-center space-y-5 animate-in fade-in">
                    <div className="w-20 h-20 bg-cyan-900/20 rounded-full flex items-center justify-center mx-auto border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                      <span className="text-4xl">🪄</span>
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-xl mb-2">
                        Picture Editor
                      </h3>
                      <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Upload an image to start a chat session. Ask PicFX to
                        change lighting, add objects, or completely
                        style-transfer your image.
                      </p>
                    </div>
                    <label className="block w-full max-w-sm mx-auto cursor-pointer group">
                      <div className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl text-white font-bold group-hover:shadow-lg group-hover:scale-[1.02] transition-all flex items-center justify-center gap-2">
                        <span>📤 Upload to Start</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMagicEditUpload}
                      />
                    </label>
                    <p className="text-[10px] text-gray-500">
                      Or select from{" "}
                      <button
                        type="button"
                        onClick={() => setActiveLibrarySlot("generic")}
                        className="underline text-cyan-400"
                      >
                        Asset Library
                      </button>
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 1. PICDRIFT FRAMES (Always Top for PicDrift Mode) */}
                    {currentVisualTab === "picdrift" && (
                      <div className="grid grid-cols-2 gap-4 mb-4 animate-in fade-in">
                        {/* Start Frame */}
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-rose-300 font-bold">
                              Pic 1 - Start Frame
                            </label>
                          </div>
                          <div className="relative aspect-video bg-gray-900 border-2 border-dashed border-rose-500/30 rounded-xl overflow-hidden hover:border-rose-400 transition-colors group">
                            {picDriftUrls.start ? (
                              <>
                                <img
                                  src={picDriftUrls.start}
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePicDriftImage("start")}
                                  className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full text-xs"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                <label className="flex flex-col items-center justify-center cursor-pointer">
                                  <span className="text-rose-400 text-2xl">
                                    +
                                  </span>
                                  <span className="text-xs text-rose-300/70 hover:text-white transition-colors">
                                    Upload File
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
                                <div className="text-gray-600 text-[10px]">
                                  - OR -
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActiveLibrarySlot("start")}
                                  className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded hover:bg-rose-900 hover:text-white border border-gray-700 transition-colors"
                                >
                                  Select from Library
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* End Frame */}
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-rose-300 font-bold">
                              Pic 2 - End Frame (optional)
                            </label>
                          </div>
                          <div className="relative aspect-video bg-gray-900 border-2 border-dashed border-rose-500/30 rounded-xl overflow-hidden hover:border-rose-400 transition-colors group">
                            {picDriftUrls.end ? (
                              <>
                                <img
                                  src={picDriftUrls.end}
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePicDriftImage("end")}
                                  className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full text-xs"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                <label className="flex flex-col items-center justify-center cursor-pointer">
                                  <span className="text-rose-400 text-2xl">
                                    +
                                  </span>
                                  <span className="text-xs text-rose-300/70 hover:text-white transition-colors">
                                    Upload File
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
                                <div className="text-gray-600 text-[10px]">
                                  - OR -
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActiveLibrarySlot("end")}
                                  className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded hover:bg-rose-900 hover:text-white border border-gray-700 transition-colors"
                                >
                                  Select from Library
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. PROMPT & TITLE */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                          Your Creative Vision
                        </label>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder={
                            currentVisualTab === "picdrift"
                              ? "Describe the camera movement (e.g., 'Slow pan right, cinematic lighting')"
                              : "Describe your vision..."
                          }
                          className="w-full p-4 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all resize-none text-white placeholder-gray-500 backdrop-blur-sm text-base leading-relaxed"
                          rows={3}
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-semibold text-white">
                            Title
                          </label>
                        </div>

                        <input
                          type="text"
                          value={videoTitle}
                          onChange={(e) => setVideoTitle(e.target.value)}
                          placeholder="Name your creation..."
                          className="w-full p-3 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 backdrop-blur-sm"
                        />
                      </div>
                    </div>

                    {/* 4. REFERENCE IMAGES (Moved to End for Non-PicDrift) */}
                    {activeEngine !== "kie" || videoFxMode !== "picdrift" ? (
                      <div className="space-y-2 sm:space-y-3 pt-4 border-t border-white/5">
                        <div className="flex justify-between items-center">
                          <label className="block text-sm font-semibold text-white">
                            Reference Images
                          </label>
                        </div>
                        <div className="space-y-3">
                          <div className="w-full h-24 border-2 border-dashed border-gray-600 rounded-xl hover:border-cyan-500 hover:bg-gray-800/50 transition-all group relative flex items-center justify-center">
                            <div className="flex items-center gap-6">
                              <label className="cursor-pointer flex flex-col items-center group-hover:scale-105 transition-transform">
                                <span className="text-2xl mb-1">📂</span>
                                <span className="text-xs text-gray-400 font-bold group-hover:text-cyan-400">
                                  Upload File
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
                              <div className="h-8 w-px bg-gray-600"></div>
                              <button
                                type="button"
                                onClick={() => setActiveLibrarySlot("generic")}
                                className="flex flex-col items-center group-hover:scale-105 transition-transform"
                              >
                                <span className="text-2xl mb-1">📚</span>
                                <span className="text-xs text-gray-400 font-bold group-hover:text-cyan-400">
                                  From Library
                                </span>
                              </button>
                            </div>
                            <p className="absolute bottom-2 text-[10px] text-gray-600">
                              {activeEngine === "studio" &&
                              studioMode === "carousel"
                                ? "Up to 14 images"
                                : "Single frame"}{" "}
                              (PNG/JPG)
                            </p>
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

                    <button
                      type="submit"
                      disabled={
                        generateMediaMutation.isPending || !prompt.trim()
                      }
                      className={`w-full py-4 sm:py-5 px-6 sm:px-8 rounded-2xl hover:shadow-2xl disabled:opacity-50 font-bold text-base sm:text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] ${
                        currentVisualTab === "picdrift"
                          ? "bg-gradient-to-r from-rose-600 to-pink-600 shadow-[0_0_20px_rgba(225,29,72,0.4)]"
                          : "bg-gradient-to-r from-cyan-600 to-blue-600 shadow-[0_0_20px_rgba(8,145,178,0.4)]"
                      }`}
                    >
                      {generateMediaMutation.isPending ? (
                        <>
                          <LoadingSpinner size="sm" variant="light" />
                          <span>
                            Starting{" "}
                            {activeEngine === "studio" ? studioMode : "video"}
                            ...
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-xl">🚀</span>
                          <span>
                            {currentVisualTab === "picdrift"
                              ? "Generate PicDrift"
                              : `Generate ${
                                  activeEngine === "studio"
                                    ? studioMode === "carousel"
                                      ? "Carousel"
                                      : "Image"
                                    : "Video"
                                }`}
                          </span>
                        </>
                      )}
                    </button>
                  </>
                )}
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

          <div className="lg:w-96">
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 shadow-2xl sticky top-4">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span></span> Timeline
                </h2>
                {/* EXPAND BUTTON */}
                <button
                  onClick={() => setShowFullTimeline(true)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-cyan-400 transition-colors border border-transparent hover:border-cyan-500/30"
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
                    <div className="text-purple-300 text-sm mb-3">
                      No content yet
                    </div>
                    <div className="text-4xl mb-2">✨</div>
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

        {/* ✅ ADD THIS BLOCK */}
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
              // Re-use your preview logic
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
