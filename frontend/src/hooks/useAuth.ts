import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { apiEndpoints, setAuthToken } from "../lib/api";

interface User {
  id: string; // Airtable ID
  email: string;
  name: string;
  // Add other fields if you use them in UI, e.g. credits are usually fetched separately
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
      // 1. Get Session from Supabase
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        set({ user: null, token: null, isLoading: false });
        setAuthToken(null);
        return;
      }

      // 2. Set Token for API calls
      setAuthToken(session.access_token);

      // 3. Fetch Airtable User Data from Backend
      // This ensures we have the "Airtable User" (with history), not just the Auth User
      const response = await apiEndpoints.getMe();

      if (response.data.success) {
        set({
          user: response.data.user,
          token: session.access_token,
          isLoading: false,
        });
      } else {
        // Token was valid, but backend couldn't find/create Airtable user (rare)
        console.error("Auth valid but User sync failed");
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
