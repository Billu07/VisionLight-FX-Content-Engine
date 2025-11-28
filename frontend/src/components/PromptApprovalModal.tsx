// frontend/src/components/PromptApprovalModal.tsx
import { useState, useEffect } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints } from "../lib/api";

interface PromptApprovalModalProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (finalPrompt: string) => void;
  onCancel?: (postId: string) => void;
  isLoading?: boolean;
}

interface PostData {
  id: string;
  prompt: string;
  enhancedPrompt: string;
  imageReference: string;
  userEditedPrompt: string;
  generationStep: string;
  requiresApproval: boolean;
  mediaType: string;
  status: string;
  progress?: number; // Added progress field
  generationParams?: any;
  createdAt: string;
}

export const PromptApprovalModal: React.FC<PromptApprovalModalProps> = ({
  postId,
  isOpen,
  onClose,
  onApprove,
  onCancel,
  isLoading = false,
}) => {
  const [postData, setPostData] = useState<PostData | null>(null);
  const [finalPrompt, setFinalPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch post data when modal opens
  useEffect(() => {
    const fetchPostData = async () => {
      if (isOpen && postId) {
        setIsLoadingPost(true);
        try {
          const response = await apiEndpoints.getPost(postId);
          const post = response.data.post;

          setPostData(post);
          setFinalPrompt(post.enhancedPrompt || ""); // Start with enhanced prompt
        } catch (error) {
          console.error("Error fetching post data:", error);
        } finally {
          setIsLoadingPost(false);
        }
      }
    };

    fetchPostData();
  }, [isOpen, postId]);

  const handleApprove = () => {
    onApprove(finalPrompt);
  };

  const handleCancel = async () => {
    if (!postId) return;

    setIsCancelling(true);
    try {
      // Call the cancellation endpoint
      await apiEndpoints.cancelPrompt(postId);

      // Notify parent component
      if (onCancel) {
        onCancel(postId);
      }

      onClose();
    } catch (error) {
      console.error("Error cancelling prompt:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Save changes
      setFinalPrompt(finalPrompt);
    }
    setIsEditing(!isEditing);
  };

  const formatGenerationParams = (params: any) => {
    if (!params) return null;

    return [
      params.aspectRatio && `Aspect Ratio: ${params.aspectRatio}`,
      params.size && `Size: ${params.size}`,
      params.model && `Model: ${params.model}`,
      params.duration && `Duration: ${params.duration}s`,
      params.imageReference && `Reference Image: ✅ Included`,
    ].filter(Boolean);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-gray-900 rounded-2xl border border-cyan-400/40 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">
                Review Your Prompt
              </h2>
              <p className="text-purple-300 text-sm mt-1">
                AI has enhanced your prompt. Review and edit if needed.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled={isLoading || isCancelling}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {isLoadingPost ? (
            <div className="flex justify-center items-center py-8">
              <LoadingSpinner size="lg" variant="neon" />
              <span className="ml-3 text-purple-300">
                Loading prompt data...
              </span>
            </div>
          ) : (
            postData && (
              <>
                {/* Generation Parameters */}
                {postData.generationParams && (
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-white mb-2">
                      ⚙️ Your Generation Settings
                    </label>
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-purple-400/30">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {formatGenerationParams(postData.generationParams)?.map(
                          (param, index) => (
                            <div key={index} className="text-purple-200">
                              {param}
                            </div>
                          )
                        )}
                      </div>
                      <div className="text-xs text-purple-400 mt-2">
                        These settings will be used for final generation
                      </div>
                    </div>
                  </div>
                )}

                {/* Original Prompt */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-white mb-2">
                    Your Original Idea
                  </label>
                  <div className="p-4 bg-gray-800/50 rounded-lg border border-white/10 text-purple-200">
                    {postData.prompt || "No original prompt available"}
                  </div>
                </div>

                {/* Enhanced Prompt */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-white">
                      AI-Enhanced Prompt
                    </label>
                    <button
                      onClick={handleEditToggle}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                        isEditing
                          ? "bg-cyan-500 text-white"
                          : "bg-gray-700 text-purple-300 hover:bg-gray-600"
                      }`}
                      disabled={isLoading || isCancelling}
                    >
                      {isEditing ? "Save" : "Edit"}
                    </button>
                  </div>

                  {isEditing ? (
                    <textarea
                      value={finalPrompt}
                      onChange={(e) => setFinalPrompt(e.target.value)}
                      className="w-full p-4 bg-gray-800/50 border border-cyan-400/30 rounded-lg focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-purple-300/60 resize-none"
                      rows={6}
                      placeholder="Edit the enhanced prompt..."
                      disabled={isLoading || isCancelling}
                    />
                  ) : (
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-cyan-400/30 text-cyan-100">
                      {postData.enhancedPrompt ||
                        "No enhanced prompt available yet..."}
                    </div>
                  )}
                </div>

                {/* Image Reference (if available) */}
                {postData.imageReference && (
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-white mb-2">
                      🎨 Image Reference for Sora
                    </label>
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-purple-400/30 text-purple-200 text-sm">
                      {postData.imageReference}
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-gray-900/50">
          <div className="flex justify-between gap-3">
            <button
              onClick={handleCancel}
              disabled={isLoading || isLoadingPost || isCancelling}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCancelling ? (
                <>
                  <LoadingSpinner size="sm" variant="light" />
                  Cancelling...
                </>
              ) : (
                <>
                  <span>❌</span>
                  Cancel Generation
                </>
              )}
            </button>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-all"
                disabled={isLoading || isLoadingPost || isCancelling}
              >
                Close
              </button>
              <button
                onClick={handleApprove}
                disabled={
                  isLoading ||
                  !finalPrompt.trim() ||
                  isLoadingPost ||
                  isCancelling
                }
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" variant="light" />
                    Starting Generation...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Approve & Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
