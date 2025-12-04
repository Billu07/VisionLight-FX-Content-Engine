import axios from "axios";

// Dynamic API base URL for production/development
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

console.log("🔧 API Base URL:", API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 40000, // Increased timeout for heavier loads
  withCredentials: true,
});

// Add auth header to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("visionlight_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("visionlight_token");
      window.location.href = "/";
    }

    const message =
      error.response?.data?.error || error.message || "Something went wrong";

    // Less noise for expected polling 404s
    if (error.response?.status !== 404) {
      console.error("API Error:", {
        url: error.config?.url,
        status: error.response?.status,
        message: message,
      });
    }

    return Promise.reject(new Error(message));
  }
);

export const apiEndpoints = {
  // === Auth ===
  demoLogin: (data: { email: string; name?: string }) =>
    api.post("/auth/demo-login", data),

  logout: () => api.post("/auth/logout"),

  getCurrentUser: () => api.get("/auth/me"),

  // === Brand & Config ===
  getBrandConfig: () => api.get("/brand-config"),
  updateBrandConfig: (data: any) => api.put("/brand-config", data),

  // === Posts ===
  getPosts: () => api.get("/posts"),
  getPost: (postId: string) => api.get(`/post/${postId}`),
  updatePostTitle: (postId: string, title: string) =>
    api.put(`/posts/${postId}/title`, { title }),
  getPostStatus: (postId: string) => api.get(`/post/${postId}/status`),

  // === Generation Workflow ===

  // 1. Initial Request
  generateMediaDirect: (formData: FormData) => {
    return api.post("/generate-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // 2. User Approval
  approvePrompt: (data: { postId: string; finalPrompt: string }) =>
    api.post("/approve-prompt", data),

  // 3. Cancel
  cancelPrompt: (postId: string) => api.post("/cancel-prompt", { postId }),

  publishPost: (data: { postId: string; platform?: string }) =>
    api.post("/posts/publish", data),

  // === Legacy / Backwards Compatibility (Fixes Build Errors) ===

  // Maps legacy createPost to new generate-media endpoint
  createPost: (data: { prompt: string; mediaType: string; title?: string }) => {
    const formData = new FormData();
    formData.append("prompt", data.prompt);
    formData.append("mediaType", data.mediaType);
    if (data.title) formData.append("title", data.title);
    // Note: Legacy calls won't support image upload via this method
    return api.post("/generate-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // Maps legacy generateMedia to approvePrompt (assuming auto-approval for legacy calls)
  generateMedia: (postId: string) => {
    // This is a best-effort map. In the new flow, we need a prompt.
    // We'll send a dummy approval to kickstart generation if this old method is called.
    return api.post("/approve-prompt", {
      postId,
      finalPrompt: "Legacy auto-approved prompt",
    });
  },

  // === Metrics & Utils ===
  getROIMetrics: () => api.get("/roi-metrics"),
  getUserCredits: () => api.get("/user-credits"),
  resetDemoCredits: () => api.post("/reset-demo-credits"),

  generateScript: (data: { prompt: string; mediaType: string }) =>
    api.post("/generate-script", data),
};
