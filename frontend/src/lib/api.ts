// frontend/src/lib/api.ts
import axios from "axios";

// 1. UPDATE: Add '/api' to localhost fallback so it matches your production structure
// If .env is "/api", baseURL becomes "/api".
// If .env is missing (local), baseURL becomes "http://localhost:4000/api"
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

console.log("🔧 API Base URL:", API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
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

// 2. UPDATE: Removed "/api" from all paths below because it is now part of API_BASE_URL
export const apiEndpoints = {
  // === Auth ===
  getMe: () => api.get("/auth/me"), // Was: /api/auth/me

  // === Admin ===
  adminCreateUser: (data: { email: string; password: string; name: string }) =>
    api.post("/admin/create-user", data),
  adminGetUsers: () => api.get("/admin/users"),
  adminUpdateUser: (userId: string, data: any) =>
    api.put(`/admin/users/${userId}`, data),
  adminDeleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),

  // === Brand & Config ===
  getBrandConfig: () => api.get("/brand-config"),
  updateBrandConfig: (data: any) => api.put("/brand-config", data),

  // === Credits & Requests ===
  requestCredits: () => api.post("/request-credits"),

  // Admin Notifications
  adminGetRequests: () => api.get("/admin/requests"),
  adminResolveRequest: (id: string) => api.put(`/admin/requests/${id}/resolve`),

  // === Posts ===
  getPosts: () => api.get("/posts"),
  getPostById: (postId: string) => api.get(`/post/${postId}`),
  updatePostTitle: (postId: string, title: string) =>
    api.put(`/posts/${postId}/title`, { title }),
  getPostStatus: (postId: string) => api.get(`/post/${postId}/status`),

  // === Generation Workflow ===
  generateMediaDirect: (formData: FormData) => {
    return api.post("/generate-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // === Metrics & Utils ===
  getROIMetrics: () => api.get("/roi-metrics"),
  getUserCredits: () => api.get("/user-credits"),
  resetDemoCredits: () => api.post("/reset-demo-credits"),

  publishPost: (data: { postId: string; platform?: string }) =>
    api.post("/posts/publish", data),
};
