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

function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [selectedMediaType, setSelectedMediaType] = useState<
    "video" | "image" | "carousel"
  >("image");
  const [result, setResult] = useState<any>(null);
  const [generatingMedia, setGeneratingMedia] = useState<
    Record<string, string>
  >({});
  const [publishingPost, setPublishingPost] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

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

  // === Fetch Brand Config ===
  const { data: brandConfig } = useQuery({
    queryKey: ["brand-config"],
    queryFn: async () => {
      const response = await apiEndpoints.getBrandConfig();
      return response.data.config;
    },
    enabled: !!user,
  });

  // === Fetch Posts ===
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
  });

  // === Fetch User Credits ===
  const {
    data: userCredits = { sora: 0, gemini: 0, bannerbear: 0 },
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
    isLoading: roiLoading,
  } = useQuery({
    queryKey: ["roi-metrics"],
    queryFn: async () => {
      const response = await apiEndpoints.getROIMetrics();
      return response.data.metrics;
    },
    enabled: !!user,
  });

  // === Generate Script Mutation ===
  const generateMutation = useMutation({
    mutationFn: (data: { prompt: string; mediaType: string }) =>
      apiEndpoints.generateScript(data),
    onMutate: () => {
      setResult(null);
    },
    onSuccess: (data) => {
      setResult(data.data.script);
    },
  });

  // === Save Post Mutation ===
  const saveMutation = useMutation({
    mutationFn: (data: { prompt: string; script: any }) =>
      apiEndpoints.createPost({
        prompt: data.prompt,
        script: data.script,
        platform: "INSTAGRAM",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["roi-metrics"] });
      setResult(null);
      setPrompt("");
    },
  });

  // === Generate Media Mutation ===
  const generateMediaMutation = useMutation({
    mutationFn: ({ postId, provider }: { postId: string; provider: string }) =>
      apiEndpoints.generateMedia(postId, provider),
    onMutate: ({ postId, provider }) => {
      setGeneratingMedia((prev) => ({ ...prev, [postId]: provider }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      queryClient.invalidateQueries({ queryKey: ["roi-metrics"] });
    },
    onSettled: (_data, _error, { postId }) => {
      setGeneratingMedia((prev) => {
        const newState = { ...prev };
        delete newState[postId];
        return newState;
      });
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

  const generateMedia = (postId: string, provider: string) => {
    generateMediaMutation.mutate({ postId, provider });
  };

  const publishPost = (postId: string, platform: string = "INSTAGRAM") => {
    publishMutation.mutate({ postId, platform });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    generateMutation.mutate({ prompt, mediaType: selectedMediaType });
  };

  const handleSave = () => {
    if (!result) return;
    saveMutation.mutate({ prompt, script: result });
  };

  const handleRetryPosts = () => {
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  };

  const handleRetryCredits = () => {
    queryClient.invalidateQueries({ queryKey: ["user-credits"] });
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Apply brand colors dynamically
  const primaryColor = brandConfig?.primaryColor || "#3B82F6";
  const secondaryColor = brandConfig?.secondaryColor || "#1E40AF";
  const companyName = brandConfig?.companyName || "Visionlight AI";

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative">
            <LoadingSpinner size="lg" />
            <div className="absolute inset-0 animate-ping">
              <LoadingSpinner size="lg" />
            </div>
          </div>
          <p className="mt-6 text-gray-600 text-lg font-medium">
            Loading your creative studio...
          </p>
          <p className="mt-2 text-gray-400 text-sm">
            Preparing your AI content dashboard
          </p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Welcome Tour */}
      {showWelcomeTour && (
        <WelcomeTour onClose={() => setShowWelcomeTour(false)} />
      )}

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header with Branding & User Info */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <h1
              className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 leading-tight"
              style={{ color: primaryColor }}
            >
              {companyName}
            </h1>
            <p className="text-gray-600 text-lg">
              Welcome back,{" "}
              <span className="font-semibold text-gray-800">
                {user.name || user.email}
              </span>
              ! 👋
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowBrandModal(true)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-white transition-all duration-200 font-medium flex items-center gap-2 text-sm"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              <span>🎨</span>
              Brand Settings
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 border border-gray-300 bg-white rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium text-gray-700 text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* ROI Metrics Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Content Created",
              value: roiMetrics.postsCreated,
              subtitle: "Posts Generated",
              icon: "📝",
            },
            {
              label: "Time Saved",
              value: `${Math.floor(roiMetrics.timeSaved / 60)}h`,
              subtitle: "Estimated",
              icon: "⏱️",
            },
            {
              label: "Media Generated",
              value: roiMetrics.mediaGenerated,
              subtitle: "Videos & Images",
              icon: "🎬",
            },
          ].map((metric, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{metric.icon}</span>
                {roiLoading && <LoadingSpinner size="sm" />}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {metric.label}
              </h3>
              <p
                className="text-3xl font-bold mb-1"
                style={{ color: primaryColor }}
              >
                {metric.value}
              </p>
              <p className="text-sm text-gray-500">{metric.subtitle}</p>
            </div>
          ))}
        </div>

        {/* Demo Credits */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Your Demo Credits
            </h2>
            <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">
              {Object.values(userCredits).reduce((a, b) => a + b, 0)} remaining
            </div>
          </div>
          {creditsLoading ? (
            <div className="flex items-center gap-3 text-gray-600 bg-white rounded-2xl p-4">
              <LoadingSpinner size="sm" />
              <span>Loading your credits...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  key: "sora",
                  label: "Sora Video",
                  icon: "🎬",
                  description: "15-second AI video",
                },
                {
                  key: "gemini",
                  label: "Gemini Image",
                  icon: "🖼️",
                  description: "AI-generated image",
                },
                {
                  key: "bannerbear",
                  label: "Bannerbear Carousel",
                  icon: "🎪",
                  description: "4-slide carousel",
                },
              ].map((credit) => (
                <div
                  key={credit.key}
                  className="bg-white rounded-xl p-4 border-2 transition-all duration-200 hover:scale-105"
                  style={{
                    borderColor:
                      userCredits[credit.key as keyof typeof userCredits] > 0
                        ? primaryColor
                        : "#E5E7EB",
                    opacity:
                      userCredits[credit.key as keyof typeof userCredits] > 0
                        ? 1
                        : 0.6,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">{credit.icon}</span>
                    <span
                      className={`text-sm font-semibold px-2 py-1 rounded-full ${
                        userCredits[credit.key as keyof typeof userCredits] > 0
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {userCredits[credit.key as keyof typeof userCredits]} left
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm mb-1">
                    {credit.label}
                  </h3>
                  <p className="text-xs text-gray-500">{credit.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prompt Form with Media Type Selection */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-2 h-6 rounded-full"
              style={{ backgroundColor: primaryColor }}
            ></div>
            <h2 className="text-xl font-semibold text-gray-900">
              Create New Content
            </h2>
          </div>

          {/* Media Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              🎬 Select Media Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  type: "video" as const,
                  label: "Sora Video",
                  icon: "🎬",
                  description: "15-second AI video",
                },
                {
                  type: "image" as const,
                  label: "Gemini Image",
                  icon: "🖼️",
                  description: "AI-generated image",
                },
                {
                  type: "carousel" as const,
                  label: "Bannerbear Carousel",
                  icon: "🎪",
                  description: "4-slide carousel",
                },
              ].map(({ type, label, icon, description }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedMediaType(type)}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                    selectedMediaType === type
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                  style={{
                    borderColor:
                      selectedMediaType === type ? primaryColor : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 text-sm">
                        {label}
                      </div>
                      <div className="text-xs text-gray-500">{description}</div>
                    </div>
                    {selectedMediaType === type && (
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                <span className="flex items-center gap-2">
                  💡 Your Creative Prompt
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    Required
                  </span>
                </span>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`Describe your ${selectedMediaType}... e.g., "A happy couple on vacation at sunset" or "Tech team collaborating in modern office"`}
                className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-2">
                Be specific! The AI will create a detailed script optimized for{" "}
                {selectedMediaType} creation.
              </p>
            </div>

            <button
              type="submit"
              disabled={generateMutation.isPending || !prompt.trim()}
              className="w-full text-white py-4 px-6 rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold text-lg flex items-center justify-center gap-3"
              style={{
                backgroundColor: primaryColor,
                transform:
                  generateMutation.isPending || !prompt.trim()
                    ? "none"
                    : "translateY(-2px)",
              }}
            >
              {generateMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Generating {selectedMediaType} Script...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>
                    Generate{" "}
                    {selectedMediaType.charAt(0).toUpperCase() +
                      selectedMediaType.slice(1)}{" "}
                    Script
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Generate Script Error */}
        {generateMutation.isError && (
          <ErrorAlert
            message={generateMutation.error.message}
            onRetry={() =>
              generateMutation.mutate({ prompt, mediaType: selectedMediaType })
            }
            type="error"
          />
        )}

        {/* Generated Script */}
        {result && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <span>🎭</span>
                Generated{" "}
                {result.mediaType?.charAt(0).toUpperCase() +
                  result.mediaType?.slice(1)}{" "}
                Script
              </h2>
              <div className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full font-medium">
                Ready to Save
              </div>
            </div>

            <div className="space-y-6 mb-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <span>📝</span>
                  Caption Lines
                </h3>
                <div className="space-y-3">
                  {result.caption.map((line: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <span className="text-xs bg-white border border-gray-300 rounded px-2 py-1 font-mono text-gray-600 mt-1 flex-shrink-0">
                        {i + 1}
                      </span>
                      <p className="text-gray-800 leading-relaxed">{line}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <span>🎯</span>
                  Call-to-Action
                </h3>
                <div
                  className="p-4 rounded-lg border-2 font-medium"
                  style={{
                    backgroundColor: `${primaryColor}10`,
                    borderColor: primaryColor,
                    color: primaryColor,
                  }}
                >
                  {result.cta}
                </div>
              </div>

              {result.imageReference && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <span>🎨</span>
                    AI Visual Reference
                  </h3>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800 leading-relaxed">
                      {result.imageReference}
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      This detailed description will be used to generate your{" "}
                      {result.mediaType} with AI.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full bg-green-600 text-white py-4 px-6 rounded-xl hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-semibold text-lg flex items-center justify-center gap-3"
            >
              {saveMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Saving Post...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Save as Post</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Save Post Error */}
        {saveMutation.isError && (
          <ErrorAlert
            message={saveMutation.error.message}
            onRetry={handleSave}
            type="error"
          />
        )}

        {/* Generate Media Error */}
        {generateMediaMutation.isError && (
          <ErrorAlert
            message={generateMediaMutation.error.message}
            type="error"
          />
        )}

        {/* Publish Post Error */}
        {publishMutation.isError && (
          <ErrorAlert message={publishMutation.error.message} type="error" />
        )}

        {/* Saved Posts Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <span>📚</span>
              Your Content Library
            </h2>
            {postsLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <LoadingSpinner size="sm" />
                <span>Loading posts...</span>
              </div>
            )}
          </div>

          {postsError ? (
            <ErrorAlert
              message="Failed to load your content"
              onRetry={handleRetryPosts}
              type="error"
            />
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No content yet
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                Start by generating your first AI script above. Your created
                posts will appear here ready for media generation.
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {posts.map((post: any) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onGenerateMedia={generateMedia}
                  onPublishPost={publishPost}
                  generatingMedia={generatingMedia}
                  publishingPost={publishingPost}
                  userCredits={userCredits}
                  primaryColor={primaryColor}
                />
              ))}
            </div>
          )}
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
