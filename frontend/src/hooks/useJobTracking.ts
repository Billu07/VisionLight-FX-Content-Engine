import { useQuery } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";

export interface JobStatus {
  postId: string;
  status: "queued" | "processing" | "completed" | "failed" | "timeout";
  progress: number;
  error?: string;
  startedAt: string;
  updatedAt: string;
  estimatedCompletion: string;
  mediaType: string;
  phase: string;
  lastPhaseUpdate: string;
}

export const useJobTracking = (postId: string | null) => {
  return useQuery({
    queryKey: ["job-status", postId],
    queryFn: async () => {
      if (!postId) return null;

      try {
        // Use the new getPostStatus endpoint instead of getJobStatus
        const response = await apiEndpoints.getPostStatus(postId);
        return response.data;
      } catch (error: any) {
        console.error("Job status fetch error:", error);
        if (error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!postId,
    refetchInterval: (query) => {
      const data = query.state.data;

      // Check post status instead of job status
      if (data?.post?.status === "PROCESSING" || data?.post?.status === "NEW") {
        return 5000;
      }

      // Stop polling when post is ready or completed
      if (
        data?.post?.status === "READY" ||
        data?.post?.status === "COMPLETED" ||
        data?.post?.status === "FAILED"
      ) {
        return false;
      }

      return false;
    },
    staleTime: 0,
  });
};
