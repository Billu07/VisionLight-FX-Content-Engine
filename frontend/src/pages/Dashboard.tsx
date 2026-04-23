import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  apiEndpoints,
  getCORSProxyUrl,
  getCORSProxyVideoUrl,
} from "../lib/api";
import { confirmAction } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorAlert } from "../components/ErrorAlert";
import { PostCard } from "../components/PostCard";
import { BrandConfigModal } from "../components/BrandConfigModal";
import { AssetLibrary } from "../components/AssetLibrary";
import { WelcomeTour } from "../components/WelcomeTour";
import { MediaPreview } from "../components/MediaPreview";
import { EditAssetModal } from "../components/EditAssetModal";
import { DriftFrameExtractor } from "../components/DriftFrameExtractor";
import { RenderReserveModal } from "../components/RenderReserveModal";
import { StockPhotosModal } from "../components/StockPhotosModal";
import { FullscreenVideoEditor, type SequenceItem } from "../components/FullscreenVideoEditor";
import { MobileNavbar } from "../components/MobileNavbar";
import { dashboardAssets } from "../features/dashboard/assets";
import { usePromptFxManager } from "../features/dashboard/hooks/usePromptFxManager";
import { useProjectEditorState } from "../features/dashboard/hooks/useProjectEditorState";
import type {
  EngineType,
  StudioMode,
  VisualTab,
  GenerationState,
} from "../features/dashboard/types";

const { picdriftLogo, fxLogo, driftLogo } = dashboardAssets;
const MAX_PICFX_REFERENCE_IMAGES = 5;
const MAX_VEO_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VEO_REFERENCE_IMAGES = 5;
const MAX_VIDEOFX1_REFERENCES = 2;
const MAX_VIDEOFX2_REFERENCES = 12;
const MAX_VIDEOFX_ADV_REFERENCES = 12;
type VeoMode =
  | "image_to_video"
  | "first_last_frame"
  | "extend_video"
  | "reference_to_video";

function Dashboard() {
  // ==========================================
  // STATE
  // ==========================================

  // Core
  const [prompt, setPrompt] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  const { systemPresets } = useAuth();
  const {
    promptFxList,
    showPromptFxMenu,
    setShowPromptFxMenu,
    newPromptFxName,
    setNewPromptFxName,
    newPromptFxText,
    setNewPromptFxText,
    isAddingPromptFx,
    setIsAddingPromptFx,
    setEditingPromptFxIndex,
    handleAddPromptFx,
    handleRemovePromptFx,
    markPromptFxUsed,
    getPromptFxOriginalIndex,
    isSavingPromptFx,
  } = usePromptFxManager();

  const [activeLibrarySlot, setActiveLibrarySlot] = useState<
    "start" | "end" | "generic" | "sequencer" | "storyline" | null
  >(null);
  const [librarySource, setLibrarySource] = useState<"top" | "field">("top");
  const [libraryInitialTab, setLibraryInitialTab] = useState<
    | "16:9"
    | "9:16"
    | "1:1"
    | "original"
    | "custom"
    | "VIDEO"
    | "STORYBOARD"
    | "3DX_FRAME"
    | null
  >(null);

  // Engine Selection
  const [activeEngine, setActiveEngine] = useState<EngineType>("kie");
  const [studioMode, setStudioMode] = useState<StudioMode>("image");

  // Video FX 1 / PicDrift Engine
  // ✅ UPDATED DEFAULT: 10s (Matches PicDrift Standard)
  const [kieDuration, setKieDuration] = useState<5 | 10 | 15>(10);
  // ✅ UPDATED DEFAULT: 1080p
  const [kieResolution] = useState<"720p" | "1080p">("1080p");

  // ✅ UPDATED DEFAULT: Portrait
  const [kieAspect, setKieAspect] = useState<
    "landscape" | "portrait" | "square"
  >("portrait");

  // PicDrift Settings
  const [picDriftAudio, setPicDriftAudio] = useState(false);
  const [picDriftMode, setPicDriftMode] = useState<"standard" | "plus">(
    "standard",
  );

  // Drift State for 3DX
  const [driftParams, setDriftParams] = useState({ horizontal: 0, vertical: 0, zoom: 0 });

  // ✅ UPDATED DEFAULT: Pro Model
  const kieModel = "kie-seedance-2" as const;
  const [videoFx1Mode, setVideoFx1Mode] = useState<
    "text" | "frames" | "references"
  >("frames");
  const [videoFx1Duration, setVideoFx1Duration] = useState<10 | 15>(10);
  const [videoFx1Resolution, setVideoFx1Resolution] = useState<
    "480p" | "720p" | "1080p"
  >("1080p");
  const [videoFx1Aspect, setVideoFx1Aspect] = useState<
    "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "auto"
  >("9:16");
  const [videoFx1GenerateAudio, setVideoFx1GenerateAudio] = useState(true);

  // Video FX Sub-mode (Video vs PicDrift)
  const [videoFxMode, setVideoFxMode] = useState<"video" | "picdrift">(
    "picdrift",
  );

  // Veo Settings
  const [veoMode, setVeoMode] = useState<VeoMode>("image_to_video");
  const [veoDuration, setVeoDuration] = useState<4 | 6 | 8>(8);
  const [veoResolution, setVeoResolution] = useState<"720p" | "1080p" | "4k">(
    "1080p",
  );
  const [veoGenerateAudio, setVeoGenerateAudio] = useState(true);
  const [veoNegativePrompt, setVeoNegativePrompt] = useState("");
  const [veoSeed, setVeoSeed] = useState("");
  const [veoAutoFix, setVeoAutoFix] = useState(true);
  const [veoSourceFile, setVeoSourceFile] = useState<File | null>(null);
  const [veoSourceUrl, setVeoSourceUrl] = useState<string | null>(null);
  const [veoFrames, setVeoFrames] = useState<{ first: File | null; last: File | null }>({
    first: null,
    last: null,
  });
  const [veoFrameUrls, setVeoFrameUrls] = useState<{
    first: string | null;
    last: string | null;
  }>({
    first: null,
    last: null,
  });
  const [veoReferenceFiles, setVeoReferenceFiles] = useState<File[]>([]);
  const [veoReferenceUrls, setVeoReferenceUrls] = useState<string[]>([]);

  // Video FX 2 Engine
  // ✅ UPDATED DEFAULT: 12s
  const [videoDuration, setVideoDuration] = useState<4 | 8 | 12>(12);
  // ✅ UPDATED DEFAULT: Pro Model
  const videoModel = "seedance-fal-2.0" as const;
  const [videoFx2Mode, setVideoFx2Mode] = useState<
    "text" | "frames" | "references"
  >("references");
  const [videoFx2Aspect, setVideoFx2Aspect] = useState<
    "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "auto"
  >("9:16");
  const [videoFx2GenerateAudio, setVideoFx2GenerateAudio] = useState(true);
  // ✅ UPDATED DEFAULT: 9:16 (Portrait)
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  // ✅ UPDATED DEFAULT: Portrait Resolution
  const [videoFx2Resolution, setVideoFx2Resolution] = useState<
    "480p" | "720p"
  >(
    "720p",
  );

  // Studio (Gemini) Aspect Ratio
  const [geminiAspect, setGeminiAspect] = useState<"1:1" | "16:9" | "9:16">(
    "9:16",
  );

  // Upload & UI
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [videoFxFrames, setVideoFxFrames] = useState<{
    start: File | null;
    end: File | null;
  }>({ start: null, end: null });
  const [videoFxFrameUrls, setVideoFxFrameUrls] = useState<{
    start: string | null;
    end: string | null;
  }>({ start: null, end: null });
  const [videoFxExtraRefs, setVideoFxExtraRefs] = useState<File[]>([]);
  const [videoFxExtraUrls, setVideoFxExtraUrls] = useState<string[]>([]);
  const [videoFxExtraNames, setVideoFxExtraNames] = useState<string[]>([]);

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showQueuedModal, setShowQueuedModal] = useState(false);
  const [showNoCreditsModal, setShowNoCreditsModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showPromptInfo, setShowPromptInfo] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [timelinePanelMode, setTimelinePanelMode] = useState<"timeline" | "storyline">("timeline");

  // === NEW PREVIEW STATE ===
  const [previewMedia, setPreviewMedia] = useState<{
    type: "image" | "video" | "carousel";
    url: string | string[];
  } | null>(null);

  // === SEQUENCER STATE ===
  const [viewMode, setViewMode] = useState<"create" | "sequencer" | "history">("create");
  const activeProjectId =
    localStorage.getItem("visionlight_active_project") || "default";
  const storylineKey = `visionlight_storyline_${activeProjectId}`;
  const [storylineSequence, setStorylineSequence] = useState<SequenceItem[]>(() => {
    try {
      const stored = localStorage.getItem(storylineKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const {
    sequence,
    setSequence,
    binItems,
    setBinItems,
    audioTracks,
    setAudioTracks,
  } = useProjectEditorState();

  const [previewCarouselIndex, setPreviewCarouselIndex] = useState(0);

  // State for Magic Edit Asset
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [editingVideoUrl, setEditingVideoUrl] = useState<string | undefined>(
    undefined,
  );
  const [showEditorModal, setShowEditorModal] = useState(false);

  // New State for Extraction (Timeline Scissors)
  const [extractingVideoUrl, setExtractingVideoUrl] = useState<string | null>(
    null,
  );
  const isUiFocusMode =
    activeLibrarySlot !== null ||
    extractingVideoUrl !== null ||
    showEditorModal ||
    !!editingAsset ||
    previewMedia !== null;

  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const canUseVideoEditor =
    user?.role === "SUPERADMIN" || user?.videoEditorEnabledForAll === true;

  // Helper to determine the current "Visual Tab"
  const currentVisualTab: VisualTab =
    activeEngine === "3dx"
      ? "3dx"
      : activeEngine === "studio"
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
    setVideoFxFrames({ start: null, end: null });
    setVideoFxFrameUrls({ start: null, end: null });
    setVideoFxExtraRefs([]);
    setVideoFxExtraUrls([]);
    setVideoFxExtraNames([]);
    setPicDriftFrames({ start: null, end: null });
    setPicDriftUrls({ start: null, end: null });
    setVeoSourceFile(null);
    setVeoSourceUrl(null);
    setVeoFrames({ first: null, last: null });
    setVeoFrameUrls({ first: null, last: null });
    setVeoReferenceFiles([]);
    setVeoReferenceUrls([]);
  }, [activeEngine, studioMode, videoFxMode]);

  useEffect(() => {
    if (activeLibrarySlot === null) {
      setLibraryInitialTab(null);
    }
  }, [activeLibrarySlot]);

  useEffect(() => {
    if (!(activeEngine === "kie" && videoFxMode === "video")) return;
    setVideoFxFrames({ start: null, end: null });
    setVideoFxFrameUrls({ start: null, end: null });
    setVideoFxExtraRefs([]);
    setVideoFxExtraUrls([]);
    setVideoFxExtraNames([]);
  }, [activeEngine, videoFxMode, videoFx1Mode]);

  useEffect(() => {
    if (activeEngine !== "openai") return;
    setVideoFxFrames({ start: null, end: null });
    setVideoFxFrameUrls({ start: null, end: null });
    setVideoFxExtraRefs([]);
    setVideoFxExtraUrls([]);
    setVideoFxExtraNames([]);
  }, [activeEngine, videoFx2Mode]);

  useEffect(() => {
    if (activeEngine !== "veo") return;
    if (veoMode === "first_last_frame") {
      setVeoSourceFile(null);
      setVeoSourceUrl(null);
      setVeoReferenceFiles([]);
      setVeoReferenceUrls([]);
      return;
    }
    if (veoMode === "reference_to_video") {
      setVeoSourceFile(null);
      setVeoSourceUrl(null);
      setVeoFrames({ first: null, last: null });
      setVeoFrameUrls({ first: null, last: null });
      setVeoDuration(8);
      return;
    }
    setVeoFrames({ first: null, last: null });
    setVeoFrameUrls({ first: null, last: null });
    setVeoReferenceFiles([]);
    setVeoReferenceUrls([]);
  }, [activeEngine, veoMode]);

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
    try {
      const stored = localStorage.getItem(storylineKey);
      setStorylineSequence(stored ? JSON.parse(stored) : []);
    } catch {
      setStorylineSequence([]);
    }
  }, [storylineKey]);

  useEffect(() => {
    localStorage.setItem(storylineKey, JSON.stringify(storylineSequence));
  }, [storylineKey, storylineSequence]);

  useEffect(() => {
    if (!canUseVideoEditor && viewMode === "sequencer") {
      setViewMode("create");
    }
  }, [canUseVideoEditor, viewMode]);

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
        const activeProject =
          localStorage.getItem("visionlight_active_project") || undefined;
        const response = await apiEndpoints.getPosts(activeProject);
        return Array.isArray(response.data.posts) ? response.data.posts : [];
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
    refetchInterval: (query) => {
      if (isUiFocusMode) return false;
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

  // === 1. DATA FETCHING (Credits & Status) ===
  const {
    data: credits = {
      creditsPicDrift: 0,
      creditsPicDriftPlus: 0,
      creditsImageFX: 0,
      creditsVideoFX1: 0,
      creditsVideoFX2: 0,
      creditsVideoFX3: 0,
    },
    isLoading: creditsLoading,
  } = useQuery({
    queryKey: ["user-credits"],
    queryFn: async () => {
      const res = await apiEndpoints.getUserCredits();
      return res.data;
    },
    enabled: !!user,
  });

  // ✅ 2. CORE LOGIC & PERMISSIONS
  const isCommercial = user?.creditSystem !== "INTERNAL";
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  // ✅ 3. VIRTUAL SUM (Fixes Timeline Build Errors)
  const userCredits =
    (credits?.creditsPicDrift || 0) +
    (credits?.creditsImageFX || 0) +
    (credits?.creditsVideoFX1 || 0) +
    (credits?.creditsVideoFX2 || 0) +
    (credits?.creditsVideoFX3 || 0);

  // ✅ 4. UI HELPERS
  const formatBal = (val: number) => {
    if (user?.view === "PICDRIFT") return `${Math.floor(val)}`;
    return isCommercial ? `$${val.toFixed(2)}` : `${val}`;
  };
  const [isRequesting, setIsRequesting] = useState(false);
  const creditLink = isCommercial
    ? "https://picdrift.com/fx-credits"
    : "https://picdrift.com/renders";
  const creditBtnText = isCommercial ? "Buy Credit" : "Request Render";

  // ✅ 5. BACKGROUND JOB POLLING
  useQuery({
    queryKey: ["check-jobs"],
    queryFn: async () => {
      if (isUiFocusMode) return true;
      const hasActive = posts.some(
        (p: any) => p.status === "PROCESSING" || p.status === "NEW",
      );
      if (hasActive) {
        await apiEndpoints.checkActiveJobs();
      }
      return true;
    },
    refetchInterval: () => {
      if (isUiFocusMode) return false;
      const hasActive = posts.some(
        (p: any) => p.status === "PROCESSING" || p.status === "NEW",
      );
      return hasActive ? 5000 : false;
    },
    enabled: !!user && posts.length > 0 && !isUiFocusMode,
  });

  // === ACTIONS ===

  const driftStartMutation = useMutation({
    mutationFn: async () => {
      let assetUrl = referenceImageUrls[0];
      const activeProject = localStorage.getItem("visionlight_active_project") || undefined;

      if (referenceImages[0] && referenceImages[0] instanceof File) {
        const formData = new FormData();
        formData.append("image", referenceImages[0]);
        formData.append("raw", "true");
        if (activeProject) formData.append("projectId", activeProject);

        const uploadRes = await apiEndpoints.uploadAssetSync(formData);
        assetUrl = uploadRes.data.asset.url;
      }

      return apiEndpoints.startDriftVideo({
        assetUrl,
        prompt: prompt,
        horizontal: driftParams.horizontal,
        vertical: driftParams.vertical,
        zoom: driftParams.zoom,
        aspectRatio: kieAspect === "landscape" ? "16:9" : kieAspect === "portrait" ? "9:16" : "1:1",
        projectId: activeProject,
      });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      setGenerationState({
        status: "generating",
        result: { postId: res.data?.postId },
      });
      setShowQueuedModal(true);
      setPrompt("");
      setReferenceImages([]);
      setReferenceImageUrls([]);
      setDriftParams({ horizontal: 0, vertical: 0, zoom: 0 });
    },
    onError: (err: any) => {
      if (err?.status === 413) {
        alert(
          "Upload too large. Increase VPS upload limit (for nginx: client_max_body_size) or use smaller references.",
        );
      } else if (err?.status === 403) {
        setShowNoCreditsModal(true);
      } else {
        alert("3DX Generation Failed: " + err.message);
      }
    }
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
        setVideoFxFrames({ start: null, end: null });
        setVideoFxFrameUrls({ start: null, end: null });
        setVideoFxExtraRefs([]);
        setVideoFxExtraUrls([]);
        setVideoFxExtraNames([]);
        setPicDriftFrames({ start: null, end: null });
        setPicDriftUrls({ start: null, end: null });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      }
    },
    onError: (err: any) => {
      if (err?.status === 413) {
        setGenerationState({
          status: "error",
          error:
            "Upload too large for server limit. Increase VPS upload limit (e.g. nginx client_max_body_size) or reduce reference file sizes.",
        });
      } else if (err?.status === 403) {
        setShowNoCreditsModal(true);
      } else {
        setGenerationState({ status: "error", error: err.message });
      }
    },
  });

  const handleShowPromptInfo = (promptText: string) => {
    setShowPromptInfo(promptText);
  };

  const updateCachedPostTitle = (postId: string, title: string) => {
    queryClient.setQueryData(["posts"], (old: any) =>
      Array.isArray(old)
        ? old.map((entry: any) =>
            entry?.id === postId ? { ...entry, title } : entry,
          )
        : old,
    );
  };

  const handleTimelineTitleUpdate = async (postId: string, title: string) => {
    const previousPosts = queryClient.getQueryData(["posts"]);
    updateCachedPostTitle(postId, title);
    try {
      await apiEndpoints.updatePostTitle(postId, title);
    } catch (error) {
      queryClient.setQueryData(["posts"], previousPosts);
      throw error;
    }
  };

  const handleStorylineTitleUpdate = async (
    itemId: string,
    sourcePostId: string | undefined,
    title: string,
  ) => {
    const previousStoryline = storylineSequence;
    setStorylineSequence((prev) =>
      prev.map((entry) =>
        entry.id === itemId ? { ...entry, title } : entry,
      ),
    );

    if (!sourcePostId) return;

    const previousPosts = queryClient.getQueryData(["posts"]);
    updateCachedPostTitle(sourcePostId, title);
    try {
      await apiEndpoints.updatePostTitle(sourcePostId, title);
    } catch (error) {
      setStorylineSequence(previousStoryline);
      queryClient.setQueryData(["posts"], previousPosts);
      throw error;
    }
  };

  const handleMoveToAssets = async (postId: string) => {
    if (!(await confirmAction("Save this content to your Asset Library?", { confirmLabel: "Save" }))) return;
    try {
      await apiEndpoints.movePostToAsset(postId);
      alert("✅ Saved! Check your Asset Library.");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (e: any) {
      alert("Failed to save: " + e.message);
    }
  };

  const handleRequestCredits = async () => {
    if (isRequesting) return;
    if (!(await confirmAction("Request more Render Reserve to Admin?", { confirmLabel: "Request" }))) return;
    const rendersUrl = "https://picdrift.com/renders";
    const openedTab = window.open(rendersUrl, "_blank", "noopener,noreferrer");
    setIsRequesting(true);
    try {
      const res = await apiEndpoints.requestCredits();
      if (!openedTab) {
        window.location.assign(rendersUrl);
      }
      alert(res?.data?.message || "Request sent! Admin inbox updated and renders page opened.");
    } catch (err: any) {
      if (!openedTab) {
        window.location.assign(rendersUrl);
      }
      alert(`Failed to send request: ${err?.message || "Unknown error"}`);
    } finally {
      setIsRequesting(false);
    }
  };

  const isVideoFile = (file: File) => file.type.startsWith("video/");
  const isAudioFile = (file: File) =>
    file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name);
  const isAudioUrl = (url: string) =>
    /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);
  const isAudioName = (name?: string | null) =>
    !!name && /\.(mp3|wav|m4a|aac|ogg)$/i.test(name);

  const removeVeoSource = () => {
    setVeoSourceFile(null);
    setVeoSourceUrl(null);
  };

  const setVeoSingleSource = (file: File, url: string) => {
    setVeoSourceFile(file);
    setVeoSourceUrl(url);
    setVeoFrames({ first: null, last: null });
    setVeoFrameUrls({ first: null, last: null });
    setVeoReferenceFiles([]);
    setVeoReferenceUrls([]);
  };

  const setVeoFrame = (slot: "first" | "last", file: File, url: string) => {
    setVeoFrames((prev) => ({ ...prev, [slot]: file }));
    setVeoFrameUrls((prev) => ({ ...prev, [slot]: url }));
    setVeoSourceFile(null);
    setVeoSourceUrl(null);
    setVeoReferenceFiles([]);
    setVeoReferenceUrls([]);
  };

  const removeVeoFrame = (slot: "first" | "last") => {
    setVeoFrames((prev) => ({ ...prev, [slot]: null }));
    setVeoFrameUrls((prev) => ({ ...prev, [slot]: null }));
  };

  const addVeoReference = (file: File, url: string) => {
    if (veoReferenceUrls.includes(url)) return;
    if (veoReferenceFiles.length >= MAX_VEO_REFERENCE_IMAGES) {
      alert(
        `Reference-to-video mode supports up to ${MAX_VEO_REFERENCE_IMAGES} images.`,
      );
      return;
    }
    setVeoReferenceFiles((prev) => [...prev, file]);
    setVeoReferenceUrls((prev) => [...prev, url]);
    setVeoSourceFile(null);
    setVeoSourceUrl(null);
    setVeoFrames({ first: null, last: null });
    setVeoFrameUrls({ first: null, last: null });
  };

  const removeVeoReference = (index: number) => {
    setVeoReferenceFiles((prev) => prev.filter((_, i) => i !== index));
    setVeoReferenceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const getCurrentVideoFxMode = () => {
    if (activeEngine === "kie" && videoFxMode === "video") return videoFx1Mode;
    if (activeEngine === "openai") return videoFx2Mode;
    return null;
  };

  const isVideoFxSlotEngine = () =>
    (activeEngine === "kie" && videoFxMode === "video") ||
    activeEngine === "openai";

  const getVideoFxReferenceLimit = () => {
    if (activeEngine === "kie" && videoFxMode === "video") {
      return MAX_VIDEOFX_ADV_REFERENCES;
    }
    return MAX_VIDEOFX2_REFERENCES;
  };

  const getVideoFxReferenceCount = () => {
    const mode = getCurrentVideoFxMode();
    if (mode === "frames") {
      return (videoFxFrames.start ? 1 : 0) + (videoFxFrames.end ? 1 : 0);
    }
    return videoFxExtraRefs.length;
  };

  const setVideoFxFrame = (
    slot: "start" | "end",
    file: File,
    url: string,
  ): boolean => {
    if (isVideoFile(file)) {
      alert("Start/End frame must be an image.");
      return false;
    }
    setVideoFxFrames((prev) => ({ ...prev, [slot]: file }));
    setVideoFxFrameUrls((prev) => ({ ...prev, [slot]: url }));
    return true;
  };

  const removeVideoFxFrame = (slot: "start" | "end") => {
    setVideoFxFrames((prev) => ({ ...prev, [slot]: null }));
    setVideoFxFrameUrls((prev) => ({ ...prev, [slot]: null }));
  };

  const addVideoFxExtraReference = (file: File, url: string) => {
    const mode = getCurrentVideoFxMode();
    if (mode !== "references") return;
    const isAllowedType =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      isAudioFile(file);
    if (!isAllowedType) {
      alert("Only image, video, and audio files are supported in reference mode.");
      return;
    }

    if (
      videoFxExtraUrls.includes(url) ||
      videoFxFrameUrls.start === url ||
      videoFxFrameUrls.end === url
    ) {
      return;
    }

    const maxRefs = getVideoFxReferenceLimit();
    if (getVideoFxReferenceCount() >= maxRefs) {
      alert(
        `Only ${maxRefs} reference file(s) allowed for this mode.`,
      );
      return;
    }

    setVideoFxExtraRefs((prev) => [...prev, file]);
    setVideoFxExtraUrls((prev) => [...prev, url]);
    setVideoFxExtraNames((prev) => [...prev, file.name]);
  };

  const removeVideoFxExtraReference = (index: number) => {
    setVideoFxExtraRefs((prev) => prev.filter((_, i) => i !== index));
    setVideoFxExtraUrls((prev) => prev.filter((_, i) => i !== index));
    setVideoFxExtraNames((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVideoFxSlotUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: "start" | "end",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (slot === "end" && !videoFxFrames.start) {
      alert("Please set Start Frame first.");
      e.target.value = "";
      return;
    }
    setVideoFxFrame(slot, file, URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleVideoFxExtraUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const mode = getCurrentVideoFxMode();
    if (mode !== "references") {
      e.target.value = "";
      return;
    }

    const maxRefs = getVideoFxReferenceLimit();
    let remaining = maxRefs - getVideoFxReferenceCount();
    if (remaining <= 0) {
      alert(
        `Only ${maxRefs} reference file(s) allowed for this mode.`,
      );
      e.target.value = "";
      return;
    }

    const allowedFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        isAudioFile(file),
    );
    if (allowedFiles.length < files.length) {
      alert("Only image, video, and audio files are supported in reference mode.");
    }

    const acceptedFiles = allowedFiles.slice(0, remaining);
    if (acceptedFiles.length === 0) {
      e.target.value = "";
      return;
    }
    if (acceptedFiles.length < files.length) {
      alert(
        `Only ${maxRefs} reference file(s) allowed for this mode.`,
      );
    }

    const acceptedUrls = acceptedFiles.map((file) => URL.createObjectURL(file));
    setVideoFxExtraRefs((prev) => [...prev, ...acceptedFiles]);
    setVideoFxExtraUrls((prev) => [...prev, ...acceptedUrls]);
    setVideoFxExtraNames((prev) => [
      ...prev,
      ...acceptedFiles.map((file) => file.name),
    ]);
    e.target.value = "";
  };

  // --- 1. ASSET LIBRARY SELECTION HANDLER ---
  const handleAssetSelect = (file: File, url: string, ratio?: string) => {
    // 1. Handle File Setting (Existing Logic)
    if (activeLibrarySlot === "start") {
      if (activeEngine === "veo" && veoMode === "first_last_frame") {
        if (isVideoFile(file)) {
          alert("First frame must be an image.");
          setActiveLibrarySlot(null);
          return;
        }
        setVeoFrame("first", file, url);
      } else if (isVideoFxSlotEngine() && getCurrentVideoFxMode() === "frames") {
        if (!setVideoFxFrame("start", file, url)) {
          setActiveLibrarySlot(null);
          return;
        }
      } else {
        if (isVideoFile(file)) {
          alert("PicDrift start frame must be an image.");
          setActiveLibrarySlot(null);
          return;
        }
        setPicDriftFrames((prev) => ({ ...prev, start: file }));
        setPicDriftUrls((prev) => ({ ...prev, start: url }));
      }
    } else if (activeLibrarySlot === "end") {
      if (activeEngine === "veo" && veoMode === "first_last_frame") {
        if (isVideoFile(file)) {
          alert("Last frame must be an image.");
          setActiveLibrarySlot(null);
          return;
        }
        setVeoFrame("last", file, url);
      } else if (isVideoFxSlotEngine() && getCurrentVideoFxMode() === "frames") {
        if (!videoFxFrames.start) {
          alert("Please set Start Frame first.");
          setActiveLibrarySlot(null);
          return;
        }
        if (!setVideoFxFrame("end", file, url)) {
          setActiveLibrarySlot(null);
          return;
        }
      } else {
        if (isVideoFile(file)) {
          alert("PicDrift end frame must be an image.");
          setActiveLibrarySlot(null);
          return;
        }
        setPicDriftFrames((prev) => ({ ...prev, end: file }));
        setPicDriftUrls((prev) => ({ ...prev, end: url }));
      }
    } else if (activeLibrarySlot === "sequencer") {
      // Add to editor bin for full Video Editor flow
      const isVideo = file.type.startsWith("video");
      const newItem: SequenceItem = {
        id: crypto.randomUUID(),
        url,
        type: isVideo ? "VIDEO" : "IMAGE",
        title: file.name,
        duration: isVideo ? 5000 : 3000,
        originalDuration: isVideo ? 15000 : 3000,
      };
      setBinItems((prev) => [...prev, newItem]);
      alert("Added to Editor Bin");
    } else if (activeLibrarySlot === "storyline") {
      const isVideo = file.type.startsWith("video");
      const newItem: SequenceItem = {
        id: crypto.randomUUID(),
        url,
        sourceMediaUrl: url,
        type: isVideo ? "VIDEO" : "IMAGE",
        title: file.name,
        createdAt: new Date().toISOString(),
        duration: isVideo ? 5000 : 3000,
        originalDuration: isVideo ? 15000 : 3000,
      };
      setStorylineSequence((prev) => [...prev, newItem]);
      setTimelinePanelMode("storyline");
      alert("Added to Storyline");
    } else {
      if (activeEngine === "studio") {
        if (file.type.startsWith("video")) {
          alert("Pic FX only supports image references.");
          setActiveLibrarySlot(null);
          return;
        }

        if (referenceImageUrls.includes(url)) {
          setActiveLibrarySlot(null);
          return;
        }

        const maxFiles =
          studioMode === "carousel" ? 14 : MAX_PICFX_REFERENCE_IMAGES;
        if (referenceImages.length >= maxFiles) {
          alert(`Only ${maxFiles} reference image(s) allowed for Pic FX.`);
          setActiveLibrarySlot(null);
          return;
        }

        setReferenceImages((prev) => [...prev, file]);
        setReferenceImageUrls((prev) => [...prev, url]);
      } else if (activeEngine === "veo") {
        if (veoMode === "extend_video") {
          if (!isVideoFile(file)) {
            alert("Extend mode requires a video source.");
            setActiveLibrarySlot(null);
            return;
          }
          setVeoSingleSource(file, url);
        } else if (veoMode === "image_to_video") {
          if (isVideoFile(file)) {
            alert("Image-to-video mode requires an image source.");
            setActiveLibrarySlot(null);
            return;
          }
          if (file.size > MAX_VEO_IMAGE_BYTES) {
            alert("Image source must be 8MB or smaller for Video FX 3.");
            setActiveLibrarySlot(null);
            return;
          }
          setVeoSingleSource(file, url);
        } else if (veoMode === "reference_to_video") {
          if (isVideoFile(file)) {
            alert("Reference-to-video mode requires image references.");
            setActiveLibrarySlot(null);
            return;
          }
          if (file.size > MAX_VEO_IMAGE_BYTES) {
            alert("Each reference image must be 8MB or smaller for Video FX 3.");
            setActiveLibrarySlot(null);
            return;
          }
          addVeoReference(file, url);
        } else {
          if (isVideoFile(file)) {
            alert("First/Last mode requires image frames only.");
            setActiveLibrarySlot(null);
            return;
          }
          if (file.size > MAX_VEO_IMAGE_BYTES) {
            alert("Frame image must be 8MB or smaller for Video FX 3.");
            setActiveLibrarySlot(null);
            return;
          }
          if (!veoFrames.first) setVeoFrame("first", file, url);
          else if (!veoFrames.last) setVeoFrame("last", file, url);
          else setVeoFrame("first", file, url);
        }
      } else if (activeEngine === "kie" && videoFxMode === "video") {
        const mode = getCurrentVideoFxMode();
        if (mode === "frames") {
          if (isVideoFile(file) || isAudioFile(file)) {
            alert("Frame mode requires image files only.");
            setActiveLibrarySlot(null);
            return;
          }
          if (videoFxFrameUrls.start === url || videoFxFrameUrls.end === url) {
            setActiveLibrarySlot(null);
            return;
          }
          if (!videoFxFrames.start) setVideoFxFrame("start", file, url);
          else if (!videoFxFrames.end) setVideoFxFrame("end", file, url);
          else {
            alert(
              `Only ${MAX_VIDEOFX1_REFERENCES} ordered frame(s) allowed in frame mode.`,
            );
            setActiveLibrarySlot(null);
            return;
          }
        } else if (mode === "references") {
          addVideoFxExtraReference(file, url);
        }
      } else if (activeEngine === "openai") {
        const mode = getCurrentVideoFxMode();
        if (mode === "frames") {
          if (isVideoFile(file) || isAudioFile(file)) {
            alert("Frame mode requires image files only.");
            setActiveLibrarySlot(null);
            return;
          }
          if (!videoFxFrames.start) setVideoFxFrame("start", file, url);
          else if (!videoFxFrames.end) setVideoFxFrame("end", file, url);
          else {
            alert("Frame mode supports start and end images only.");
            setActiveLibrarySlot(null);
            return;
          }
        } else if (mode === "references") {
          addVideoFxExtraReference(file, url);
        }
      } else {
        setReferenceImages([file]);
        setReferenceImageUrls([url]);
      }
    }

    // 2. ✅ NEW: Auto-Update Aspect Ratio based on Selection
    if (ratio && ratio !== "original") {
      console.log(`Auto-setting ratio to: ${ratio}`);

      // Determine standardized Ratio ID
      const r = ratio as
        | "16:9"
        | "9:16"
        | "1:1"
        | "4:3"
        | "3:4"
        | "21:9"
        | "auto";

      // A. VIDEO FX 1 / PICDRIFT
      if (activeEngine === "kie") {
        if (videoFxMode === "video") {
          setVideoFx1Aspect(r);
        } else {
          if (r === "16:9") setKieAspect("landscape");
          else if (r === "9:16") setKieAspect("portrait");
          else if (r === "1:1") setKieAspect("square");
        }
      }

      // B. VIDEO FX 2
      else if (activeEngine === "openai") {
        setVideoFx2Aspect(r);
      }

      // C. VEO / VIDEO FX 3
      else if (activeEngine === "veo") {
        if (r === "16:9") setAspectRatio("16:9");
        else if (r === "9:16") setAspectRatio("9:16");
      }

      // D. STUDIO / GEMINI
      else if (activeEngine === "studio") {
        if (r === "16:9" || r === "9:16" || r === "1:1") {
          setGeminiAspect(r);
        }
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
    const newFiles = Array.from(files);

    if (activeEngine === "kie" && videoFxMode === "video") {
      const mode = getCurrentVideoFxMode();
      if (mode === "frames") {
        if (newFiles.some((file) => isVideoFile(file) || isAudioFile(file))) {
          alert("Frame mode supports image files only.");
          e.target.value = "";
          return;
        }

        let hasStart = !!videoFxFrames.start;
        let hasEnd = !!videoFxFrames.end;
        for (const file of newFiles) {
          const url = URL.createObjectURL(file);
          if (!hasStart) {
            setVideoFxFrame("start", file, url);
            hasStart = true;
            continue;
          }
          if (!hasEnd) {
            setVideoFxFrame("end", file, url);
            hasEnd = true;
            continue;
          }
          alert(
            `Only ${MAX_VIDEOFX1_REFERENCES} ordered frame(s) allowed in frame mode.`,
          );
          break;
        }
        e.target.value = "";
        return;
      }

      if (mode === "references") {
        const remainingSlots =
          getVideoFxReferenceLimit() - getVideoFxReferenceCount();
        if (remainingSlots <= 0) {
          alert(
            `Only ${getVideoFxReferenceLimit()} reference file(s) allowed for this mode.`,
          );
          e.target.value = "";
          return;
        }
        const usableFiles = newFiles.slice(0, remainingSlots);
        if (usableFiles.length < newFiles.length) {
          alert(
            `Only ${getVideoFxReferenceLimit()} reference file(s) allowed for this mode.`,
          );
        }
        usableFiles.forEach((file) =>
          addVideoFxExtraReference(file, URL.createObjectURL(file)),
        );
      }
      e.target.value = "";
      return;
    }

    if (activeEngine === "openai") {
      const mode = getCurrentVideoFxMode();
      if (mode === "frames") {
        if (newFiles.some((file) => isVideoFile(file) || isAudioFile(file))) {
          alert("Frame mode supports image files only.");
          e.target.value = "";
          return;
        }

        let hasStart = !!videoFxFrames.start;
        let hasEnd = !!videoFxFrames.end;
        for (const file of newFiles) {
          const url = URL.createObjectURL(file);
          if (!hasStart) {
            setVideoFxFrame("start", file, url);
            hasStart = true;
            continue;
          }
          if (!hasEnd) {
            setVideoFxFrame("end", file, url);
            hasEnd = true;
            continue;
          }
          alert("Frame mode supports start and end images only.");
          break;
        }
        e.target.value = "";
        return;
      }

      if (mode === "references") {
        const remainingSlots =
          getVideoFxReferenceLimit() - getVideoFxReferenceCount();
        if (remainingSlots <= 0) {
          alert(
            `Only ${getVideoFxReferenceLimit()} reference file(s) allowed for this mode.`,
          );
          e.target.value = "";
          return;
        }

        const usableFiles = newFiles.slice(0, remainingSlots);
        if (usableFiles.length < newFiles.length) {
          alert(
            `Only ${getVideoFxReferenceLimit()} reference file(s) allowed for this mode.`,
          );
        }

        usableFiles.forEach((file) =>
          addVideoFxExtraReference(file, URL.createObjectURL(file)),
        );
      }

      e.target.value = "";
      return;
    }

    if (
      activeEngine === "studio" &&
      newFiles.some((file) => !file.type.startsWith("image/"))
    ) {
      alert("Pic FX only supports image references.");
      return;
    }

    if (activeEngine === "veo") {
      if (veoMode === "extend_video" && newFiles.some((file) => !isVideoFile(file))) {
        alert("Extend mode requires video input.");
        return;
      }
      if (
        (veoMode === "image_to_video" ||
          veoMode === "first_last_frame" ||
          veoMode === "reference_to_video") &&
        newFiles.some((file) => isVideoFile(file))
      ) {
        alert("This mode requires image input.");
        return;
      }
      if (
        (veoMode === "image_to_video" ||
          veoMode === "first_last_frame" ||
          veoMode === "reference_to_video") &&
        newFiles.some((file) => file.size > MAX_VEO_IMAGE_BYTES)
      ) {
        alert("Image input must be 8MB or smaller for Video FX 3.");
        return;
      }
    }

    let maxFiles = 1;
    if (activeEngine === "studio") {
      maxFiles = studioMode === "carousel" ? 14 : MAX_PICFX_REFERENCE_IMAGES;
    }
    if (activeEngine === "kie" && videoFxMode === "video") {
      maxFiles = MAX_VIDEOFX1_REFERENCES;
    }
    if (activeEngine === "veo") {
      maxFiles =
        veoMode === "first_last_frame"
          ? 2
          : veoMode === "reference_to_video"
            ? MAX_VEO_REFERENCE_IMAGES
            : 1;
    }

    if (newFiles.length + referenceImages.length > maxFiles) {
      alert(`❌ Only ${maxFiles} file(s) allowed for this mode.`);
      return;
    }
    setReferenceImages((prev) => [...prev, ...newFiles]);
    const newUrls = newFiles.map((file) => URL.createObjectURL(file));
    setReferenceImageUrls((prev) => [...prev, ...newUrls]);
  };

  const handleVeoReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_VEO_REFERENCE_IMAGES - veoReferenceFiles.length;
    if (remainingSlots <= 0) {
      alert(
        `Reference-to-video mode supports up to ${MAX_VEO_REFERENCE_IMAGES} images.`,
      );
      e.target.value = "";
      return;
    }

    const usableFiles = files.slice(0, remainingSlots);
    if (usableFiles.length < files.length) {
      alert(
        `Reference-to-video mode supports up to ${MAX_VEO_REFERENCE_IMAGES} images.`,
      );
    }

    for (const file of usableFiles) {
      if (isVideoFile(file)) {
        alert("Reference-to-video mode requires image references.");
        continue;
      }
      if (file.size > MAX_VEO_IMAGE_BYTES) {
        alert("Each reference image must be 8MB or smaller for Video FX 3.");
        continue;
      }
      addVeoReference(file, URL.createObjectURL(file));
    }

    e.target.value = "";
  };

  // ✅ NEW: Add to Sequence Logic
  const handleAddToSequence = (post: any) => {
    let url = post.mediaUrl;
    if (url && url.startsWith("[") && url.includes("]")) {
      try {
        const parsed = JSON.parse(url);
        if (Array.isArray(parsed) && parsed.length > 0) url = parsed[0];
      } catch {
        // Keep original URL when parsing fails.
      }
    }

    if (!url) {
      alert("Unable to add this item to Storyline.");
      return;
    }

    const item: SequenceItem = {
      id: crypto.randomUUID(),
      url,
      sourceMediaUrl: post.mediaUrl,
      type: post.mediaType,
      title: post.title || "Untitled",
      prompt: post.prompt,
      createdAt: post.createdAt || new Date().toISOString(),
      duration: post.mediaType === "IMAGE" ? 3000 : undefined,
    };

    setStorylineSequence((prev) => [...prev, item]);
    setTimelinePanelMode("storyline");
    alert("Added to Storyline");
  };

  const moveStorylineItem = (index: number, direction: -1 | 1) => {
    setStorylineSequence((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  const removeStorylineItem = (index: number) => {
    setStorylineSequence((prev) => prev.filter((_, i) => i !== index));
  };

  const loadStorylineItemFile = async (item: SequenceItem) => {
    const rawUrl =
      item.type === "CAROUSEL" && item.sourceMediaUrl?.startsWith("[")
        ? (() => {
            try {
              const parsed = JSON.parse(item.sourceMediaUrl);
              return Array.isArray(parsed) && parsed.length > 0
                ? parsed[0]
                : item.url;
            } catch {
              return item.url;
            }
          })()
        : (item.sourceMediaUrl || item.url);
    const response = await fetch(
      item.type === "VIDEO"
        ? getCORSProxyVideoUrl(rawUrl)
        : getCORSProxyUrl(rawUrl),
    );
    if (!response.ok) {
      throw new Error("Failed to load Storyline media.");
    }
    const blob = await response.blob();
    const extension =
      item.type === "VIDEO"
        ? "mp4"
        : blob.type.includes("png")
          ? "png"
          : "jpg";
    const mimeType =
      blob.type ||
      (item.type === "VIDEO" ? "video/mp4" : "image/jpeg");
    return new File(
      [blob],
      `${item.title || "storyline-item"}.${extension}`,
      { type: mimeType },
    );
  };

  const buildStorylinePost = (item: SequenceItem, index: number) => {
    const itemUrls = [item.sourceMediaUrl, item.url]
      .filter(Boolean)
      .flatMap((value) => {
        if (!value) return [];
        if (value.startsWith("[") && value.includes("]")) {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        }
        return [value];
      });

    const matchedPost = posts.find((post: any) => {
      const postUrls = [post.mediaUrl]
        .filter(Boolean)
        .flatMap((value: string) => {
          if (value.startsWith("[") && value.includes("]")) {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [value];
            } catch {
              return [value];
            }
          }
          return [value];
        });

      return postUrls.some((postUrl: string) => itemUrls.includes(postUrl));
    });

    return {
      id: matchedPost?.id || item.id,
      sourcePostId: matchedPost?.id,
      mediaUrl: matchedPost?.mediaUrl || item.sourceMediaUrl || item.url,
      mediaType: matchedPost?.mediaType || item.type,
      mediaProvider: matchedPost?.mediaProvider,
      title: matchedPost?.title || item.title || `Scene ${index + 1}`,
      prompt:
        matchedPost?.prompt ||
        item.prompt ||
        "",
      createdAt:
        matchedPost?.createdAt || item.createdAt || new Date().toISOString(),
      status: "COMPLETED",
      progress: 100,
    };
  };

  const handleUseStorylineInPanel = async (item: SequenceItem) => {
    try {
      const file = await loadStorylineItemFile(item);
      const previewUrl = URL.createObjectURL(file);

      if (activeEngine === "kie" && videoFxMode === "picdrift") {
        if (item.type === "VIDEO") {
          alert("PicDrift slots accept images only.");
          return;
        }
        if (!picDriftFrames.start) {
          setPicDriftFrames((prev) => ({ ...prev, start: file }));
          setPicDriftUrls((prev) => ({ ...prev, start: previewUrl }));
        } else {
          setPicDriftFrames((prev) => ({ ...prev, end: file }));
          setPicDriftUrls((prev) => ({ ...prev, end: previewUrl }));
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (isVideoFxSlotEngine()) {
        const mode = getCurrentVideoFxMode();
        if (mode === "frames") {
          if (item.type === "VIDEO") {
            alert("Frame mode accepts images only.");
            return;
          }
          if (!videoFxFrames.start) {
            setVideoFxFrame("start", file, previewUrl);
          } else if (!videoFxFrames.end) {
            setVideoFxFrame("end", file, previewUrl);
          } else {
            setVideoFxFrame("start", file, previewUrl);
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (mode === "references") {
          addVideoFxExtraReference(file, previewUrl);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }

      if (activeEngine === "veo") {
        if (veoMode === "first_last_frame") {
          if (item.type === "VIDEO") {
            alert("First/Last frame mode accepts images only.");
            return;
          }
          if (!veoFrames.first) {
            setVeoFrame("first", file, previewUrl);
          } else if (!veoFrames.last) {
            setVeoFrame("last", file, previewUrl);
          } else {
            setVeoFrame("first", file, previewUrl);
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (veoMode === "reference_to_video") {
          if (item.type === "VIDEO") {
            alert("Reference-to-video accepts images only.");
            return;
          }
          addVeoReference(file, previewUrl);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (veoMode === "extend_video") {
          if (item.type !== "VIDEO") {
            alert("Extend mode accepts videos only.");
            return;
          }
          setVeoSingleSource(file, previewUrl);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (veoMode === "image_to_video") {
          if (item.type === "VIDEO") {
            alert("Image-to-video accepts images only.");
            return;
          }
          setVeoSingleSource(file, previewUrl);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }

      if (activeEngine === "studio") {
        if (item.type === "VIDEO") {
          alert("Pic FX references accept images only.");
          return;
        }
        setReferenceImages((prev) => [...prev, file]);
        setReferenceImageUrls((prev) => [...prev, previewUrl]);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      alert("This mode does not accept Storyline media right now.");
    } catch (error: any) {
      alert(error?.message || "Failed to apply Storyline media.");
    }
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
      const activeProject = localStorage.getItem("visionlight_active_project");
      if (activeProject) formData.append("projectId", activeProject);

      const res = await apiEndpoints.uploadAssetSync(formData);
      if (res.data.success && res.data.asset) {
        setEditingAsset(res.data.asset);
        setShowEditorModal(false);
        setEditingVideoUrl(undefined);
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

    const activeProject = localStorage.getItem("visionlight_active_project");
    if (activeProject) {
      formData.append("projectId", activeProject);
    }

    if (activeEngine === "kie" && videoFxMode === "picdrift") {
      formData.append("mediaType", "video");
      formData.append(
        "model",
        picDriftMode === "plus" ? "kling-3" : "kling-2.5",
      );
      formData.append(
        "generateAudio",
        user?.view === "PICDRIFT" ? "false" : picDriftAudio.toString(),
      );
      if (picDriftFrames.start)
        formData.append("referenceImages", picDriftFrames.start);
      if (picDriftFrames.end && (!picDriftAudio || picDriftMode === "plus"))
        formData.append("referenceImages", picDriftFrames.end);
      formData.append("duration", kieDuration.toString());
      formData.append("aspectRatio", kieAspect);
      formData.append("resolution", kieResolution);
    } else if (activeEngine === "kie" && videoFxMode === "video") {
      formData.append("mediaType", "video");
      formData.append("model", kieModel);
      formData.append("videoGenerationMode", videoFx1Mode);
      formData.append("duration", videoFx1Duration.toString());
      formData.append("aspectRatio", videoFx1Aspect);
      formData.append("resolution", videoFx1Resolution);
      formData.append("generateAudio", videoFx1GenerateAudio.toString());
      if (videoFx1Mode === "frames") {
        if (videoFxFrames.start) formData.append("referenceImages", videoFxFrames.start);
        if (videoFxFrames.end) formData.append("referenceImages", videoFxFrames.end);
      } else if (videoFx1Mode === "references") {
        videoFxExtraRefs.forEach((file) => formData.append("referenceImages", file));
      }
    } else if (activeEngine === "openai") {
      formData.append("mediaType", "video");
      formData.append("model", videoModel);
      formData.append("videoGenerationMode", videoFx2Mode);
      formData.append("duration", videoDuration.toString());
      formData.append("aspectRatio", videoFx2Aspect);
      formData.append("resolution", videoFx2Resolution);
      formData.append("generateAudio", videoFx2GenerateAudio.toString());
      if (videoFx2Mode === "frames") {
        if (videoFxFrames.start) formData.append("referenceImages", videoFxFrames.start);
        if (videoFxFrames.end) formData.append("referenceImages", videoFxFrames.end);
      } else if (videoFx2Mode === "references") {
        videoFxExtraRefs.forEach((file) => formData.append("referenceImages", file));
      }
    } else if (activeEngine === "veo") {
      formData.append("mediaType", "video");
      formData.append("model", "veo-3");
      formData.append("veoMode", veoMode);
      formData.append(
        "duration",
        veoMode === "extend_video"
          ? "7"
          : veoMode === "reference_to_video"
            ? "8"
            : veoDuration.toString(),
      );
      formData.append(
        "resolution",
        veoMode === "extend_video" ? "720p" : veoResolution,
      );
      formData.append("aspectRatio", aspectRatio); // Reuse aspect ratio state
      formData.append("generateAudio", veoGenerateAudio.toString());
      formData.append("autoFix", veoAutoFix.toString());

      if (veoMode !== "reference_to_video" && veoNegativePrompt.trim()) {
        formData.append("negativePrompt", veoNegativePrompt.trim());
      }
      if (veoMode !== "reference_to_video" && veoSeed.trim()) {
        formData.append("seed", veoSeed.trim());
      }

      if (veoMode === "first_last_frame") {
        if (veoFrames.first) formData.append("referenceImages", veoFrames.first);
        if (veoFrames.last) formData.append("referenceImages", veoFrames.last);
      } else if (veoMode === "reference_to_video") {
        veoReferenceFiles.forEach((file) =>
          formData.append("referenceImages", file),
        );
      } else if (veoSourceFile) {
        formData.append("referenceImages", veoSourceFile);
      }
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
    if (currentVisualTab === "3dx") {
      if (!referenceImageUrls.length) {
        alert("Please select a reference image for 3DX Path extraction.");
        return;
      }
      driftStartMutation.mutate();
      return;
    }

    if (activeEngine === "veo") {
      if (veoMode === "first_last_frame") {
        if (!veoFrames.first || !veoFrames.last) {
          alert("Please provide both first and last frame images.");
          return;
        }
        if (veoFrames.first.size > MAX_VEO_IMAGE_BYTES || veoFrames.last.size > MAX_VEO_IMAGE_BYTES) {
          alert("Each frame image must be 8MB or smaller for Video FX 3.");
          return;
        }
      } else if (veoMode === "reference_to_video") {
        if (veoReferenceFiles.length === 0) {
          alert("Please provide at least one reference image.");
          return;
        }
        if (veoReferenceFiles.length > MAX_VEO_REFERENCE_IMAGES) {
          alert(
            `Reference-to-video mode supports up to ${MAX_VEO_REFERENCE_IMAGES} images.`,
          );
          return;
        }
        if (
          veoReferenceFiles.some(
            (file) => isVideoFile(file) || file.size > MAX_VEO_IMAGE_BYTES,
          )
        ) {
          alert("All reference images must be image files up to 8MB.");
          return;
        }
      } else if (!veoSourceFile) {
        alert(
          veoMode === "extend_video"
            ? "Please upload a source video for extend mode."
            : "Please upload a source image for image-to-video mode.",
        );
        return;
      } else if (veoMode === "extend_video" && !isVideoFile(veoSourceFile)) {
        alert("Extend mode requires a video source.");
        return;
      } else if (veoMode === "image_to_video") {
        if (isVideoFile(veoSourceFile)) {
          alert("Image-to-video mode requires an image source.");
          return;
        }
        if (veoSourceFile.size > MAX_VEO_IMAGE_BYTES) {
          alert("Source image must be 8MB or smaller for Video FX 3.");
          return;
        }
      }
    }

    if (activeEngine === "kie" && videoFxMode === "video") {
      if (videoFx1Mode === "frames") {
        if (!videoFxFrames.start) {
          alert("Frame mode requires a Start Frame.");
          return;
        }
        if (!videoFxFrames.start && videoFxFrames.end) {
          alert("Please provide Start Frame before setting End Frame.");
          return;
        }
      } else if (videoFx1Mode === "references") {
        if (videoFxExtraRefs.length === 0) {
          alert("Reference mode requires at least one reference file.");
          return;
        }
        if (videoFxExtraRefs.length > MAX_VIDEOFX_ADV_REFERENCES) {
          alert(
            `Reference mode supports up to ${MAX_VIDEOFX_ADV_REFERENCES} files.`,
          );
          return;
        }
        const hasImageOrVideo = videoFxExtraRefs.some(
          (file) => !isAudioFile(file),
        );
        const hasAudio = videoFxExtraRefs.some((file) => isAudioFile(file));
        if (hasAudio && !hasImageOrVideo) {
          alert("Audio references require at least one image or video reference.");
          return;
        }
      }
    }

    if (activeEngine === "openai") {
      if (videoFx2Mode === "frames") {
        if (!videoFxFrames.start) {
          alert("Frame mode requires a Start Frame.");
          return;
        }
        if (!videoFxFrames.start && videoFxFrames.end) {
          alert("Please provide Start Frame before setting End Frame.");
          return;
        }
      } else if (videoFx2Mode === "references") {
        if (videoFxExtraRefs.length === 0) {
          alert("Reference mode requires at least one reference file.");
          return;
        }
        if (videoFxExtraRefs.length > MAX_VIDEOFX2_REFERENCES) {
          alert(
            `Reference mode supports up to ${MAX_VIDEOFX2_REFERENCES} files.`,
          );
          return;
        }
        const hasImageOrVideo = videoFxExtraRefs.some(
          (file) => !isAudioFile(file),
        );
        const hasAudio = videoFxExtraRefs.some((file) => isAudioFile(file));
        if (hasAudio && !hasImageOrVideo) {
          alert("Audio references require at least one image or video reference.");
          return;
        }
      }
    }

    if (!prompt.trim()) return;

    const toRequiredInt = (value: any, fallback = 1) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.round(n));
    };

    const getPicDriftRequiredCost = () => {
      if (user?.view === "PICDRIFT" && user?.creditSystem === "INTERNAL") {
        return picDriftMode === "plus" ? 2 : 1;
      }

      const priceMap = (credits as any)?.prices || {};
      const isLong = kieDuration >= 10;
      if (picDriftMode === "plus") {
        return toRequiredInt(
          isLong ? priceMap.pricePicDrift_Plus_10s : priceMap.pricePicDrift_Plus_5s,
        );
      }
      return toRequiredInt(
        isLong ? priceMap.pricePicDrift_10s : priceMap.pricePicDrift_5s,
      );
    };

    // Check correct pool balance based on current visual tab
    let hasBalance = false;
    if (currentVisualTab === "picdrift") {
      const required = getPicDriftRequiredCost();
      if (user?.view === "PICDRIFT") {
        hasBalance = (credits.creditsPicDrift || 0) >= required;
      } else if (picDriftMode === "plus") {
        hasBalance = (credits.creditsPicDriftPlus || 0) >= required;
      } else {
        hasBalance = (credits.creditsPicDrift || 0) >= required;
      }
    }
    else if (currentVisualTab === "studio")
      hasBalance = credits.creditsImageFX > 0;
    else if (activeEngine === "kie") hasBalance = credits.creditsVideoFX1 > 0;
    else if (activeEngine === "openai")
      hasBalance = credits.creditsVideoFX2 > 0;
    else if (activeEngine === "veo") hasBalance = credits.creditsVideoFX3 > 0;

    if (!hasBalance) {
      setShowNoCreditsModal(true);
      return;
    }

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
    if (activeEngine === "kie") {
      return videoFxMode === "video" ? videoFx1Aspect : kieAspect;
    }
    if (activeEngine === "openai") return videoFx2Aspect;
    if (activeEngine === "studio") return geminiAspect; // "1:1", "16:9", "9:16"
    return undefined;
  };

  // ✅ HELPER: Header Logic
  const getHeaderContent = () => {
    if (currentVisualTab === "3dx")
      return { logo: "/drift_icon.png", text: "Drift Path Generation" };
    if (currentVisualTab === "picdrift")
      return { logo: picdriftLogo, text: "Photo to Photo Movement" };
    if (currentVisualTab === "studio")
      return { logo: fxLogo, text: "Image Generation" };
    return { logo: fxLogo, text: "Video Generation" }; // videofx
  };
  const { logo: currentLogo, text: currentHeaderText } = getHeaderContent();
  const currentVideoFxMode =
    activeEngine === "kie" && videoFxMode === "video"
      ? videoFx1Mode
      : activeEngine === "openai"
        ? videoFx2Mode
        : null;
  const isVideoFxSlotMode =
    currentVisualTab === "videofx" &&
    currentVideoFxMode === "frames" &&
    ((activeEngine === "kie" && videoFxMode === "video") ||
      activeEngine === "openai");
  const isVideoFxReferenceMode =
    currentVisualTab === "videofx" &&
    currentVideoFxMode === "references" &&
    ((activeEngine === "kie" && videoFxMode === "video") ||
      activeEngine === "openai");
  const isVideoFxTextMode =
    currentVisualTab === "videofx" &&
    currentVideoFxMode === "text" &&
    ((activeEngine === "kie" && videoFxMode === "video") ||
      activeEngine === "openai");

  const timelinePosts = useMemo(() => {
    if (!Array.isArray(posts)) return [];
    return posts
      .filter((post: any) => post.status !== "CANCELLED")
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [posts]);

  const compactTimelinePosts = useMemo(
    () => timelinePosts.slice(0, 40),
    [timelinePosts],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-violet-950 text-gray-200 relative overflow-hidden pb-24 lg:pb-0">
      {/* TREDNY STUDIO BACKGROUND EFFECTS */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Ambient colored glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-cyan-500/10 rounded-full blur-[100px] mix-blend-screen animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>

      <div className="relative z-10">
        {/* ... MODALS ... */}
        {activeLibrarySlot !== null && (
          <AssetLibrary
            onClose={() => setActiveLibrarySlot(null)}
            onSelect={handleAssetSelect}
            isSequencerMode={
              activeLibrarySlot === "sequencer" ||
              activeLibrarySlot === "storyline"
            }
            isPickerMode={
              librarySource === "field" ||
              activeLibrarySlot === "sequencer" ||
              activeLibrarySlot === "storyline"
            }
            initialTab={libraryInitialTab || undefined}
            initialAspectRatio={
              librarySource === "top" ? "original" : getCurrentRatioForLibrary()
            }
            onEditAsset={(asset) => {
              setEditingAsset(asset);
              setShowEditorModal(false);
              setEditingVideoUrl(undefined);
              // setActiveLibrarySlot(null); // Keep library open underneath so when they minimize, they see where they were
            }}
          />
        )}

        {/* ✅ FULLSCREEN SEQUENCE EDITOR */}
        {canUseVideoEditor && viewMode === "sequencer" && (
          <FullscreenVideoEditor
            projectId={localStorage.getItem("visionlight_active_project") || undefined}
            sequence={sequence}
            setSequence={setSequence}
            binItems={binItems}
            setBinItems={setBinItems}
            audioTracks={audioTracks}
            setAudioTracks={setAudioTracks}
            onAddFromLibrary={() => {
              setLibrarySource("field");
              setActiveLibrarySlot("sequencer");
            }}
            onClear={() => {
              setSequence([]);
              setBinItems([]);
            }}
            onClose={() => setViewMode("create")}
          />
        )}

        {/* MOBILE NAVBAR */}
        <MobileNavbar
          activeTab={viewMode}
          onTabChange={(tab) => {
            if (tab === "library") {
              setLibrarySource("top");
              setActiveLibrarySlot("generic");
            } else if (tab === "projects") {
              localStorage.removeItem("visionlight_active_project");
              navigate("/projects");
            } else if (tab === "sequencer" && !canUseVideoEditor) {
              setTimelinePanelMode("storyline");
              setViewMode("history");
            } else {
              setViewMode(tab);
            }
          }}
          onOpenLibrary={() => {
            setLibrarySource("top");
            setActiveLibrarySlot("generic");
          }}
          onOpenProjects={() => {
            localStorage.removeItem("visionlight_active_project");
            navigate("/projects");
          }}
          showSequencerTab={canUseVideoEditor}
        />

        {/* EXTRACTOR MODAL */}
        {extractingVideoUrl && (
          <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/95 p-4 sm:py-6 overflow-y-auto animate-in fade-in">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto p-4 sm:p-6 relative flex flex-col items-center">
              <button
                onClick={() => setExtractingVideoUrl(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
              >
                x
              </button>
              <div className="w-full flex justify-between items-center mb-4 pr-6 shrink-0">
                <img
                  src="/drift_icon.png"
                  alt="Drift"
                  className="w-24 h-24 object-contain"
                />
                <h3 className="text-white font-bold tracking-widest text-sm">
                  3DX FRAME CAPTURE
                </h3>
              </div>
              <DriftFrameExtractor
                videoUrl={extractingVideoUrl}
                onExtract={async (blob) => {
                  const file = new File([blob], "timeline_extract.jpg", {
                    type: "image/jpeg",
                  });
                  const formData = new FormData();
                  formData.append("image", file);
                  formData.append("raw", "true");
                  formData.append("aspectRatio", "3DX_FRAME");
                  const activeProject = localStorage.getItem(
                    "visionlight_active_project",
                  );
                  if (activeProject)
                    formData.append("projectId", activeProject);

                  await apiEndpoints.uploadAssetSync(formData);
                  alert("Frame saved to Asset Library.");
                  queryClient.invalidateQueries({ queryKey: ["assets"] });
                  setExtractingVideoUrl(null);
                  setLibrarySource("top");
                  setLibraryInitialTab("3DX_FRAME");
                  setActiveLibrarySlot("generic");
                }}
                onCancel={() => setExtractingVideoUrl(null)}
              />
            </div>
          </div>
        )}

        {previewMedia && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-200"
            onClick={() => {
              setPreviewMedia(null);
              setPreviewCarouselIndex(0);
            }}
          >
            <div
              className="relative w-full h-full flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {previewMedia.type === "carousel" &&
                Array.isArray(previewMedia.url) ? (
                <div className="flex flex-col items-center w-full h-full justify-center p-4">
                  <img
                    src={getCORSProxyUrl(previewMedia.url[previewCarouselIndex], 1920, 85)}
                    className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                  />
                  {previewMedia.url.length > 1 && (
                    <div className="flex gap-2 mt-6 absolute bottom-12">
                      {previewMedia.url.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setPreviewCarouselIndex(idx)}
                          className={`w-2.5 h-2.5 rounded-full transition-all ${idx === previewCarouselIndex
                            ? "bg-white scale-125 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                            : "bg-white/30 hover:bg-white/60"
                            }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex justify-center items-center">
                  <MediaPreview
                    mediaUrl={previewMedia.url as string}
                    mediaType={
                      previewMedia.type === "video" ? "video" : "image"
                    }
                  />
                </div>
              )}
              <button
                onClick={() => {
                  setPreviewMedia(null);
                  setPreviewCarouselIndex(0);
                }}
                className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md border border-white/10 transition-colors z-[80]"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {showQueuedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-gray-900 rounded-2xl border border-cyan-400/40 shadow-2xl max-w-sm w-full p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Request Received Successfully
              </h3>
              <p className="text-sm text-purple-200 mb-4">
                Our AI model is now generating your result. Check Timeline for
                updates.
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
                    {isRequesting ? "Sending..." : "Request Renders"}
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

        {/* 🚨 ACTIVATION OVERLAY (FOR INACTIVE TENANTS) */}
        {user?.needsActivation && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950/90 backdrop-blur-xl p-4">
            <div className="bg-gray-900 border border-white/10 rounded-[2.5rem] p-8 sm:p-12 max-w-xl w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center animate-in zoom-in-95 duration-300">
              <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-rose-500/20">
                <span className="text-5xl animate-pulse">⚡</span>
              </div>
              <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-[0.2em]">
                Platform Inactive
              </h2>
              <p className="text-gray-400 mb-10 leading-relaxed text-sm sm:text-base">
                Your agency environment for <span className="text-white font-bold">{user.organizationName}</span> is not yet active.
                <br /><br />
                {user.role === 'ADMIN' || user.role === 'SUPERADMIN'
                  ? "Connect your platform API credentials in the Admin Panel to unlock all generation tools."
                  : "Please contact your system administrator to configure the required API credentials."
                }
              </p>
              <div className="space-y-4">
                {(user.role === 'ADMIN' || user.role === 'SUPERADMIN') && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-black uppercase text-xs tracking-[0.15em] transition-all shadow-xl hover:shadow-cyan-500/20 active:scale-[0.98]"
                  >
                    Go to API Configuration
                  </button>
                )}
                <button
                  onClick={logout}
                  className="w-full py-4 text-gray-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  Switch Account / Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Render Reserve Modal */}

        <RenderReserveModal
          isOpen={showReserveModal}
          onClose={() => setShowReserveModal(false)}
          prices={(credits as any)?.prices}
          isCommercial={isCommercial}
          user={user}
        />

        {/* Stock Photos Modal */}

        <StockPhotosModal
          isOpen={showStockModal}
          onClose={() => setShowStockModal(false)}
        />

        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
          {" "}
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
            </div>
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 xl:gap-4">
              <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 backdrop-blur-xl rounded-xl p-3 sm:p-4 lg:px-6 lg:py-3 border border-gray-700/50 shadow-xl w-full xl:w-auto">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 sm:flex sm:items-center sm:gap-4 md:gap-5 lg:gap-6">
                  {!creditsLoading ? (
                    user?.view === "PICDRIFT" ? (
                      <>
                        {/* PIC POOL */}
                        <div className="flex items-center sm:border-r border-gray-700/50 sm:pr-4 md:pr-5 lg:pr-6 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-violet-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsImageFX)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              Pic
                            </span>
                          </div>
                        </div>

                        {/* DRIFT POOL */}
                        <div className="flex items-center whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-pink-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsPicDrift)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              Drift
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* PICDRIFT POOL */}
                        <div className="flex items-center sm:border-r border-gray-700/50 sm:pr-4 md:pr-5 lg:pr-6 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-pink-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsPicDrift)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              PicDrift
                            </span>
                          </div>
                        </div>

                        {/* PIC FX POOL */}
                        <div className="flex items-center sm:border-r border-gray-700/50 sm:pr-4 md:pr-5 lg:pr-6 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-violet-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsImageFX)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              Pic FX
                            </span>
                          </div>
                        </div>

                        {/* PICDRIFT PLUS POOL */}
                        <div className="flex items-center sm:border-r border-gray-700/50 sm:pr-4 md:pr-5 lg:pr-6 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-rose-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide flex items-start">
                              {formatBal(credits.creditsPicDriftPlus)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1 flex items-center">
                              PicDrift<sup className="text-[10px] font-bold text-rose-500 ml-0.5">+</sup>
                            </span>
                          </div>
                        </div>

                        {/* VIDEO FX 1 POOL */}
                        <div className="flex items-center sm:border-r border-gray-700/50 sm:pr-4 md:pr-5 lg:pr-6 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-blue-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsVideoFX1)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              VidFX 1
                            </span>
                          </div>
                        </div>

                        {/* VIDEO FX 2 POOL */}
                        <div className="flex items-center sm:border-r border-gray-700/50 sm:pr-4 md:pr-5 lg:pr-6 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-cyan-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsVideoFX2)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              VidFX 2
                            </span>
                          </div>
                        </div>

                        {/* VIDEO FX 3 POOL */}
                        <div className="flex items-center whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-indigo-400 font-medium text-lg sm:text-sm md:text-base leading-none tracking-wide">
                              {formatBal(credits.creditsVideoFX3)}
                            </span>
                            <span className="text-[10px] sm:text-[8px] md:text-[9px] text-gray-400 uppercase font-medium tracking-widest mt-1">
                              VidFX 3
                            </span>
                          </div>
                        </div>
                      </>
                    )
                  ) : (
                    <div className="col-span-3 sm:col-span-1 flex justify-center">
                      <LoadingSpinner size="sm" />
                    </div>
                  )}
                </div>
              </div>

              {!isMobile && (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/40 backdrop-blur-xl border border-white/10 rounded-2xl text-sm font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-all h-full"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Menu
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="px-4 py-2 border-b border-gray-800/80 mb-2">
                        <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">Options</div>
                      </div>

                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowReserveModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-yellow-400 hover:bg-yellow-500/10 text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <span>💳</span>
                        <span>Render Reserve</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            navigate("/admin");
                          }}
                          className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
                        >
                          Admin Panel
                        </button>
                      )}

                      {isCommercial ? (
                        <a
                          href={creditLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full text-left px-4 py-2 text-green-400 hover:bg-green-500/10 text-sm font-medium transition-colors block"
                        >
                          {creditBtnText}
                        </a>
                      ) : (
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            handleRequestCredits();
                          }}
                          disabled={isRequesting}
                          className="w-full text-left px-4 py-2 text-purple-400 hover:bg-purple-500/10 text-sm font-medium transition-colors"
                        >
                          {isRequesting ? "Sending..." : "Request Renders 🔔"}
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          localStorage.removeItem("visionlight_active_project");
                          navigate("/projects");
                        }}
                        className="w-full text-left px-4 py-2 text-blue-400 hover:bg-blue-500/10 text-sm font-medium transition-colors"
                      >
                        Projects
                      </button>

                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowBrandModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-cyan-400 hover:bg-cyan-500/10 text-sm font-medium transition-colors"
                      >
                        Edit Dashboard
                      </button>

                      <div className="my-1 border-t border-gray-800/80"></div>

                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          handleLogout();
                        }}
                        className="w-full text-left px-4 py-2 text-gray-400 hover:bg-white/5 hover:text-white text-sm font-medium transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className={`flex-1 ${(viewMode !== "create" && isMobile) ? 'hidden' : 'block'}`}>
              <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 lg:p-8 shadow-2xl">
                {/* ✅ UPDATED HEADER: Logo Left, Library Button Right */}
                <div className="mb-6 sm:mb-8 flex justify-between items-start">
                  <div className="hidden sm:block">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-12 sm:h-14 flex items-center justify-center">
                        <img
                          src={currentLogo}
                          alt="LOGO"
                          className="h-full w-auto object-contain"
                        />
                      </div>
                    </div>
                    <p className="text-purple-300 text-sm ml-1">
                      {currentHeaderText}
                    </p>
                  </div>

                  {/* ✅ GLOBAL HEADER BUTTONS (HIDDEN ON MOBILE) */}
                  <div className="hidden sm:flex gap-3 ml-auto">
                    {canUseVideoEditor && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewMode(
                            viewMode === "create" ? "sequencer" : "create",
                          )
                        }
                        className={`text-xs px-4 py-2 rounded-lg border font-semibold transition-colors flex items-center gap-2 ${viewMode === "sequencer"
                          ? "bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                          : "bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700 hover:text-white"
                          }`}
                      >
                        {viewMode === "sequencer"
                          ? "Back to Create"
                          : "Video Editor"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowStockModal(true)}
                      className="text-xs px-4 py-2 rounded-lg border border-gray-600 bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      Stock Photos
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLibrarySource("top");
                        setActiveLibrarySlot("generic");
                      }}
                      className={`text-xs px-4 py-2 rounded-lg border flex items-center gap-2 transition-all font-semibold shadow-lg ${currentVisualTab === "picdrift"
                        ? "bg-rose-900/50 text-rose-300 border-rose-700/50 hover:bg-rose-800 hover:border-rose-500"
                        : "bg-cyan-900/50 text-cyan-300 border-cyan-700/50 hover:bg-cyan-800 hover:border-cyan-500"
                        }`}
                    >
                      Open Library
                    </button>
                  </div>
                </div>

                {/* NAVIGATION BAR */}
                {viewMode === "create" && (
                  <>
                    <div className="mb-6 sm:mb-8">
                      <label className="block text-sm font-semibold text-white mb-3 sm:mb-4">
                        Select Content Type
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        {user?.view === "PICDRIFT" ? (
                          <>
                            {/* TAB 1: PIC (Studio) */}
                            <button
                              type="button"
                              onClick={() => setActiveEngine("studio")}
                              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-center sm:text-left group flex flex-col items-center justify-center sm:block sm:items-start ${currentVisualTab === "studio"
                                ? "border-white/20 bg-gradient-to-br from-violet-700 to-purple-700 shadow-2xl scale-105"
                                : "border-white/5 bg-gray-800/50 hover:border-white/10"
                                }`}
                            >
                              <div className="font-semibold text-xs sm:text-sm text-white uppercase tracking-wider">
                                Pic
                              </div>
                            </button>

                            {/* TAB 2: DRIFT (PicDrift) */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveEngine("kie");
                                setVideoFxMode("picdrift");
                                if (picDriftMode === "standard") setKieDuration(10);
                                else setKieDuration(5);
                              }}
                              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-left group flex flex-col items-center justify-center text-center sm:text-left sm:block sm:items-start ${currentVisualTab === "picdrift"
                                ? "border-white/20 bg-gradient-to-br from-pink-500 to-rose-500 shadow-2xl scale-105"
                                : "border-white/5 bg-gray-800/50 hover:border-white/10"
                                }`}
                            >
                              <div className="font-semibold text-xs sm:text-sm text-white uppercase tracking-wider">
                                Drift
                              </div>
                            </button>

                            {/* TAB 3: 3DX */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowEditorModal(true);
                              }}
                              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-center sm:text-left group flex flex-col items-center justify-center sm:block sm:items-start ${currentVisualTab === "3dx"
                                ? "border-white/20 bg-gradient-to-br from-purple-600 to-indigo-600 shadow-2xl scale-105"
                                : "border-white/5 bg-gray-800/50 hover:border-white/10"
                                }`}
                            >
                              <div className="font-semibold text-xs sm:text-sm text-white uppercase tracking-wider flex items-center justify-center sm:justify-start w-full gap-1 sm:gap-2">
                                <img src={driftLogo} alt="3DX" className="h-5 w-auto" />
                              </div>
                            </button>
                          </>
                        ) : (
                          <>
                            {/* TAB 1: PICDRIFT */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveEngine("kie");
                                setVideoFxMode("picdrift");
                                if (picDriftMode === "standard") setKieDuration(10);
                                else setKieDuration(5);
                              }}
                              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-left group flex flex-col items-center justify-center text-center sm:text-left sm:block sm:items-start ${currentVisualTab === "picdrift"
                                ? "border-white/20 bg-gradient-to-br from-pink-500 to-rose-500 shadow-2xl scale-105"
                                : "border-white/5 bg-gray-800/50 hover:border-white/10"
                                }`}
                            >
                              <div className="font-semibold text-xs sm:text-sm text-white uppercase tracking-wider">
                                PicDrift
                              </div>
                            </button>

                            {/* TAB 2: PIC FX */}
                            <button
                              type="button"
                              onClick={() => setActiveEngine("studio")}
                              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-center sm:text-left group flex flex-col items-center justify-center sm:block sm:items-start ${currentVisualTab === "studio"
                                ? "border-white/20 bg-gradient-to-br from-violet-700 to-purple-700 shadow-2xl scale-105"
                                : "border-white/5 bg-gray-800/50 hover:border-white/10"
                                }`}
                            >
                              <div className="font-semibold text-xs sm:text-sm text-white uppercase tracking-wider">
                                Pic FX
                              </div>
                            </button>

                            {/* TAB 3: VIDEO FX */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveEngine("kie");
                                setVideoFxMode("video");
                                setKieDuration(15);
                              }}
                              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 text-center sm:text-left group flex flex-col items-center justify-center sm:block sm:items-start ${currentVisualTab === "videofx"
                                ? "border-white/20 bg-gradient-to-br from-cyan-600 to-blue-600 shadow-2xl scale-105"
                                : "border-white/5 bg-gray-800/50 hover:border-white/10"
                                }`}
                            >
                              <div className="font-semibold text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1 sm:gap-2 text-white">
                                Video FX
                              </div>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* --- Content Wrapper for Blur Effect --- */}
                    <div className="relative mt-4">
                      {user?.view === "PICDRIFT" && currentVisualTab === "videofx" && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl">
                          <a
                            href="http://picdrift.com/renders"
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-col items-center bg-gray-900/80 backdrop-blur-md border border-cyan-500/50 p-8 rounded-3xl shadow-[0_0_30px_rgba(6,182,212,0.2)] hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(6,182,212,0.4)] hover:scale-105 transition-all duration-300 cursor-pointer"
                          >
                            <span className="text-5xl mb-4">🔒</span>
                            <h3 className="text-2xl font-bold text-white mb-2">Video FX is Locked</h3>
                            <p className="text-cyan-300 font-medium">Click here to upgrade & unlock</p>
                          </a>
                        </div>
                      )}

                      <div className={user?.view === "PICDRIFT" && currentVisualTab === "videofx" ? "blur-[5px] pointer-events-none opacity-50 select-none transition-all duration-500" : "transition-all duration-500"}>
                        {/* STUDIO SUB-MENU */}
                        {currentVisualTab === "studio" && (
                          <div className="mb-6 animate-in fade-in space-y-4">
                            <div className="flex bg-gray-900/50 p-1 rounded-xl w-full sm:max-w-sm mx-auto border border-white/5">
                              <button
                                onClick={() => setStudioMode("image")}
                                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${studioMode === "image"
                                  ? "bg-violet-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                Image FX
                              </button>
                              {user?.view !== "PICDRIFT" && (
                                <button
                                  onClick={() => setStudioMode("carousel")}
                                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${studioMode === "carousel"
                                    ? "bg-fuchsia-600 text-white shadow-lg"
                                    : "text-gray-400 hover:text-white"
                                    }`}
                                >
                                  Carousel
                                </button>
                              )}
                              <button
                                onClick={() => setStudioMode("edit")}
                                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${studioMode === "edit"
                                  ? "bg-cyan-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                PicFX Editor
                              </button>
                            </div>
                            {studioMode !== "edit" && (
                              <div className="flex justify-center gap-2 sm:gap-3">
                                {[
                                  { id: "16:9", label: "Landscape" },
                                  { id: "9:16", label: "Portrait" },
                                  { id: "1:1", label: "Square" },
                                ].map((a) => (
                                  <button
                                    key={a.id}
                                    onClick={() => setGeminiAspect(a.id as any)}
                                    className={`px-3 py-2 sm:px-4 rounded-lg border text-xs font-bold transition-all ${geminiAspect === a.id
                                      ? "bg-violet-600 border-violet-500 text-white"
                                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                                      }`}
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* PICDRIFT SUB-MENU */}
                        {currentVisualTab === "picdrift" && user?.view !== "PICDRIFT" && (
                          <div className="mb-6 animate-in fade-in space-y-4">
                            <div className="flex bg-gray-900/50 p-1 rounded-xl w-full sm:max-w-sm mx-auto border border-white/5">
                              <button
                                type="button"
                                onClick={() => {
                                  setPicDriftMode("standard");
                                  setKieDuration(10);
                                }}
                                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${picDriftMode === "standard"
                                  ? "bg-rose-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                Standard
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPicDriftMode("plus");
                                  setKieDuration(5);
                                }}
                                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${picDriftMode === "plus"
                                  ? "bg-rose-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                PicDrift Plus
                              </button>
                            </div>
                          </div>
                        )}

                        {/* VIDEO FX SUB-MENU */}
                        {currentVisualTab === "videofx" && (
                          <div className="mb-6 animate-in fade-in space-y-4">
                            <div className="flex bg-gray-900/50 p-1 rounded-xl w-full sm:max-w-sm mx-auto border border-white/5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveEngine("kie");
                                  setVideoFxMode("video");
                                  setVideoFx1Duration(10);
                                }}
                                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${activeEngine === "kie"
                                  ? "bg-cyan-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                Video FX 1
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveEngine("openai")}
                                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${activeEngine === "openai"
                                  ? "bg-cyan-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                Video FX 2
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveEngine("veo")}
                                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${activeEngine === "veo"
                                  ? "bg-cyan-600 text-white shadow-lg"
                                  : "text-gray-400 hover:text-white"
                                  }`}
                              >
                                Video FX 3
                              </button>
                            </div>
                          </div>
                        )}

                        <form
                          onSubmit={handleSubmit}
                          className="space-y-4 sm:space-y-6"
                        >
                          {/* MAGIC EDIT UI */}
                          {currentVisualTab === "studio" &&
                            studioMode === "edit" ? (
                            <div className="bg-gray-900/50 border border-cyan-500/30 rounded-2xl p-8 text-center space-y-5 animate-in fade-in">
                              <div className="w-20 h-20 bg-cyan-900/20 rounded-full flex items-center justify-center mx-auto border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                <span className="text-4xl"></span>
                              </div>
                              <div>
                                <h3 className="text-white font-bold text-xl mb-2">
                                  PicFX Editor
                                </h3>
                                <p className="text-gray-400 text-sm max-w-md mx-auto">
                                  Upload an image to start a chat session. Ask PicFX
                                  to change lighting, add objects, or completely
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
                              <p className="text-[20px] text-gray-500">
                                Or select from{" "}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLibrarySource("field");
                                    setActiveLibrarySlot("generic");
                                  }}
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
                                      {/* Open Library Button for Start Frame */}
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
                                            onClick={() =>
                                              removePicDriftImage("start")
                                            }
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
                                            onClick={() => {
                                              setLibrarySource("field");
                                              setActiveLibrarySlot("start");
                                            }}
                                            className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded hover:bg-rose-900 hover:text-white border border-gray-700 transition-colors"
                                          >
                                            Select from Library
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* End Frame */}
                                  <div
                                    className={`flex flex-col gap-2 ${picDriftAudio && picDriftMode !== "plus" ? "opacity-50 pointer-events-none grayscale" : ""}`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <label className="text-xs text-rose-300 font-bold">
                                        {picDriftAudio && picDriftMode !== "plus"
                                          ? "Pic 2 - Disabled (Audio On)"
                                          : "Pic 2 - End Frame (optional)"}
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
                                            onClick={() =>
                                              removePicDriftImage("end")
                                            }
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
                                            onClick={() => {
                                              setLibrarySource("field");
                                              setActiveLibrarySlot("end");
                                            }}
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

                              {/* 2. PROMPT & TITLE (Moved Up for Non-PicDrift) */}
                              <div>
                                <div className="flex items-center justify-between mb-2 relative">
                                  <label className="block text-sm font-semibold text-white">
                                    Your Creative Vision
                                  </label>

                                  {/* PromptFX Popover Trigger */}
                                  <button
                                    type="button"
                                    onClick={() => setShowPromptFxMenu(!showPromptFxMenu)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${currentVisualTab === "picdrift"
                                      ? "bg-rose-900/40 border-rose-500/50 text-rose-300 hover:bg-rose-800/60"
                                      : currentVisualTab === "studio"
                                        ? "bg-violet-900/40 border-violet-500/50 text-violet-300 hover:bg-violet-800/60"
                                        : "bg-cyan-900/40 border-cyan-500/50 text-cyan-300 hover:bg-cyan-800/60"
                                      }`}
                                  >
                                    ✨ PromptFX
                                  </button>

                                  {/* PromptFX Popover Menu */}
                                  {showPromptFxMenu && (
                                    <div className="absolute top-full right-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
                                        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Saved Prompts</h4>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setIsAddingPromptFx(!isAddingPromptFx)}
                                            className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white transition-colors"
                                          >
                                            {isAddingPromptFx ? "Cancel" : "+ Add New"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setShowPromptFxMenu(false)}
                                            className="text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>

                                      {isAddingPromptFx && (
                                        <div className="p-3 bg-gray-800/50 border-b border-gray-800 space-y-2">
                                          <input
                                            type="text"
                                            placeholder="Name (e.g., Cinematic Lighting)"
                                            value={newPromptFxName}
                                            onChange={(e) => setNewPromptFxName(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                                          />
                                          <textarea
                                            placeholder="The prompt text..."
                                            value={newPromptFxText}
                                            onChange={(e) => setNewPromptFxText(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white placeholder-gray-500 resize-none h-16 focus:border-cyan-500 focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={handleAddPromptFx}
                                            disabled={isSavingPromptFx || !newPromptFxName.trim() || !newPromptFxText.trim()}
                                            className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded transition-colors"
                                          >
                                            Save Prompt
                                          </button>
                                        </div>
                                      )}

                                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {/* Global System Presets */}
                                        {systemPresets && systemPresets.length > 0 && (
                                          <div className="bg-cyan-900/10">
                                            <div className="px-3 py-1 bg-gray-950/50 text-[8px] font-black text-cyan-400 uppercase tracking-[0.2em] border-b border-gray-800">System Presets</div>
                                            {systemPresets.map((pf: any) => (
                                              <div key={pf.id} className="group relative border-b border-gray-800/50 last:border-0 hover:bg-cyan-900/20 transition-colors">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    markPromptFxUsed({
                                                      name: pf.name,
                                                      prompt: pf.prompt,
                                                    });
                                                    setPrompt(pf.prompt);
                                                    setShowPromptFxMenu(false);
                                                  }}
                                                  className="w-full text-left p-3 pr-20 flex flex-col gap-1"
                                                >
                                                  <div className="flex justify-between items-start">
                                                    <span className="text-sm font-bold text-cyan-100">{pf.name}</span>
                                                    <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded uppercase font-bold">Global</span>
                                                  </div>
                                                  <span className="text-xs text-gray-500 truncate">{pf.prompt}</span>
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {promptFxList.length === 0 && !isAddingPromptFx && (!systemPresets || systemPresets.length === 0) ? (
                                          <div className="p-4 text-center text-xs text-gray-500">
                                            No saved prompts yet.
                                          </div>
                                        ) : (
                                          promptFxList.map((pf: any, idx: number) => (
                                            <div key={idx} className="group relative border-b border-gray-800/50 last:border-0 hover:bg-gray-800/40 transition-colors">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  markPromptFxUsed({
                                                    name: pf.name,
                                                    prompt: pf.prompt,
                                                  });
                                                  setPrompt(pf.prompt);
                                                  setShowPromptFxMenu(false);
                                                }}
                                                className="w-full text-left p-3 pr-20 flex flex-col gap-1"
                                              >
                                                <span className="text-sm font-bold text-gray-200">{pf.name}</span>
                                                <span className="text-xs text-gray-500 truncate">{pf.prompt}</span>
                                              </button>
                                              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setNewPromptFxName(pf.name);
                                                    setNewPromptFxText(pf.prompt);
                                                    setEditingPromptFxIndex(
                                                      getPromptFxOriginalIndex(pf),
                                                    );
                                                    setIsAddingPromptFx(true);
                                                  }}
                                                  className="w-7 h-7 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white rounded flex items-center justify-center text-xs"
                                                  title="Edit"
                                                >
                                                  ✎
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemovePromptFx(
                                                      getPromptFxOriginalIndex(pf),
                                                    );
                                                  }}
                                                  className="w-7 h-7 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded flex items-center justify-center text-xs"
                                                  title="Delete"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <textarea
                                  value={prompt}
                                  onChange={(e) => setPrompt(e.target.value)}
                                  placeholder={currentVisualTab === "3dx" ? "Describe where you want the camera to move to create a path." : "Describe your vision with a prompt"}
                                  className="w-full p-4 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all resize-none text-white placeholder-purple-300/60 backdrop-blur-sm text-base leading-relaxed"
                                  rows={3}
                                />
                              </div>

                              <div>
                                {/* ✅ FLEX CONTAINER FOR LABEL + BUTTON */}
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
                                  className="w-full p-3 bg-gray-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-purple-300/60 backdrop-blur-sm"
                                />
                              </div>

                              {/* 3. SETTINGS (Moved below Title) */}

                              {/* VIDEO FX 1 SETTINGS */}
                              {currentVisualTab === "videofx" &&
                                activeEngine === "kie" && (
                                  <div className="space-y-4 sm:space-y-6 animate-in fade-in">
                                    <div className="space-y-3">
                                      <label className="text-sm font-semibold text-white mb-2 block">
                                        Generation Mode
                                      </label>
                                      <div className="grid grid-cols-3 gap-2">
                                        {[
                                          { id: "text", label: "Text" },
                                          { id: "frames", label: "Frames" },
                                          { id: "references", label: "References" },
                                        ].map((mode) => (
                                          <button
                                            key={mode.id}
                                            type="button"
                                            onClick={() =>
                                              setVideoFx1Mode(
                                                mode.id as "text" | "frames" | "references",
                                              )
                                            }
                                            className={`py-2 rounded-lg border text-sm font-medium transition-all ${videoFx1Mode === mode.id
                                              ? "bg-cyan-600 border-cyan-600 text-white"
                                              : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                              }`}
                                          >
                                            {mode.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                      <div>
                                        <label className="text-sm font-semibold text-white mb-2 block">
                                          Duration
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                          {[10, 15].map((d) => (
                                            <button
                                              key={d}
                                              type="button"
                                              onClick={() => setVideoFx1Duration(d as 10 | 15)}
                                              className={`py-2 rounded-lg border text-sm font-medium ${videoFx1Duration === d
                                                ? "bg-cyan-600 border-cyan-600 text-white"
                                                : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                              {d}s
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-semibold text-white mb-2 block">
                                          Resolution
                                        </label>
                                        <div className="flex gap-2">
                                          {[
                                            { id: "480p", label: "480p" },
                                            { id: "720p", label: "720p" },
                                            { id: "1080p", label: "1080p" },
                                          ].map((r) => (
                                            <button
                                              key={r.id}
                                              type="button"
                                              onClick={() =>
                                                setVideoFx1Resolution(
                                                  r.id as "480p" | "720p" | "1080p",
                                                )
                                              }
                                              className={`flex-1 py-2 rounded-lg border text-sm font-medium ${videoFx1Resolution === r.id
                                                ? "bg-cyan-600 border-cyan-600 text-white"
                                                : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                              {r.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="text-sm font-semibold text-white mb-2 block">
                                          Aspect Ratio
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                          {[
                                            { id: "16:9", label: "16:9" },
                                            { id: "9:16", label: "9:16" },
                                            { id: "1:1", label: "1:1" },
                                            { id: "4:3", label: "4:3" },
                                            { id: "3:4", label: "3:4" },
                                            { id: "21:9", label: "21:9" },
                                            { id: "auto", label: "Auto" },
                                          ].map((a) => (
                                            <button
                                              key={a.id}
                                              type="button"
                                              onClick={() =>
                                                setVideoFx1Aspect(
                                                  a.id as
                                                    | "16:9"
                                                    | "9:16"
                                                    | "1:1"
                                                    | "4:3"
                                                    | "3:4"
                                                    | "21:9"
                                                    | "auto",
                                                )
                                              }
                                              className={`py-2 rounded-lg border text-sm font-medium ${videoFx1Aspect === a.id
                                                ? "bg-cyan-600 border-cyan-600 text-white"
                                                : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                              {a.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-gray-800/50 cursor-pointer hover:bg-gray-800 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={videoFx1GenerateAudio}
                                            onChange={(e) => setVideoFx1GenerateAudio(e.target.checked)}
                                            className="w-5 h-5 rounded border-gray-600 text-cyan-600 focus:ring-cyan-500 bg-gray-700"
                                          />
                                          <div>
                                            <div className="font-semibold text-white text-sm">
                                              Generate Audio
                                            </div>
                                            <div className="text-xs text-gray-400">
                                              Include synchronized audio in output.
                                            </div>
                                          </div>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}

                              {/* PICDRIFT SETTINGS */}
                              {currentVisualTab === "picdrift" && (
                                <div className="space-y-6 mb-6">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                    <div>
                                      <label className="text-sm font-semibold text-white mb-2 block">
                                        Duration
                                      </label>
                                      <div className="flex gap-2">
                                        {[5, 10].map((d) => (
                                          <button
                                            key={d}
                                            type="button"
                                            onClick={() => setKieDuration(d as any)}
                                            className={`flex-1 py-2 rounded-lg border text-sm font-medium ${kieDuration === d
                                              ? "bg-rose-600 border-rose-600 text-white"
                                              : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
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
                                        {/* ✅ ADDED SQUARE OPTION HERE */}
                                        {[
                                          { id: "landscape", label: "Landscape" },
                                          { id: "portrait", label: "Portrait" },
                                          { id: "square", label: "Square" },
                                        ].map((a) => (
                                          <button
                                            key={a.id}
                                            type="button"
                                            onClick={() =>
                                              setKieAspect(a.id as any)
                                            }
                                            className={`flex-1 py-2 rounded-lg border text-sm font-medium ${kieAspect === a.id
                                              ? "bg-rose-600 border-rose-600 text-white"
                                              : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                              }`}
                                          >
                                            {a.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Audio Toggle */}
                                    {user?.view !== "PICDRIFT" && (
                                      <div className="sm:col-span-2">
                                        <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-gray-800/50 cursor-pointer hover:bg-gray-800 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={picDriftAudio}
                                            onChange={(e) => {
                                              setPicDriftAudio(e.target.checked);
                                              // If audio enabled, clear end frame ONLY if standard mode
                                              if (
                                                e.target.checked &&
                                                picDriftMode !== "plus"
                                              ) {
                                                setPicDriftFrames((prev) => ({
                                                  ...prev,
                                                  end: null,
                                                }));
                                                setPicDriftUrls((prev) => ({
                                                  ...prev,
                                                  end: null,
                                                }));
                                              }
                                            }}
                                            className="w-5 h-5 rounded border-gray-600 text-rose-600 focus:ring-rose-500 bg-gray-700"
                                          />
                                          <div>
                                            <div className="font-semibold text-white text-sm">
                                              Generate Audio
                                            </div>
                                            <div className="text-xs text-gray-400">
                                              AI generated sound effects{" "}
                                              {picDriftMode === "plus"
                                                ? "(Supported with End Frame)"
                                                : "(Disables End Frame)"}
                                            </div>
                                          </div>
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* VIDEO FX 2 SETTINGS */}
                              {currentVisualTab === "videofx" &&
                                activeEngine === "openai" && (
                                  <div className="space-y-4 sm:space-y-6 animate-in fade-in">
                                    <div className="space-y-3">
                                      <label className="text-sm font-semibold text-white mb-2 block">
                                        Generation Mode
                                      </label>
                                      <div className="grid grid-cols-3 gap-2">
                                        {[
                                          { id: "text", label: "Text" },
                                          { id: "frames", label: "Frames" },
                                          { id: "references", label: "References" },
                                        ].map((mode) => (
                                          <button
                                            key={mode.id}
                                            type="button"
                                            onClick={() =>
                                              setVideoFx2Mode(
                                                mode.id as "text" | "frames" | "references",
                                              )
                                            }
                                            className={`py-2 rounded-lg border text-sm font-medium transition-all ${videoFx2Mode === mode.id
                                              ? "bg-cyan-600 border-cyan-600 text-white"
                                              : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                              }`}
                                          >
                                            {mode.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                      <div>
                                        <label className="text-sm font-semibold text-white mb-2 block">
                                          Duration
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                          {[4, 8, 12].map((sec) => (
                                            <button
                                              key={sec}
                                              type="button"
                                              onClick={() => setVideoDuration(sec as 4 | 8 | 12)}
                                              className={`py-2 rounded-lg border text-sm font-medium ${videoDuration === sec
                                                ? "bg-cyan-600 border-cyan-600 text-white"
                                                : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                              {sec}s
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-semibold text-white mb-2 block">
                                          Resolution
                                        </label>
                                        <div className="flex gap-2">
                                          {[
                                            { value: "480p", label: "480p" },
                                            { value: "720p", label: "720p" },
                                          ].map(({ value, label }) => (
                                            <button
                                              key={value}
                                              type="button"
                                              onClick={() =>
                                                setVideoFx2Resolution(value as "480p" | "720p")
                                              }
                                              className={`flex-1 py-2 rounded-lg border text-sm font-medium ${videoFx2Resolution === value
                                                ? "bg-cyan-600 border-cyan-600 text-white"
                                                : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                              {label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="text-sm font-semibold text-white mb-2 block">
                                          Aspect Ratio
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                          {[
                                            { id: "16:9", label: "16:9" },
                                            { id: "9:16", label: "9:16" },
                                            { id: "1:1", label: "1:1" },
                                            { id: "4:3", label: "4:3" },
                                            { id: "3:4", label: "3:4" },
                                            { id: "21:9", label: "21:9" },
                                            { id: "auto", label: "Auto" },
                                          ].map((a) => (
                                            <button
                                              key={a.id}
                                              type="button"
                                              onClick={() =>
                                                setVideoFx2Aspect(
                                                  a.id as
                                                    | "16:9"
                                                    | "9:16"
                                                    | "1:1"
                                                    | "4:3"
                                                    | "3:4"
                                                    | "21:9"
                                                    | "auto",
                                                )
                                              }
                                              className={`py-2 rounded-lg border text-sm font-medium ${videoFx2Aspect === a.id
                                                ? "bg-cyan-600 border-cyan-600 text-white"
                                                : "border-white/10 bg-gray-800/50 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                              {a.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-gray-800/50 cursor-pointer hover:bg-gray-800 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={videoFx2GenerateAudio}
                                            onChange={(e) => setVideoFx2GenerateAudio(e.target.checked)}
                                            className="w-5 h-5 rounded border-gray-600 text-cyan-600 focus:ring-cyan-500 bg-gray-700"
                                          />
                                          <div>
                                            <div className="font-semibold text-white text-sm">
                                              Generate Audio
                                            </div>
                                            <div className="text-xs text-gray-400">
                                              Include synchronized audio in output.
                                            </div>
                                          </div>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}

                              {/* VEO 3 SETTINGS (Video FX 3) */}
                              {currentVisualTab === "videofx" &&
                                activeEngine === "veo" && (
                                  <div className="space-y-6 animate-in fade-in duration-500">
                                    <div className="space-y-3">
                                      <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em] ml-1">
                                        Generation Mode
                                      </label>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {[
                                          { id: "image_to_video", label: "Image" },
                                          { id: "first_last_frame", label: "First + Last" },
                                          { id: "extend_video", label: "Extend" },
                                          { id: "reference_to_video", label: "References" },
                                        ].map((mode) => (
                                          <button
                                            key={mode.id}
                                            type="button"
                                            onClick={() => setVeoMode(mode.id as VeoMode)}
                                            className={`py-2 px-2 rounded-xl border text-[11px] font-semibold transition-all ${
                                              veoMode === mode.id
                                                ? "border-indigo-500 bg-indigo-500/15 text-indigo-100"
                                                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                                            }`}
                                          >
                                            {mode.label}
                                          </button>
                                        ))}
                                      </div>
                                      {veoMode === "extend_video" && (
                                        <p className="text-[10px] text-amber-300/90">
                                          Extend mode follows platform API limits: fixed 7s duration and 720p output.
                                        </p>
                                      )}
                                      {veoMode === "reference_to_video" && (
                                        <p className="text-[10px] text-amber-300/90">
                                          Reference mode follows platform API limits: fixed 8s duration and multi-image input.
                                        </p>
                                      )}
                                    </div>

                                    <div className="space-y-3">
                                      <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em] ml-1">
                                        Canvas Ratio
                                      </label>
                                      <div className="grid grid-cols-2 gap-3">
                                        {[
                                          {
                                            ratio: "16:9",
                                            label: "Cinematic Landscape",
                                          },
                                          {
                                            ratio: "9:16",
                                            label: "Social Portrait",
                                          },
                                        ].map(({ ratio, label }) => (
                                          <button
                                            key={ratio}
                                            type="button"
                                            onClick={() =>
                                              setAspectRatio(ratio as any)
                                            }
                                            className={`py-4 px-4 rounded-xl border transition-all text-center ${aspectRatio === ratio
                                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-100 shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                                              : "border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700"
                                              }`}
                                          >
                                            <div className="text-xs font-medium tracking-tight">
                                              {label}
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                      <div className="space-y-3">
                                        <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em] ml-1">
                                          Resolution
                                        </label>
                                        <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800">
                                          {["720p", "1080p", "4k"].map((res) => (
                                            <button
                                              key={res}
                                              type="button"
                                              onClick={() =>
                                                setVeoResolution(res as any)
                                              }
                                              disabled={veoMode === "extend_video"}
                                              className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${veoResolution === res
                                                ? "bg-indigo-500 text-white"
                                                : "text-slate-500 hover:text-slate-300"
                                                }`}
                                            >
                                              {res.toUpperCase()}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="space-y-3">
                                        <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em] ml-1">
                                          Duration
                                        </label>
                                        <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800">
                                          {[4, 6, 8].map((sec) => (
                                            <button
                                              key={sec}
                                              type="button"
                                              onClick={() =>
                                                setVeoDuration(sec as any)
                                              }
                                              disabled={
                                                veoMode === "extend_video" ||
                                                veoMode === "reference_to_video"
                                              }
                                              className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${veoDuration === sec
                                                ? "bg-indigo-500 text-white"
                                                : "text-slate-500 hover:text-slate-300"
                                                }`}
                                            >
                                              {sec}s
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                      <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
                                        <input
                                          type="checkbox"
                                          checked={veoGenerateAudio}
                                          onChange={(e) => setVeoGenerateAudio(e.target.checked)}
                                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500"
                                        />
                                        <div>
                                          <div className="text-xs font-semibold text-indigo-100">Generate Audio</div>
                                          <div className="text-[10px] text-slate-400">API `generate_audio`</div>
                                        </div>
                                      </label>
                                      <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
                                        <input
                                          type="checkbox"
                                          checked={veoAutoFix}
                                          onChange={(e) => setVeoAutoFix(e.target.checked)}
                                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500"
                                        />
                                        <div>
                                          <div className="text-xs font-semibold text-indigo-100">Auto Fix Prompt</div>
                                          <div className="text-[10px] text-slate-400">API `auto_fix`</div>
                                        </div>
                                      </label>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <input
                                        type="text"
                                        value={veoNegativePrompt}
                                        onChange={(e) => setVeoNegativePrompt(e.target.value)}
                                        placeholder="Negative prompt (optional)"
                                        disabled={veoMode === "reference_to_video"}
                                        className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500"
                                      />
                                      <input
                                        type="number"
                                        min="0"
                                        value={veoSeed}
                                        onChange={(e) => setVeoSeed(e.target.value)}
                                        placeholder="Seed (optional)"
                                        disabled={veoMode === "reference_to_video"}
                                        className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500"
                                      />
                                    </div>
                                  </div>
                                )}

                              {/* 4. REFERENCE IMAGES */}
                              {activeEngine !== "kie" ||
                                videoFxMode !== "picdrift" ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                    <label
                                      className={`block text-sm font-semibold ${activeEngine === "veo" ? "text-indigo-200" : "text-white"}`}
                                    >
                                      {activeEngine === "veo"
                                        ? "Generation Inputs"
                                        : "Reference Images"}
                                    </label>
                                    {activeEngine === "veo" && (
                                      <span className="text-[9px] text-slate-500 uppercase tracking-widest font-medium">
                                        {veoMode === "first_last_frame"
                                          ? "First + Last Frames"
                                          : veoMode === "extend_video"
                                            ? "Video Extend Source"
                                            : veoMode === "reference_to_video"
                                              ? "Reference Image Stack"
                                              : "Single Image Source"}
                                      </span>
                                    )}
                                  </div>

                                  {activeEngine === "veo" ? (
                                    veoMode === "first_last_frame" ? (
                                      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                        <div className="grid grid-cols-2 gap-4">
                                          {(["first", "last"] as const).map((slot) => {
                                            const src = slot === "first" ? veoFrameUrls.first : veoFrameUrls.last;
                                            return (
                                              <div key={slot} className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                  <label className="text-xs text-indigo-200 font-semibold uppercase tracking-wider">
                                                    {slot === "first" ? "First Frame" : "Last Frame"}
                                                  </label>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setLibrarySource("field");
                                                      setActiveLibrarySlot(slot === "first" ? "start" : "end");
                                                    }}
                                                    className="text-[10px] px-2 py-1 rounded-md border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
                                                  >
                                                    Library
                                                  </button>
                                                </div>
                                                <div className="relative aspect-video bg-slate-900/60 border-2 border-dashed border-indigo-500/30 rounded-xl overflow-hidden">
                                                  {src ? (
                                                    <>
                                                      <img src={src} className="w-full h-full object-cover" />
                                                      <button
                                                        type="button"
                                                        onClick={() => removeVeoFrame(slot)}
                                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs"
                                                      >
                                                        x
                                                      </button>
                                                    </>
                                                  ) : (
                                                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer text-indigo-300 text-xs font-semibold">
                                                      Upload
                                                      <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                          const file = e.target.files?.[0];
                                                          if (!file) return;
                                                          if (isVideoFile(file)) {
                                                            alert("First/Last mode requires image frames.");
                                                            return;
                                                          }
                                                          if (file.size > MAX_VEO_IMAGE_BYTES) {
                                                            alert("Frame image must be 8MB or smaller.");
                                                            return;
                                                          }
                                                          setVeoFrame(slot, file, URL.createObjectURL(file));
                                                        }}
                                                      />
                                                    </label>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <p className="text-[10px] text-slate-500 text-center">
                                          Provide both first and last frame images.
                                        </p>
                                      </div>
                                    ) : veoMode === "reference_to_video" ? (
                                      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                        <div className="w-full border-2 border-dashed border-indigo-500/30 rounded-xl hover:border-indigo-400 hover:bg-indigo-900/10 transition-all p-4">
                                          <div className="flex items-center justify-center gap-8">
                                            <label className="cursor-pointer flex flex-col items-center group-hover:scale-105 transition-transform">
                                              <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-indigo-400/30 text-indigo-100">
                                                Upload
                                              </span>
                                              <span className="text-xs text-indigo-300 font-bold group-hover:text-white">
                                                Upload Images
                                              </span>
                                              <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                multiple
                                                onChange={handleVeoReferenceUpload}
                                              />
                                            </label>
                                            <div className="h-8 w-px bg-indigo-500/30" />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setLibrarySource("field");
                                                setActiveLibrarySlot("generic");
                                              }}
                                              className="flex flex-col items-center group-hover:scale-105 transition-transform"
                                            >
                                              <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-indigo-400/30 text-indigo-100">
                                                Library
                                              </span>
                                              <span className="text-xs text-indigo-300 font-bold group-hover:text-white">
                                                From Library
                                              </span>
                                            </button>
                                          </div>
                                          <p className="text-[10px] text-slate-500 text-center mt-3">
                                            Add up to {MAX_VEO_REFERENCE_IMAGES} image references (max 8MB each).
                                          </p>
                                        </div>
                                        {veoReferenceUrls.length > 0 && (
                                          <div className="grid grid-cols-5 gap-2 animate-in fade-in">
                                            {veoReferenceUrls.map((url, index) => (
                                              <div
                                                key={`${url}_${index}`}
                                                className="relative aspect-square group"
                                              >
                                                <img
                                                  src={url}
                                                  className="w-full h-full object-cover rounded-lg border border-indigo-500/20"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => removeVeoReference(index)}
                                                  className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                  x
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                      <div className="flex justify-between items-center">
                                        <label className="block text-sm font-semibold text-indigo-200">
                                          Source Asset
                                        </label>
                                        <span className="text-[9px] text-indigo-400/60 uppercase tracking-widest font-medium">
                                          {veoMode === "extend_video" ? "Video Source" : "Image Source"}
                                        </span>
                                      </div>

                                      <div className="w-full h-32 border-2 border-dashed border-indigo-500/30 rounded-xl hover:border-indigo-400 hover:bg-indigo-900/10 transition-all group relative flex items-center justify-center overflow-hidden">
                                        {veoSourceUrl ? (
                                          <>
                                            {veoMode === "extend_video" ? (
                                              <video
                                                src={veoSourceUrl}
                                                className="w-full h-full object-contain"
                                                muted
                                                autoPlay
                                                loop
                                              />
                                            ) : (
                                              <img
                                                src={veoSourceUrl}
                                                className="w-full h-full object-contain"
                                              />
                                            )}
                                            <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                              <button
                                                type="button"
                                                onClick={removeVeoSource}
                                                className="px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg backdrop-blur-md transition-colors"
                                              >
                                                Remove
                                              </button>
                                            </div>
                                            <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[9px] font-bold text-white uppercase tracking-wider border border-white/10">
                                              {veoMode === "extend_video"
                                                ? "Extend Video Mode"
                                                : "Image-to-Video Mode"}
                                            </div>
                                          </>
                                        ) : (
                                          <div className="flex items-center gap-8">
                                            <label className="cursor-pointer flex flex-col items-center group-hover:scale-105 transition-transform">
                                              <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-indigo-400/30 text-indigo-100">
                                                Upload
                                              </span>
                                              <span className="text-xs text-indigo-300 font-bold group-hover:text-white">
                                                Upload File
                                              </span>
                                              <input
                                                type="file"
                                                className="hidden"
                                                accept={veoMode === "extend_video" ? "video/*" : "image/*"}
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (!file) return;
                                                  const isVideo = isVideoFile(file);
                                                  if (veoMode === "extend_video" && !isVideo) {
                                                    alert("Extend mode requires a video source.");
                                                    return;
                                                  }
                                                  if (veoMode === "image_to_video" && isVideo) {
                                                    alert("Image-to-video mode requires an image source.");
                                                    return;
                                                  }
                                                  if (!isVideo && file.size > MAX_VEO_IMAGE_BYTES) {
                                                    alert("Image input must be 8MB or smaller for Video FX 3.");
                                                    return;
                                                  }
                                                  setVeoSingleSource(file, URL.createObjectURL(file));
                                                }}
                                              />
                                            </label>
                                            <div className="h-8 w-px bg-indigo-500/30"></div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setLibrarySource("field");
                                                setActiveLibrarySlot("generic");
                                              }}
                                              className="flex flex-col items-center group-hover:scale-105 transition-transform"
                                            >
                                              <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-indigo-400/30 text-indigo-100">
                                                Library
                                              </span>
                                              <span className="text-xs text-indigo-300 font-bold group-hover:text-white">
                                                From Library
                                              </span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-slate-500 text-center">
                                        {veoMode === "extend_video"
                                          ? "Upload a source video to continue it."
                                          : "Upload one image source to animate it."}
                                      </p>
                                    </div>
                                    )
                                                                    ) : isVideoFxSlotMode ? (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {(["start", "end"] as const).map((slot) => {
                                          const src =
                                            slot === "start"
                                              ? videoFxFrameUrls.start
                                              : videoFxFrameUrls.end;
                                          const label =
                                            slot === "start" ? "Start Frame" : "End Frame";
                                          const isEndLocked =
                                            slot === "end" && !videoFxFrames.start;

                                          return (
                                            <div key={slot} className="space-y-2">
                                              <div className="flex justify-between items-center">
                                                <label className="text-xs text-cyan-200 font-semibold uppercase tracking-wider">
                                                  {label}
                                                </label>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setLibrarySource("field");
                                                    setActiveLibrarySlot(
                                                      slot === "start" ? "start" : "end",
                                                    );
                                                  }}
                                                  disabled={isEndLocked}
                                                  className={`text-[10px] px-2 py-1 rounded-md border ${
                                                    isEndLocked
                                                      ? "border-gray-700 text-gray-500 cursor-not-allowed"
                                                      : "border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                                                  }`}
                                                >
                                                  Library
                                                </button>
                                              </div>
                                              <div className="relative aspect-video bg-gray-900/60 border-2 border-dashed border-cyan-500/30 rounded-xl overflow-hidden">
                                                {src ? (
                                                  <>
                                                    <img
                                                      src={src}
                                                      className="w-full h-full object-cover"
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        removeVideoFxFrame(slot)
                                                      }
                                                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs"
                                                    >
                                                      x
                                                    </button>
                                                  </>
                                                ) : (
                                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs">
                                                    <label
                                                      className={`cursor-pointer px-3 py-1.5 rounded-md border ${
                                                        isEndLocked
                                                          ? "border-gray-700 text-gray-500 cursor-not-allowed"
                                                          : "border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                                                      }`}
                                                    >
                                                      Upload
                                                      <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        disabled={isEndLocked}
                                                        onChange={(e) =>
                                                          handleVideoFxSlotUpload(
                                                            e,
                                                            slot,
                                                          )
                                                        }
                                                      />
                                                    </label>
                                                    <span className="text-[10px] text-gray-500">
                                                      {slot === "start"
                                                        ? "Required for frame-to-frame flow"
                                                        : "Optional transition target"}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      <p className="text-[10px] text-gray-500 text-center">
                                        End Frame is optional. If provided, motion transitions
                                        from Start Frame to End Frame.
                                      </p>
                                    </div>
                                  ) : isVideoFxReferenceMode ? (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                      <div className="flex justify-between items-center">
                                        <label className="text-xs text-cyan-200 font-semibold uppercase tracking-wider">
                                          Reference Inputs
                                        </label>
                                        <span className="text-[10px] text-gray-500">
                                          {getVideoFxReferenceCount()}/{getVideoFxReferenceLimit()}
                                        </span>
                                      </div>
                                      <div className="w-full border-2 border-dashed border-cyan-500/30 rounded-xl hover:border-cyan-400 hover:bg-cyan-900/10 transition-all p-4">
                                        <div className="flex items-center justify-center gap-8">
                                          <label className="cursor-pointer flex flex-col items-center transition-transform hover:scale-105">
                                            <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-100">
                                              Upload
                                            </span>
                                            <span className="text-xs text-cyan-300 font-bold">
                                              Add References
                                            </span>
                                            <input
                                              type="file"
                                              className="hidden"
                                              accept="image/*,video/*,audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                                              multiple
                                              onChange={handleVideoFxExtraUpload}
                                            />
                                          </label>
                                          <div className="h-8 w-px bg-cyan-500/30" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setLibrarySource("field");
                                              setActiveLibrarySlot("generic");
                                            }}
                                            className="flex flex-col items-center transition-transform hover:scale-105"
                                          >
                                            <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-100">
                                              Library
                                            </span>
                                            <span className="text-xs text-cyan-300 font-bold">
                                              From Library
                                            </span>
                                          </button>
                                        </div>
                                        <p className="text-[10px] text-gray-500 text-center mt-3">
                                          Mix image, video, and audio references in one request.
                                        </p>
                                      </div>
                                      {videoFxExtraUrls.length > 0 && (
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 animate-in fade-in">
                                          {videoFxExtraUrls.map((url, index) => {
                                            const file = videoFxExtraRefs[index];
                                            const name = videoFxExtraNames[index] || file?.name || "reference";
                                            const isVideo = file ? isVideoFile(file) : url.endsWith(".mp4") || url.endsWith(".mov");
                                            const isAudio = file
                                              ? isAudioFile(file)
                                              : isAudioUrl(url) || isAudioName(name);
                                            return (
                                              <div
                                                key={`${url}_${index}`}
                                                className="relative aspect-square group"
                                              >
                                                {isAudio ? (
                                                  <div className="w-full h-full rounded-lg border border-white/20 bg-gray-900/80 flex flex-col items-center justify-center p-2 text-center">
                                                    <span className="text-[10px] text-cyan-200 font-semibold uppercase">
                                                      Audio
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 truncate w-full">
                                                      {name}
                                                    </span>
                                                  </div>
                                                ) : isVideo ? (
                                                  <video
                                                    src={url}
                                                    className="w-full h-full object-cover rounded-lg border border-white/20"
                                                    muted
                                                    onMouseEnter={(e) =>
                                                      e.currentTarget.play()
                                                    }
                                                    onMouseLeave={(e) =>
                                                      e.currentTarget.pause()
                                                    }
                                                  />
                                                ) : (
                                                  <img
                                                    src={url}
                                                    className="w-full h-full object-cover rounded-lg border border-white/20"
                                                  />
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeVideoFxExtraReference(index)
                                                  }
                                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs"
                                                >
                                                  x
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ) : isVideoFxTextMode ? (
                                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-900/10 p-4 text-xs text-cyan-100">
                                      Text mode does not require references. Add prompt details for motion, camera, and scene behavior.
                                    </div>
                                  ) : (
                                    /* GENERIC UPLOAD BOX (Pic FX, Video FX 1&2) */
                                    <div className="space-y-3">
                                      <div className="w-full h-24 border-2 border-dashed border-gray-600 rounded-xl hover:border-cyan-500 hover:bg-gray-800/50 transition-all group relative flex items-center justify-center">
                                        <div className="flex items-center gap-6">
                                          <label className="cursor-pointer flex flex-col items-center group-hover:scale-105 transition-transform">
                                            <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-gray-500/40 text-gray-300">
                                              Upload
                                            </span>
                                            <span className="text-xs text-gray-400 font-bold group-hover:text-cyan-400">
                                              Upload File
                                            </span>
                                            <input
                                              type="file"
                                              className="hidden"
                                              multiple={
                                                activeEngine === "studio" ||
                                                (activeEngine === "kie" &&
                                                  videoFxMode === "video") ||
                                                activeEngine === "openai"
                                              }
                                              accept={
                                                activeEngine === "studio" ||
                                                (activeEngine === "kie" &&
                                                  videoFxMode === "video")
                                                  ? "image/*"
                                                  : "image/*,video/*"
                                              }
                                              onChange={handleGenericUpload}
                                            />
                                          </label>
                                          <div className="h-8 w-px bg-gray-600"></div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setLibrarySource("field");
                                              setActiveLibrarySlot("generic");
                                            }}
                                            className="flex flex-col items-center group-hover:scale-105 transition-transform"
                                          >
                                            <span className="text-[10px] mb-1 px-2 py-0.5 rounded border border-gray-500/40 text-gray-300">
                                              Library
                                            </span>
                                            <span className="text-xs text-gray-400 font-bold group-hover:text-cyan-400">
                                              From Library
                                            </span>
                                          </button>
                                        </div>
                                        <p className="absolute bottom-2 text-[10px] text-gray-600">
                                          {activeEngine === "studio" &&
                                            studioMode === "carousel"
                                            ? "Up to 14 images"
                                            : activeEngine === "studio"
                                              ? `Up to ${MAX_PICFX_REFERENCE_IMAGES} reference images`
                                              : activeEngine === "kie" &&
                                                  videoFxMode === "video"
                                                ? "Reference upload is managed by generation mode."
                                              : activeEngine === "openai"
                                                ? "Reference upload is managed by generation mode."
                                                : "Single frame (PNG/JPG/MP4)"}
                                        </p>
                                      </div>
                                      {referenceImageUrls.length > 0 && (
                                        <div className="grid grid-cols-5 gap-2 animate-in fade-in">
                                          {referenceImageUrls.map((url, index) => (
                                            <div
                                              key={index}
                                              className="relative aspect-square group"
                                            >
                                              {url.includes("video") ||
                                                url.endsWith(".mp4") ? (
                                                <video
                                                  src={url}
                                                  className="w-full h-full object-cover rounded-lg border border-white/20"
                                                  muted
                                                  onMouseEnter={(e) =>
                                                    e.currentTarget.play()
                                                  }
                                                  onMouseLeave={(e) =>
                                                    e.currentTarget.pause()
                                                  }
                                                />
                                              ) : (
                                                <img
                                                  src={url}
                                                  className="w-full h-full object-cover rounded-lg border border-white/20"
                                                />
                                              )}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  removeGenericImage(index)
                                                }
                                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : null}

                              {/* ✅ UPDATED GENERATE BUTTON */}
                              <button
                                type="submit"
                                disabled={
                                  (currentVisualTab === "3dx" ? driftStartMutation.isPending : generateMediaMutation.isPending) || !prompt.trim()
                                }
                                className={`w-full py-4 sm:py-5 px-6 sm:px-8 rounded-2xl transition-all disabled:opacity-50 font-bold text-base sm:text-lg flex flex-col items-center justify-center gap-1 ${activeEngine === "veo"
                                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
                                  : currentVisualTab === "3dx"
                                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg"
                                    : currentVisualTab === "picdrift"
                                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg"
                                      : currentVisualTab === "studio"
                                        ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg"
                                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg"
                                  }`}
                              >
                                {(currentVisualTab === "3dx" ? driftStartMutation.isPending : generateMediaMutation.isPending) ? (
                                  <div className="flex items-center gap-3">
                                    <LoadingSpinner size="sm" variant="light" />
                                    <span>
                                      {currentVisualTab === "3dx"
                                        ? "Extracting 3DX Path"
                                        : currentVisualTab === "picdrift"
                                          ? "Generating Drift"
                                          : currentVisualTab === "studio"
                                            ? "Painting Your Image"
                                            : "Creating Your Video"}
                                      ...
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 uppercase tracking-widest text-sm">
                                    {currentVisualTab === "3dx"
                                      ? "Generate 3DX Path"
                                      : currentVisualTab === "picdrift"
                                        ? "Generate PicDrift"
                                        : currentVisualTab === "studio"
                                          ? "Generate Image"
                                          : "Generate Video"}
                                  </div>
                                )}
                              </button>
                            </>
                          )}
                        </form>
                      </div>
                    </div>

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
                  </>
                )}
              </div>
            </div>

            <div className={`lg:w-96 ${(viewMode !== "history" && isMobile) ? 'hidden' : 'block'}`}>
              <div className="bg-gray-800/30 backdrop-blur-lg rounded-3xl border border-white/10 p-4 sm:p-6 shadow-2xl sticky top-4">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <span></span> {timelinePanelMode === "timeline" ? "Timeline" : "Storyline"}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTimelinePanelMode((prev) =>
                          prev === "timeline" ? "storyline" : "timeline",
                        )
                      }
                      className="text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-colors bg-white/5 hover:bg-white/10 text-gray-300 hover:text-cyan-300 border-white/10 hover:border-cyan-500/30"
                    >
                      {timelinePanelMode === "timeline" ? "Storyline" : "Timeline"}
                    </button>
                    {postsLoading && timelinePanelMode === "timeline" && (
                      <LoadingSpinner size="sm" variant="neon" />
                    )}
                  </div>
                </div>
                {timelinePanelMode === "timeline" ? (
                  <>
                    <div className="space-y-3 max-h-[980px] sm:max-h-[1040px] overflow-y-auto custom-scrollbar">
                      {compactTimelinePosts.length > 0 ? (
                        compactTimelinePosts.map((post: any) => (
                            <PostCard
                              key={post.id}
                              post={post}
                              onPublishPost={() =>
                                handleShowPromptInfo(post.prompt)
                              }
                              userCredits={userCredits}
                              publishingPost={null}
                              primaryColor={brandConfig?.primaryColor}
                              compact={true}
                              onTitleUpdated={(title) =>
                                handleTimelineTitleUpdate(post.id, title)
                              }
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
                                  } catch (e) { }
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
                                (async () => {
                                  if (
                                    await confirmAction(
                                      "Are you sure you want to delete this post?",
                                      { confirmLabel: "Delete" },
                                    )
                                  ) {
                                    deletePostMutation.mutate(post.id);
                                  }
                                })();
                              }}
                              onAddToSequence={() => handleAddToSequence(post)}
                            />
                          ))
                      ) : !postsLoading ? (
                        <div className="text-center py-8">
                          <div className="text-purple-300 text-sm mb-3">
                            No content yet
                          </div>
                          <div className="text-4xl mb-2"></div>
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
                  </>
                ) : (
                  <div className="space-y-3 max-h-[980px] sm:max-h-[1040px] overflow-y-auto custom-scrollbar">
                    {storylineSequence.length > 0 ? (
                      storylineSequence.map((item, index) => {
                        const storylinePost = buildStorylinePost(item, index);
                        return (
                        <div key={`${item.id}-${index}`} className="space-y-2">
                          <PostCard
                            post={storylinePost}
                            onPublishPost={() =>
                              handleShowPromptInfo(
                                storylinePost.prompt || "No prompt available.",
                              )
                            }
                            userCredits={userCredits}
                            publishingPost={null}
                            primaryColor={brandConfig?.primaryColor}
                            compact={true}
                            onTitleUpdated={(title) =>
                              handleStorylineTitleUpdate(
                                item.id,
                                storylinePost.sourcePostId,
                                title,
                              )
                            }
                            onPrimaryAction={() => handleUseStorylineInPanel(item)}
                            primaryActionLabel="Use In Panel"
                            onDrift={
                              storylinePost.mediaType === "VIDEO"
                                ? () =>
                                    setExtractingVideoUrl(
                                      storylinePost.mediaUrl || item.sourceMediaUrl || item.url,
                                    )
                                : undefined
                            }
                            onPreview={() => {
                              let previewType: "image" | "video" | "carousel" =
                                "image";
                              if (storylinePost.mediaType === "VIDEO") previewType = "video";
                              if (storylinePost.mediaType === "CAROUSEL") previewType = "carousel";
                              let previewUrl: string | string[] =
                                storylinePost.mediaUrl || item.sourceMediaUrl || item.url;
                              if (
                                previewType === "carousel" &&
                                typeof previewUrl === "string"
                              ) {
                                try {
                                  previewUrl = JSON.parse(previewUrl);
                                } catch {
                                  previewUrl = item.url;
                                }
                              }
                              setPreviewMedia({
                                type: previewType,
                                url: previewUrl,
                              });
                            }}
                          />
                          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-white/10 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                                <span className="uppercase tracking-wider">
                                  Position {index + 1}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => moveStorylineItem(index, -1)}
                                  disabled={index === 0}
                                  className="px-3 h-8 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Move Up"
                                >
                                  Move Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStorylineItem(index, 1)}
                                  disabled={index === storylineSequence.length - 1}
                                  className="px-3 h-8 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Move Down"
                                >
                                  Move Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeStorylineItem(index)}
                                  className="px-3 h-8 text-[11px] rounded-lg bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300"
                                  title="Remove"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-10">
                        <div className="text-cyan-300 text-sm mb-2">
                          Storyline is empty
                        </div>
                        <div className="text-xs text-gray-500">
                          Use Timeline + button to add clips here.
                        </div>
                      </div>
                    )}
                    <div className="pt-2 border-t border-white/10 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLibrarySource("field");
                          setActiveLibrarySlot("storyline");
                        }}
                        className="flex-1 text-xs px-3 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 font-semibold transition-colors"
                      >
                        + Add Media
                      </button>
                      <button
                        type="button"
                        onClick={() => setStorylineSequence([])}
                        className="px-3 py-2 text-xs rounded-lg border border-red-500/30 text-red-300 bg-red-500/10 hover:bg-red-500/20 font-semibold transition-colors"
                      >
                        Clear
                      </button>
                    </div>
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
          {(editingAsset || showEditorModal) && (
            <EditAssetModal
              asset={editingAsset || undefined}
              initialTab={showEditorModal ? "drift" : undefined}
              initialVideoUrl={editingVideoUrl}
              onClose={() => {
                setEditingAsset(null);
                setShowEditorModal(false);
                setEditingVideoUrl(undefined); // Reset
              }}
            />
          )}
          </div>
      </div>
    </div>
  );
}

export default Dashboard;

