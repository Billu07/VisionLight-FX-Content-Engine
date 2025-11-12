import axios from "axios";

const API_BASE_URL = "http://localhost:4000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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
      // Token expired or invalid
      localStorage.removeItem("visionlight_token");
      window.location.href = "/";
    }

    const message =
      error.response?.data?.error || error.message || "Something went wrong";
    console.error("API Error:", {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: message,
    });
    return Promise.reject(new Error(message));
  }
);

export const apiEndpoints = {
  // Auth endpoints
  demoLogin: (data: { email: string; name?: string }) =>
    api.post("/auth/demo-login", data),
  logout: (data: { token: string }) => api.post("/auth/logout", data),
  getCurrentUser: () => api.get("/auth/me"),

  // Brand endpoints
  getBrandConfig: () => api.get("/brand-config"),
  updateBrandConfig: (data: any) => api.put("/brand-config", data),

  // ROI endpoints
  getROIMetrics: () => api.get("/roi-metrics"),

  // Content endpoints
  generateScript: (data: { prompt: string; mediaType: string }) =>
    api.post("/generate-script", data),

  // New endpoints
  publishPost: (data: { postId: string; platform?: string }) =>
    api.post("/publish-post", data),

  createPost: (data: { prompt: string; script: any; platform?: string }) =>
    api.post("/posts", data),
  generateMedia: (postId: string, provider: string) =>
    api.post("/generate-media", { postId, provider }),
  getPosts: () => api.get("/posts"),
  getUserCredits: () => api.get("/user-credits"),

  // Utility endpoints
  resetDemoCredits: () => api.post("/reset-demo-credits"),
};
