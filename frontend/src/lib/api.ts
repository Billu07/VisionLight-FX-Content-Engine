import axios from "axios";

// NOTE: Changed default to root (4000) because backend routes include '/api' prefix
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

console.log("🔧 API Base URL:", API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased for heavier AI polling
  // withCredentials: true, // Not strictly needed for Bearer tokens but harmless
});

// Helper to set the token dynamically from useAuth
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
};

// Response interceptor (Simplified for Supabase)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // We let useAuth handle 401s via Supabase state changes,
    // but we log other errors for debugging.
    const message =
      error.response?.data?.error || error.message || "Something went wrong";

    if (error.response?.status !== 404 && error.code !== "ERR_CANCELED") {
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
  // === Auth (Bridge to Airtable) ===
  // Note: Actual login happens via Supabase Client in the UI.
  // This endpoint retrieves the Airtable User Data using the Supabase Token.
  getMe: () => api.get("/api/auth/me"),

  // === Admin ===
  adminCreateUser: (data: { email: string; password: string; name: string }) =>
    api.post("/api/admin/create-user", data),
  adminGetUsers: () => api.get("/api/admin/users"),
  adminUpdateUser: (userId: string, data: any) =>
    api.put(`/api/admin/users/${userId}`, data),
  adminDeleteUser: (userId: string) => api.delete(`/api/admin/users/${userId}`),

  // === Brand & Config ===
  getBrandConfig: () => api.get("/api/brand-config"),
  updateBrandConfig: (data: any) => api.put("/api/brand-config", data),

  // === Posts ===
  getPosts: () => api.get("/api/posts"),
  getPostById: (postId: string) => api.get(`/api/post/${postId}`),
  updatePostTitle: (postId: string, title: string) =>
    api.put(`/api/posts/${postId}/title`, { title }),
  getPostStatus: (postId: string) => api.get(`/api/post/${postId}/status`),

  // === Generation Workflow (Refined) ===

  // 1. Generate (Now handles everything, no approval step)
  generateMediaDirect: (formData: FormData) => {
    return api.post("/api/generate-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // === Metrics & Utils ===
  getROIMetrics: () => api.get("/api/roi-metrics"),
  getUserCredits: () => api.get("/api/user-credits"),
  resetDemoCredits: () => api.post("/api/reset-demo-credits"),

  // Publish (if you still have this logic in backend, otherwise optional)
  publishPost: (data: { postId: string; platform?: string }) =>
    api.post("/api/posts/publish", data),
};
