import { create } from "zustand";
import { apiEndpoints } from "../lib/api";

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, name?: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("visionlight_token"),
  isLoading: true,

  login: async (email: string, name?: string) => {
    try {
      const response = await apiEndpoints.demoLogin({ email, name });
      const { user, token } = response.data;

      localStorage.setItem("visionlight_token", token);
      set({ user, token, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    const { token } = get();
    if (token) {
      apiEndpoints.logout({ token }).catch(console.error);
    }
    localStorage.removeItem("visionlight_token");
    set({ user: null, token: null, isLoading: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem("visionlight_token");

    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const response = await apiEndpoints.getCurrentUser();
      set({ user: response.data.user, token, isLoading: false });
    } catch (error) {
      console.error("Auth check failed:", error);
      localStorage.removeItem("visionlight_token");
      set({ user: null, token: null, isLoading: false });
    }
  },
}));

// Initialize auth check on hook creation
useAuth.getState().checkAuth();
