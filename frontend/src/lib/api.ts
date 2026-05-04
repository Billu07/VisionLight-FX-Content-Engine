import axios from "axios";
import type { AxiosProgressEvent } from "axios";

const RAW_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const API_BASE_URL = RAW_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
const IMPERSONATE_USER_ID_KEY = "visionlight_impersonate_user_id";
const IMPERSONATE_USER_LABEL_KEY = "visionlight_impersonate_user_label";
const ACTIVE_PROFILE_ID_KEY = "visionlight_active_profile_id";
const ACTIVE_PROFILE_LABEL_KEY = "visionlight_active_profile_label";

console.log("API Base URL:", API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000,
});

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || "Error";
    if (error.response?.status !== 404 && error.code !== "ERR_CANCELED") {
      console.error("API Error:", {
        url: error.config?.url,
        status: error.response?.status,
      });
    }
    const wrappedError: any = new Error(message);
    wrappedError.status = error.response?.status;
    wrappedError.url = error.config?.url;
    return Promise.reject(wrappedError);
  },
);

export const apiEndpoints = {
  // === Auth ===
  getMe: () => api.get("/api/auth/me"),
  resolveAuthDomain: (email: string) =>
    api.post("/api/auth/resolve-domain", { email }),
  adminCreateUser: (data: any) => api.post("/api/admin/create-user", data),
  adminGetUsers: () => api.get("/api/admin/users"),
  adminUpdateUser: (userId: string, data: any) =>
    api.put(`/api/admin/users/${userId}`, data),
  adminDeleteUser: (userId: string) => api.delete(`/api/admin/users/${userId}`),

  // === SuperAdmin (Platform Control) ===
  superadminGetOrganizations: () => api.get("/api/superadmin/organizations"),
  superadminCreateTenant: (data: any) => api.post("/api/superadmin/organizations/tenant", data),
  superadminDeleteOrganization: (id: string) => api.delete(`/api/superadmin/organizations/${id}`),
  superadminUpdateOrgStatus: (id: string, isActive: boolean) => api.put(`/api/superadmin/organizations/${id}/status`, { isActive }),
  superadminUpdateOrgLimits: (id: string, data: any) => api.put(`/api/superadmin/organizations/${id}/limits`, data),
  superadminGetUsers: () => api.get("/api/superadmin/users"),
  superadminCheckEmailStatus: (data: {
    email: string;
    organizationId?: string;
    defaultOrganization?: boolean;
  }) => api.post("/api/superadmin/users/email-status", data),
  superadminUpdateUser: (userId: string, data: any) =>
    api.put(`/api/superadmin/users/${userId}`, data),
  superadminCreateDemoUser: (data: any) => api.post("/api/superadmin/users/demo", data),
  superadminCreateSuperAdmin: (data: any) => api.post("/api/superadmin/users/superadmin", data),
  superadminGetRequests: () => api.get("/api/superadmin/requests"),
  superadminResolveRequest: (id: string) => api.put(`/api/superadmin/requests/${id}/resolve`),
  superadminGetGlobalSettings: () => api.get("/api/superadmin/settings/global"),
  superadminUpdateGlobalSettings: (data: any) => api.put("/api/superadmin/settings/global", data),
  superadminUploadWelcomeVideo: (formData: FormData) =>
    api.post("/api/superadmin/settings/welcome-video/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000,
    }),

  // Global Presets
  superadminGetPresets: () => api.get("/api/superadmin/presets"),
  superadminCreatePreset: (data: any) => api.post("/api/superadmin/presets", data),
  superadminUpdatePreset: (id: string, data: any) => api.put(`/api/superadmin/presets/${id}`, data),
  superadminDeletePreset: (id: string) => api.delete(`/api/superadmin/presets/${id}`),

  // === Tenant (Team Management) ===
  tenantGetTeam: () => api.get("/api/tenant/team"),
  tenantCheckTeamEmail: (email: string) =>
    api.post("/api/tenant/team/email-status", { email }),
  tenantAddUser: (data: any) => api.post("/api/tenant/team/user", data),
  tenantUpdateUser: (userId: string, data: any) => api.put(`/api/tenant/team/user/${userId}`, data),
  tenantDeleteUser: (userId: string) => api.delete(`/api/tenant/team/user/${userId}`),
  tenantGetRequests: () => api.get("/api/tenant/requests"),
  tenantResolveRequest: (id: string) => api.put(`/api/tenant/requests/${id}/resolve`),
  tenantGetConfig: () => api.get("/api/tenant/config"),
  tenantUpdateConfig: (data: any) => api.put("/api/tenant/config", data),
  tenantGetProviderBalances: () => api.get("/api/tenant/provider-balances"),

  // === Admin Organization (Tenant Control - Legacy) ===
  adminGetOrganization: () => api.get("/api/admin/organization"),
  adminUpdateOrganization: (data: any) => api.put("/api/admin/organization", data),
  adminGetOrganizations: () => api.get("/api/admin/organizations"),
  adminCreateOrganization: (data: any) => api.post("/api/admin/organizations", data),

  // === Admin Settings (Pricing Control) ===
  adminGetSettings: () => api.get("/api/admin/settings"),
  adminGetSettingsByOrgId: (orgId: string) => api.get(`/api/admin/settings?orgId=${orgId}`),
  adminUpdateSettings: (data: any) => api.put("/api/admin/settings", data),

  // === Projects ===
  createProject: (data: { name: string }) => api.post("/api/projects", data),
  getProjects: () => api.get("/api/projects"),
  updateProject: (id: string, data: { name?: string, editorState?: any }) => api.patch(`/api/projects/${id}`, data),
  deleteProject: (id: string) => api.delete(`/api/projects/${id}`),

  // === Data ===
  getBrandConfig: () => api.get("/api/brand-config"),
  updateBrandConfig: (data: any) => api.put("/api/brand-config", data),
  uploadBrandLogo: (formData: FormData) =>
    api.post("/api/brand-config/logo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000,
    }),
  getPosts: (projectId?: string) => api.get("/api/posts", { params: { projectId } }),
  getPostById: (id: string) => api.get(`/api/post/${id}`),
  updatePostTitle: (postId: string, title: string) =>
    api.put(`/api/posts/${postId}/title`, { title }),
  getPostStatus: (id: string) => api.get(`/api/post/${id}/status`),
  checkActiveJobs: () => api.get("/api/jobs/check-active"),
  deletePost: (id: string) => api.delete(`/api/posts/${id}`),

  // === Vision & Analysis ===
  analyzeImage: (formData: FormData) =>
    api.post("/api/analyze-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // Sync upload
  uploadAssetSync: (
    formData: FormData,
    options?: { onUploadProgress?: (progressEvent: AxiosProgressEvent) => void },
  ) =>
    api.post("/api/assets/upload-sync", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: options?.onUploadProgress,
      timeout: 600000,
    }),

  autoProcessAsset: (data: {
    originalAssetId: string;
    aspectRatio: string;
    projectId?: string;
  }) => api.post("/api/assets/auto-process", data),

  // Video export
  exportVideo: (data: { editorState: any; projectId?: string; fps?: number }) =>
    api.post("/api/export/video", data),
  // === Asset Library ===
  getAssets: (projectId?: string) => api.get("/api/assets", { params: { projectId } }),
  getStoryboard: (projectId?: string) => api.get("/api/storyboard", { params: { projectId } }),
  saveStoryboard: (sequence: string[], projectId?: string) => api.post("/api/storyboard", { sequence, projectId }),

  deleteAsset: (id: string) => api.delete(`/api/assets/${id}`),

  // Download multiple assets as ZIP
  downloadZip: (data: { assetUrls: string[]; filename?: string }) =>
    api.post("/api/assets/download-zip", data, { responseType: "blob" }),

  movePostToAsset: (postId: string) =>
    api.post(`/api/posts/${postId}/to-asset`),

  uploadBatchAssets: (formData: FormData) =>
    api.post("/api/assets/batch", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  enhanceAsset: (data: { assetUrl: string; originalAssetId?: string }) =>
    api.post("/api/assets/enhance", data),

  // Drift Video (Kling)
  startDriftVideo: (data: any) => api.post("/api/assets/drift-video", data),

  // Check Status
  checkToolStatus: (statusUrl: string) =>
    api.post("/api/tools/status", { statusUrl }),
  extractLastFrame: (videoUrl: string) =>
    api.post(
      "/api/tools/extract-last-frame",
      { videoUrl },
      { responseType: "blob", timeout: 60000 },
    ),

  saveAssetUrl: (data: {
    url: string;
    aspectRatio: string;
    type: "IMAGE" | "VIDEO";
    projectId?: string;
  }) => api.post("/api/assets/save-url", data),
  // Updated: edit asset supports "mode"
  editAsset: (data: {
    assetId: string;
    originalAssetId?: string; // Added this
    assetUrl: string;
    prompt: string;
    aspectRatio: string;
    referenceUrl?: string;
    referenceUrls?: string[];
    mode?: "standard" | "pro";
    model?: "nano-banana-2" | "gpt-image-2";
  }) => api.post("/api/assets/edit", data, { timeout: 600000 }),

  // New: Drift asset (FAL Flux)
  driftAsset: (data: {
    assetUrl: string;
    prompt?: string;
    horizontal: number;
    vertical: number;
    zoom: number;
  }) => api.post("/api/assets/drift-video", data),

  // === Generation ===
  generateMediaDirect: (formData: FormData) =>
    api.post("/api/generate-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // === ROI & Credits ===
  getROIMetrics: () => api.get("/api/roi-metrics"),
  getUserCredits: () => api.get("/api/user-credits"),
  requestCredits: () => api.post("/api/request-credits"),

  // === Prompt FX ===
  getPromptFx: () => api.get("/api/user-prompt-fx"),
  savePromptFx: (promptFx: { name: string, prompt: string }[]) => api.put("/api/user-prompt-fx", { promptFx }),

  // === Admin Notifications ===
  adminGetRequests: () => api.get("/api/admin/requests"),
  adminResolveRequest: (id: string) =>
    api.put(`/api/admin/requests/${id}/resolve`),
};

/**
 * Helper to bypass CORS issues by proxying R2 images through a dedicated proxy route.
 * This ensures images load with correct headers for Canvas/Editor use.
 */
export const getCORSProxyUrl = (url: string, width?: number, quality?: number) => {
  if (!url || !url.includes("r2.dev") || url.includes(".m3u8") || url.includes(".ts")) return url;
  
  // Use our backend as a proxy to bypass R2 CORS restrictions and optionally resize
  let proxyUrl = `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(url)}`;
  if (width) proxyUrl += `&w=${width}`;
  if (quality) proxyUrl += `&q=${quality}`;
  return proxyUrl;
};

export const startReadOnlyImpersonation = (userId: string, label: string) => {
  localStorage.setItem(IMPERSONATE_USER_ID_KEY, userId);
  localStorage.setItem(IMPERSONATE_USER_LABEL_KEY, label);
  localStorage.removeItem("visionlight_active_project");
};

export const stopReadOnlyImpersonation = () => {
  localStorage.removeItem(IMPERSONATE_USER_ID_KEY);
  localStorage.removeItem(IMPERSONATE_USER_LABEL_KEY);
  localStorage.removeItem("visionlight_active_project");
};

export const getReadOnlyImpersonationLabel = () =>
  localStorage.getItem(IMPERSONATE_USER_LABEL_KEY) || "";

export const setActiveProfile = (profileId: string, label?: string) => {
  localStorage.setItem(ACTIVE_PROFILE_ID_KEY, profileId);
  if (label) localStorage.setItem(ACTIVE_PROFILE_LABEL_KEY, label);
  localStorage.removeItem("visionlight_active_project");
  stopReadOnlyImpersonation();
};

export const clearActiveProfile = () => {
  localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
  localStorage.removeItem(ACTIVE_PROFILE_LABEL_KEY);
  localStorage.removeItem("visionlight_active_project");
  stopReadOnlyImpersonation();
};

export const getActiveProfileId = () =>
  localStorage.getItem(ACTIVE_PROFILE_ID_KEY) || "";

export const getActiveProfileLabel = () =>
  localStorage.getItem(ACTIVE_PROFILE_LABEL_KEY) || "";

api.interceptors.request.use((config) => {
  const activeProfileId = localStorage.getItem(ACTIVE_PROFILE_ID_KEY);
  if (activeProfileId) {
    config.headers = config.headers || {};
    config.headers["X-Active-User-Id"] = activeProfileId;
  }

  const impersonateUserId = localStorage.getItem(IMPERSONATE_USER_ID_KEY);
  if (impersonateUserId) {
    config.headers = config.headers || {};
    config.headers["X-Impersonate-User-Id"] = impersonateUserId;
  }
  return config;
});

/**
 * Proxy R2-hosted videos through backend with range support to keep seeking/scrubbing reliable.
 */
export const getCORSProxyVideoUrl = (url: string) => {
  if (!url || !url.includes("r2.dev") || url.includes(".m3u8") || url.includes(".ts")) {
    return url;
  }
  return `${API_BASE_URL}/api/proxy-video?url=${encodeURIComponent(url)}`;
};

const canProxyAsset = (url: string) =>
  !!url &&
  (url.includes("r2.dev") || url.includes("cloudinary.com")) &&
  !url.includes(".m3u8") &&
  !url.includes(".ts");

export const getDirectDownloadVideoUrl = (url: string, filename?: string) => {
  if (!url) return "";
  if (!canProxyAsset(url)) return url;
  const params = new URLSearchParams({
    url,
    download: "1",
  });
  if (filename && filename.trim()) {
    params.set("filename", filename.trim());
  }
  return `${API_BASE_URL}/api/proxy-video?${params.toString()}`;
};

export const getDirectDownloadImageUrl = (url: string, filename?: string) => {
  if (!url) return "";
  if (!canProxyAsset(url)) return url;
  const params = new URLSearchParams({
    url,
    download: "1",
  });
  if (filename && filename.trim()) {
    params.set("filename", filename.trim());
  }
  return `${API_BASE_URL}/api/proxy-image?${params.toString()}`;
};
