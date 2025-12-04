import { create } from "zustand";
import { apiEndpoints } from "../lib/api";

interface AuthState {
  user: any | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("visionlight_token"),
  isLoading: true,
  error: null,

  login: async (email: string, name?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiEndpoints.demoLogin({ email, name });
      const { user, token } = response.data;

      localStorage.setItem("visionlight_token", token);
      set({ user, token, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || "Login failed",
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      // FIX: No arguments needed here anymore
      await apiEndpoints.logout();
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      localStorage.removeItem("visionlight_token");
      set({ user: null, token: null });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem("visionlight_token");
    if (!token) {
      set({ user: null, token: null, isLoading: false });
      return;
    }

    try {
      const response = await apiEndpoints.getCurrentUser();
      set({ user: response.data.user, token, isLoading: false });
    } catch (error) {
      localStorage.removeItem("visionlight_token");
      set({ user: null, token: null, isLoading: false });
    }
  },
}));
