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
      queryClient.invalidateQueries({ queryKey: ["brand-config"] });
    },
  });
};
