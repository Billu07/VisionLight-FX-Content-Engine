import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints, clearActiveProfile, setActiveProfile } from "../lib/api";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LoginStep = "email" | "workspace" | "password";

type LoginProfile = {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  view?: "VISIONLIGHT" | "PICDRIFT";
  organizationName?: string | null;
  isOrgActive?: boolean;
  canonicalDomain?: string | null;
};

const DOMAIN_CACHE_STORAGE_KEY = "visionlight_login_domain_cache_v2";
const DOMAIN_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type DomainCacheEntry = {
  domain: string;
  profileId?: string;
  updatedAt: number;
};

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

const readDomainCache = (): Record<string, DomainCacheEntry> => {
  try {
    const raw = localStorage.getItem(DOMAIN_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, DomainCacheEntry>;
  } catch {
    return {};
  }
};

const getCachedDomainForEmail = (email: string): DomainCacheEntry | null => {
  const cache = readDomainCache();
  const entry = cache[email];
  if (!entry || typeof entry.domain !== "string" || typeof entry.updatedAt !== "number") {
    return null;
  }
  if (Date.now() - entry.updatedAt > DOMAIN_CACHE_TTL_MS) {
    return null;
  }
  const domain = sanitizeDomain(entry.domain);
  if (!domain) return null;
  return { ...entry, domain };
};

const cacheEmailDomain = (email: string, domain: string, profileId?: string) => {
  const sanitizedDomain = sanitizeDomain(domain);
  if (!sanitizedDomain) return;
  const cache = readDomainCache();
  cache[email] = {
    domain: sanitizedDomain,
    profileId,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(DOMAIN_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures; login flow should continue.
  }
};

const profileLabel = (profile: LoginProfile) =>
  profile.organizationName || profile.name || profile.email;

export const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<LoginStep>("email");
  const [profiles, setProfiles] = useState<LoginProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    const url = new URL(window.location.href);
    const prefilledEmail = url.searchParams.get("login_email");
    const preselectedProfile = url.searchParams.get("login_profile");

    if (prefilledEmail) {
      setEmail(prefilledEmail);
      if (preselectedProfile) {
        setActiveProfile(preselectedProfile, prefilledEmail);
      }
      setStep("password");
    } else {
      setStep("email");
      setPassword("");
      setProfiles([]);
      clearActiveProfile();
    }
    setError("");
  }, [isOpen]);

  const continueToPassword = (
    normalizedEmail: string,
    profile?: LoginProfile,
    canonicalDomain?: string | null,
  ) => {
    const currentHost = sanitizeDomain(window.location.host);
    const selectedDomain = sanitizeDomain(canonicalDomain || profile?.canonicalDomain);

    if (profile) {
      setActiveProfile(profile.id, profileLabel(profile));
    }

    if (selectedDomain) {
      cacheEmailDomain(normalizedEmail, selectedDomain, profile?.id);
    }

    if (selectedDomain && currentHost && selectedDomain !== currentHost) {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.hostname = selectedDomain;
      redirectUrl.searchParams.set("login_email", normalizedEmail);
      if (profile?.id) redirectUrl.searchParams.set("login_profile", profile.id);
      window.location.replace(redirectUrl.toString());
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("login_email", normalizedEmail);
    if (profile?.id) url.searchParams.set("login_profile", profile.id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setStep("password");
  };

  const handleContinue = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setIsLoading(true);
    setError("");
    setProfiles([]);
    clearActiveProfile();

    const cached = getCachedDomainForEmail(normalizedEmail);
    if (cached?.profileId) {
      setActiveProfile(cached.profileId, normalizedEmail);
    }

    try {
      const response = await apiEndpoints.resolveAuthDomain(normalizedEmail);
      const resolvedProfiles = Array.isArray(response?.data?.profiles)
        ? response.data.profiles
        : [];

      if (resolvedProfiles.length > 1) {
        clearActiveProfile();
        setProfiles(resolvedProfiles);
        setStep("workspace");
        return;
      }

      const singleProfile = resolvedProfiles[0];
      continueToPassword(
        normalizedEmail,
        singleProfile,
        response?.data?.canonicalDomain,
      );
    } catch {
      // Generic fallback to avoid account-enumeration hints.
      continueToPassword(normalizedEmail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkspaceSelect = (profile: LoginProfile) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setError("");
    continueToPassword(normalizedEmail, profile, profile.canonicalDomain);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (step === "email") {
      if (!normalizedEmail) return;
      await handleContinue();
      return;
    }

    if (step === "workspace") return;
    if (!normalizedEmail || !password.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) throw authError;

      const authResult = await checkAuth();
      onClose();

      const url = new URL(window.location.href);
      if (url.searchParams.has("login_email") || url.searchParams.has("login_profile")) {
        url.searchParams.delete("login_email");
        url.searchParams.delete("login_profile");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }

      navigate(authResult.profileSelectionRequired ? "/studios" : "/app");
    } catch (err: any) {
      setError(err.message || "Invalid login credentials");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10"></div>

        <h2 className="text-2xl font-bold text-white mb-2">Login to Studio</h2>
        <p className="text-purple-200/70 text-sm mb-6">
          {step === "email"
            ? "Enter your email to find the right workspace."
            : step === "workspace"
              ? "Choose which organization you want to enter."
              : "Enter your password to continue."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (step !== "email") {
                  setStep("email");
                  setProfiles([]);
                  setPassword("");
                  clearActiveProfile();
                }
              }}
              placeholder="client@brand.com"
              className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
              required
              autoComplete="email"
            />
          </div>

          {step === "workspace" && (
            <div className="space-y-3">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleWorkspaceSelect(profile)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-cyan-300/40 hover:bg-white/[0.08]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">
                        {profile.organizationName || "Personal Workspace"}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {profile.role || "USER"} access
                      </div>
                    </div>
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-cyan-200">
                      {profile.view === "PICDRIFT" ? "PicDrift" : "VisualFX"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === "password" && (
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
                required
                autoComplete="current-password"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={step === "email" ? onClose : () => setStep("email")}
              className="flex-1 py-3 px-4 border border-white/10 rounded-xl text-gray-300 hover:bg-white/5 transition-colors font-medium"
              disabled={isLoading}
            >
              {step === "email" ? "Cancel" : "Back"}
            </button>
            {step !== "workspace" && (
              <button
                type="submit"
                disabled={isLoading || !email || (step === "password" && !password)}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-3 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-bold shadow-lg hover:shadow-cyan-500/25"
              >
                {isLoading ? <LoadingSpinner size="sm" variant="light" /> : null}
                {step === "email" ? "Continue" : "Login"}
              </button>
            )}
          </div>

          <div className="text-center mt-4 pt-2 border-t border-white/5">
            <p className="text-sm text-gray-400">
              Need a Login?{" "}
              <a
                href="https://www.picdrift.com/studio-signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                Sign Up Now
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
