import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { apiEndpoints, setAuthToken } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  creditSystem?: "COMMERCIAL" | "INTERNAL";
  role?: "ADMIN" | "USER" | "MANAGER";
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  token: string | null;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  checkAuth: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        set({ user: null, token: null, isLoading: false });
        setAuthToken(null);
        return;
      }

      setAuthToken(session.access_token);

      // This calls the backend which now returns role & creditSystem
      const response = await apiEndpoints.getMe();

      if (response.data.success) {
        set({
          user: response.data.user,
          token: session.access_token,
          isLoading: false,
        });
      } else {
        set({ user: null, token: null, isLoading: false });
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      set({ user: null, token: null, isLoading: false });
      setAuthToken(null);
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    setAuthToken(null);
    set({ user: null, token: null });
  },
}));
