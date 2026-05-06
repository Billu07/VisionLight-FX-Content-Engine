import { create } from "zustand";
import { supabase } from "../lib/supabase";
import {
  apiEndpoints,
  clearSupportSessionToken,
  clearActiveProfile,
  getSupportSessionToken,
  setAuthToken,
  stopReadOnlyImpersonation,
} from "../lib/api";

interface User {
  id: string;
  authUserId?: string | null;
  email: string;
  name: string;
  creditSystem?: "COMMERCIAL" | "INTERNAL";
  isDemo?: boolean;
  role?: "ADMIN" | "USER" | "MANAGER" | "SUPERADMIN";
  organizationId?: string | null;
  organizationName?: string | null;
  organizationIsDefault?: boolean;
  organizationTenantPlan?: string | null;
  isOrgActive?: boolean;
  needsActivation?: boolean;
  orgLockReason?: "DEACTIVATED" | "MISSING_FAL_KEY" | null;
  videoEditorEnabledForAll?: boolean;
  view?: "VISIONLIGHT" | "PICDRIFT";
  orgViewType?: "VISIONLIGHT" | "PICDRIFT";
  maxProjects?: number;
  isSuperAdmin?: boolean;
  canonicalDomain?: string | null;
  domainRoutingEnabled?: boolean;
  domainRedirectRequired?: boolean;
  readOnlyImpersonation?: boolean;
  impersonator?: {
    id: string;
    email: string;
    role: string;
  };
}

export interface WorkspaceProfile {
  id: string;
  email: string;
  name?: string | null;
  role?: "ADMIN" | "USER" | "MANAGER" | "SUPERADMIN";
  view?: "VISIONLIGHT" | "PICDRIFT";
  organizationId?: string | null;
  organizationName?: string | null;
  organizationIsDefault?: boolean;
  isOrgActive?: boolean;
  canonicalDomain?: string | null;
}

interface AuthCheckResult {
  hasUser: boolean;
  profileSelectionRequired: boolean;
}

interface AuthState {
  user: User | null;
  profiles: WorkspaceProfile[];
  profileSelectionRequired: boolean;
  systemPresets: any[] | null;
  isLoading: boolean;
  token: string | null;
  checkAuth: () => Promise<AuthCheckResult>;
  logout: () => Promise<void>;
}

const signedOutState = {
  user: null,
  profiles: [],
  profileSelectionRequired: false,
  systemPresets: null,
  token: null,
};

export const useAuth = create<AuthState>((set) => ({
  ...signedOutState,
  isLoading: true,

  checkAuth: async () => {
    try {
      const supportToken = getSupportSessionToken();
      if (supportToken) {
        setAuthToken(supportToken);
        try {
          const supportResponse = await apiEndpoints.getMe();
          if (supportResponse.data.success && supportResponse.data.user) {
            set({
              user: supportResponse.data.user,
              profiles: supportResponse.data.profiles || [],
              profileSelectionRequired: false,
              systemPresets: supportResponse.data.systemPresets || [],
              token: supportToken,
              isLoading: false,
            });
            return { hasUser: true, profileSelectionRequired: false };
          }
        } catch {
          clearSupportSessionToken();
          setAuthToken(null);
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        set({ ...signedOutState, isLoading: false });
        setAuthToken(null);
        return { hasUser: false, profileSelectionRequired: false };
      }

      setAuthToken(session.access_token);
      const response = await apiEndpoints.getMe();

      if (response.data.success) {
        if (response.data.profileSelectionRequired) {
          set({
            user: null,
            profiles: response.data.profiles || [],
            profileSelectionRequired: true,
            systemPresets: response.data.systemPresets || [],
            token: session.access_token,
            isLoading: false,
          });
          return { hasUser: false, profileSelectionRequired: true };
        }

        set({
          user: response.data.user,
          profiles: response.data.profiles || [],
          profileSelectionRequired: false,
          systemPresets: response.data.systemPresets || [],
          token: session.access_token,
          isLoading: false,
        });
        return { hasUser: true, profileSelectionRequired: false };
      }

      set({ ...signedOutState, isLoading: false });
      return { hasUser: false, profileSelectionRequired: false };
    } catch (error) {
      console.error("Auth check failed:", error);
      set({ ...signedOutState, isLoading: false });
      setAuthToken(null);
      return { hasUser: false, profileSelectionRequired: false };
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    setAuthToken(null);
    clearSupportSessionToken();
    clearActiveProfile();
    stopReadOnlyImpersonation();
    localStorage.removeItem("visionlight_active_project");
    set({ ...signedOutState, isLoading: false });
  },
}));
