import axios from "axios";

const RAW_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const API_BASE_URL = RAW_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

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
    const message = error.response?.data?.error || error.message || "Error";
    // Ignore 404s from polling
    if (error.response?.status !== 404 && error.code !== "ERR_CANCELED") {
      console.error("API Error:", {
        url: error.config?.url,
        status: error.response?.status,
      });
    }
    return Promise.reject(new Error(message));
  }
);

export const apiEndpoints = {
  // === Auth ===
  getMe: () => api.get("/api/auth/me"),
  adminCreateUser: (data: any) => api.post("/api/admin/create-user", data),
  adminGetUsers: () => api.get("/api/admin/users"),
  adminUpdateUser: (userId: string, data: any) =>
    api.put(`/api/admin/users/${userId}`, data),
  adminDeleteUser: (userId: string) => api.delete(`/api/admin/users/${userId}`),

  // === Data ===
  getBrandConfig: () => api.get("/api/brand-config"),
  updateBrandConfig: (data: any) => api.put("/api/brand-config", data),
  getPosts: () => api.get("/api/posts"),
  getPostById: (id: string) => api.get(`/api/post/${id}`),
  updatePostTitle: (postId: string, title: string) =>
    api.put(`/api/posts/${postId}/title`, { title }),
  getPostStatus: (id: string) => api.get(`/api/post/${id}/status`),
  checkActiveJobs: () => api.get("/api/jobs/check-active"),

  // === Generation ===
  generateMediaDirect: (formData: FormData) =>
    api.post("/api/generate-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // === ROI & Credits ===
  getROIMetrics: () => api.get("/api/roi-metrics"),
  getUserCredits: () => api.get("/api/user-credits"),
  requestCredits: () => api.post("/api/request-credits"),

  // === Admin Notifications ===
  adminGetRequests: () => api.get("/api/admin/requests"),
  adminResolveRequest: (id: string) =>
    api.put(`/api/admin/requests/${id}/resolve`),
};
