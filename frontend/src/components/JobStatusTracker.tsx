// frontend/src/components/JobStatusTracker.tsx
import React from "react";
import { useJobTracking } from "../hooks/useJobTracking";
import { LoadingSpinner } from "./LoadingSpinner";

interface JobStatusTrackerProps {
  postId: string;
  mediaType: string;
  onCompletion?: () => void;
  onError?: (error: string) => void;
}

export const JobStatusTracker: React.FC<JobStatusTrackerProps> = ({
  postId,
  mediaType,
  onCompletion,
  onError,
}) => {
  const { data: jobStatus, isLoading, error } = useJobTracking(postId);

  // Handle completion and error callbacks
  React.useEffect(() => {
    if (jobStatus?.job?.status === "completed") {
      onCompletion?.();
    } else if (
      jobStatus?.job?.status === "failed" ||
      jobStatus?.job?.status === "timeout"
    ) {
      onError?.(jobStatus.job.error || "Generation failed");
    }
  }, [jobStatus?.job?.status, jobStatus?.job?.error, onCompletion, onError]);

  if (isLoading) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 border border-white/10">
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" variant="neon" />
          <span className="text-purple-300 text-sm">Loading status...</span>
        </div>
      </div>
    );
  }

  if (error || !jobStatus?.job) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 border border-yellow-500/20">
        <p className="text-yellow-400 text-sm">
          {error ? "Failed to load job status" : "Job status not available"}
        </p>
      </div>
    );
  }

  const { job, post } = jobStatus;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued":
        return "text-yellow-400";
      case "processing":
        return "text-blue-400";
      case "completed":
        return "text-green-400";
      case "failed":
      case "timeout":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "queued":
        return "⏳";
      case "processing":
        return "🔄";
      case "completed":
        return "✅";
      case "failed":
      case "timeout":
        return "❌";
      default:
        return "❓";
    }
  };

  // Calculate time elapsed
  const timeElapsed = Math.floor(
    (Date.now() - new Date(job.startedAt).getTime()) / 1000
  );
  const minutes = Math.floor(timeElapsed / 60);
  const seconds = timeElapsed % 60;

  // Calculate time remaining
  const timeRemaining =
    job.status === "completed"
      ? 0
      : Math.max(
          0,
          Math.floor(
            (new Date(job.estimatedCompletion).getTime() - Date.now()) / 1000
          )
        );
  const remainingMinutes = Math.floor(timeRemaining / 60);
  const remainingSeconds = timeRemaining % 60;

  return (
    <div className="bg-gray-800/50 rounded-xl p-5 border border-white/10 backdrop-blur-sm animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{getStatusIcon(job.status)}</span>
          <div>
            <h3 className={`font-semibold ${getStatusColor(job.status)}`}>
              {job.phase}
            </h3>
            <p className="text-purple-300 text-sm capitalize">
              {mediaType} Generation • {job.status}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-cyan-400 font-mono text-sm">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
          <div className="text-purple-400 text-xs">Time elapsed</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-purple-300 mb-2">
          <span>Progress</span>
          <span>{job.progress}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Status Details */}
      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
        <div>
          <div className="text-purple-400">Status</div>
          <div className={`capitalize ${getStatusColor(job.status)}`}>
            {job.status}
          </div>
        </div>
        <div>
          <div className="text-purple-400">
            {job.status === "completed" ? "Completed" : "Est. Time Left"}
          </div>
          <div className="text-cyan-400">
            {job.status === "completed"
              ? "Now"
              : `${remainingMinutes}:${remainingSeconds
                  .toString()
                  .padStart(2, "0")}`}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {job.error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{job.error}</p>
        </div>
      )}

      {/* Media Preview when ready */}
      {post?.mediaUrl && job.status === "completed" && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-green-400 text-sm mb-2 flex items-center gap-2">
            <span>✅</span>
            Your {mediaType} is ready!
          </p>
          {mediaType === "video" ? (
            <video
              src={post.mediaUrl}
              controls
              className="w-full rounded-lg max-h-48 object-cover mt-2"
              preload="metadata"
            />
          ) : (
            <img
              src={post.mediaUrl}
              alt="Generated content"
              className="w-full rounded-lg max-h-48 object-cover mt-2"
            />
          )}
        </div>
      )}

      {/* Processing Animation */}
      {(job.status === "queued" || job.status === "processing") && (
        <div className="flex items-center gap-2 mt-3 text-xs text-purple-300">
          <div className="flex gap-1">
            <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce"></div>
            <div
              className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.1s" }}
            ></div>
            <div
              className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
          </div>
          <span>AI is working on your creation...</span>
        </div>
      )}
    </div>
  );
};
