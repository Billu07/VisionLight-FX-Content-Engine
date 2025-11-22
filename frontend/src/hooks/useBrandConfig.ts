// frontend/src/hooks/useBrandConfig.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";

export interface BrandConfig {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

export const useBrandConfig = () => {
  return useQuery({
    queryKey: ["brand-config"],
    queryFn: async () => {
      const response = await apiEndpoints.getBrandConfig();
      return response.data.config;
    },
    staleTime: 0, // Always consider stale
  });
};

export const useUpdateBrandConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<BrandConfig>) => {
      const response = await apiEndpoints.updateBrandConfig(config);
      return response.data;
    },
    onSuccess: () => {
      // Aggressive cache invalidation
      queryClient.invalidateQueries({ queryKey: ["brand-config"] });
      queryClient.removeQueries({ queryKey: ["brand-config"] });

      // Force refetch
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["brand-config"] });
      }, 100);
    },
    onError: (error) => {
      console.error("Failed to update brand config:", error);
    },
  });
};
