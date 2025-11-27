// frontend/src/hooks/useJobTracking.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["job-status", postId],
    queryFn: async () => {
      if (!postId) return null;

      try {
        const response = await apiEndpoints.getJobStatus(postId);
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

      if (
        data?.job?.status === "queued" ||
        data?.job?.status === "processing"
      ) {
        return 5000;
      }

      if (
        data?.job?.status === "completed" &&
        Date.now() - new Date(data.job.updatedAt).getTime() < 30000
      ) {
        return 10000;
      }

      return false;
    },
    staleTime: 0,
  });
};
