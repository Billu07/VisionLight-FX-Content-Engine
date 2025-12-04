// frontend/src/hooks/usePosts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";

export const usePosts = () => {
  return useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const response = await apiEndpoints.getPosts();
      return response.data.posts;
    },
  });
};

export const useGenerateScript = () => {
  return useMutation({
    mutationFn: async (data: { prompt: string; mediaType: string }) => {
      const response = await apiEndpoints.generateScript(data);
      return response.data;
    },
  });
};

export const useCreatePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      prompt: string;
      mediaType: string; // Add this required field
      script?: any; // Make script optional
      platform?: string;
    }) => {
      const response = await apiEndpoints.createPost(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
};

export const useGenerateMedia = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId }: { postId: string; provider: string }) => {
      const response = await apiEndpoints.generateMedia(postId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-credits"] });
    },
  });
};
