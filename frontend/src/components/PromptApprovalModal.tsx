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
  generationParams?: any;
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

  // Track which version user is viewing/editing
  const [selectedVersion, setSelectedVersion] = useState<
    "enhanced" | "original"
  >("enhanced");

  // Text states
  const [enhancedText, setEnhancedText] = useState("");
  const [originalText, setOriginalText] = useState("");

  // Edit mode for enhanced prompt (to toggle between pretty view and raw edit)
  const [isEditingEnhanced, setIsEditingEnhanced] = useState(false);

  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch post data
  useEffect(() => {
    const fetchPostData = async () => {
      if (isOpen && postId) {
        setIsLoadingPost(true);
        try {
          const response = await apiEndpoints.getPost(postId);
          const post = response.data.post;

          setPostData(post);
          setEnhancedText(post.enhancedPrompt || "");
          setOriginalText(post.prompt || "");
          setSelectedVersion(post.enhancedPrompt ? "enhanced" : "original");
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
    // Send whichever version is currently selected
    const textToSend =
      selectedVersion === "enhanced" ? enhancedText : originalText;
    onApprove(textToSend);
  };

  const handleCancel = async () => {
    if (!postId) return;
    setIsCancelling(true);
    try {
      await apiEndpoints.cancelPrompt(postId);
      if (onCancel) onCancel(postId);
      onClose();
    } catch (error) {
      console.error("Error cancelling:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  // --- Helper: Structured Prompt Parser ---
  // Transforms the raw AI text (with ** and \n) into a nice UI
  const renderStructuredPrompt = (text: string) => {
    if (!text)
      return (
        <p className="text-gray-500 italic">No prompt content available.</p>
      );

    // 1. Split by double newlines to find major blocks
    const sections = text.split(/\n\n+/);

    return (
      <div className="space-y-4 text-sm text-gray-300">
        {sections.map((section, idx) => {
          // Check if this line looks like a header (starts with ** or numbered list)
          const isHeader =
            section.trim().startsWith("**") || /^\d+\./.test(section);

          // Clean up asterisks for display
          const cleanText = section.replace(/\*\*/g, "").trim();

          if (isHeader) {
            // Split title from content if they are on the same line or separated by colon
            const [title, ...rest] = cleanText.split(":");
            const body = rest.join(":").trim();

            return (
              <div
                key={idx}
                className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50"
              >
                <h4 className="text-indigo-300 font-bold uppercase text-xs tracking-wider mb-1">
                  {title}
                </h4>
                {body && <p className="leading-relaxed">{body}</p>}
              </div>
            );
          } else {
            // Regular paragraph
            return (
              <p
                key={idx}
                className="leading-relaxed bg-slate-900/30 p-2 rounded"
              >
                {cleanText}
              </p>
            );
          }
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm px-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>✨</span> Review Plan
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Choose the best prompt for your generation.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-lg"
              disabled={isLoading || isCancelling}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-950/50">
          {isLoadingPost ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner size="lg" variant="neon" />
              <span className="ml-3 text-slate-400">
                Loading prompt details...
              </span>
            </div>
          ) : (
            postData && (
              <div className="space-y-6">
                {/* 1. Version Switcher Tabs (Solid Colors) */}
                <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800">
                  <button
                    onClick={() => {
                      setSelectedVersion("enhanced");
                      setIsEditingEnhanced(false);
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                      selectedVersion === "enhanced"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    <span>✨</span> AI Enhanced
                  </button>
                  <button
                    onClick={() => setSelectedVersion("original")}
                    className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                      selectedVersion === "original"
                        ? "bg-slate-700 text-white shadow-md"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    <span>📝</span> Original
                  </button>
                </div>

                {/* 2. Content Display Area */}
                <div className="relative">
                  {selectedVersion === "enhanced" ? (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                          {isEditingEnhanced
                            ? "Editing Raw Text"
                            : "Structured Preview"}
                        </span>
                        <button
                          onClick={() =>
                            setIsEditingEnhanced(!isEditingEnhanced)
                          }
                          className="text-xs text-slate-400 hover:text-white underline underline-offset-2"
                        >
                          {isEditingEnhanced
                            ? "View formatted"
                            : "Edit raw text"}
                        </button>
                      </div>

                      {isEditingEnhanced ? (
                        <textarea
                          value={enhancedText}
                          onChange={(e) => setEnhancedText(e.target.value)}
                          className="w-full h-64 p-4 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none text-slate-200 text-sm leading-relaxed font-mono"
                          disabled={isLoading || isCancelling}
                        />
                      ) : (
                        <div className="h-64 overflow-y-auto custom-scrollbar pr-2 border border-transparent">
                          {renderStructuredPrompt(enhancedText)}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Original Version View
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="mb-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Raw Input
                        </span>
                      </div>
                      <textarea
                        value={originalText}
                        onChange={(e) => setOriginalText(e.target.value)}
                        className="w-full h-64 p-4 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-slate-500 transition-all resize-none text-slate-200 text-sm leading-relaxed"
                        disabled={isLoading || isCancelling}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-900">
          <div className="flex justify-between gap-3 items-center">
            <button
              onClick={handleCancel}
              disabled={isLoading || isLoadingPost || isCancelling}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isCancelling ? "Cancelling..." : "Cancel"}
            </button>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-all text-sm"
                disabled={isLoading || isLoadingPost || isCancelling}
              >
                Back
              </button>

              <button
                onClick={handleApprove}
                disabled={
                  isLoading ||
                  isLoadingPost ||
                  isCancelling ||
                  (selectedVersion === "enhanced"
                    ? !enhancedText.trim()
                    : !originalText.trim())
                }
                className={`px-6 py-2.5 rounded-lg font-bold text-white shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm ${
                  selectedVersion === "enhanced"
                    ? "bg-indigo-600 hover:bg-indigo-500"
                    : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" variant="light" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>
                      Generate{" "}
                      {selectedVersion === "enhanced" ? "Enhanced" : "Original"}
                    </span>
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
