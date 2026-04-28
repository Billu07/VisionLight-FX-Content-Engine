import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints } from "../lib/api";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOMAIN_CACHE_STORAGE_KEY = "visionlight_login_domain_cache_v1";
const DOMAIN_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type DomainCacheEntry = {
  domain: string;
  updatedAt: number;
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

const getCachedDomainForEmail = (email: string): string | null => {
  const cache = readDomainCache();
  const entry = cache[email];
  if (!entry || typeof entry.domain !== "string" || typeof entry.updatedAt !== "number") {
    return null;
  }
  if (Date.now() - entry.updatedAt > DOMAIN_CACHE_TTL_MS) {
    return null;
  }
  return sanitizeDomain(entry.domain);
};

const cacheEmailDomain = (email: string, domain: string) => {
  const sanitizedDomain = sanitizeDomain(domain);
  if (!sanitizedDomain) return;
  const cache = readDomainCache();
  cache[email] = {
    domain: sanitizedDomain,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(DOMAIN_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures; login flow should continue.
  }
};

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

export const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    const url = new URL(window.location.href);
    const prefilledEmail = url.searchParams.get("login_email");
    if (prefilledEmail) {
      setEmail(prefilledEmail);
      setStep("password");
    } else {
      setStep("email");
      setPassword("");
    }
    setError("");
  }, [isOpen]);

  const handleContinue = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setIsLoading(true);
    setError("");

    const currentHost = sanitizeDomain(window.location.host);
    const cachedDomain = getCachedDomainForEmail(normalizedEmail);
    if (cachedDomain) {
      if (currentHost && cachedDomain !== currentHost) {
        const redirectUrl = new URL(window.location.href);
        redirectUrl.hostname = cachedDomain;
        redirectUrl.searchParams.set("login_email", normalizedEmail);
        window.location.replace(redirectUrl.toString());
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("login_email", normalizedEmail);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setStep("password");
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiEndpoints.resolveAuthDomain(normalizedEmail);
      const canonicalDomain = sanitizeDomain(response?.data?.canonicalDomain);
      if (canonicalDomain) {
        cacheEmailDomain(normalizedEmail, canonicalDomain);
      }

      if (canonicalDomain && currentHost && canonicalDomain !== currentHost) {
        const redirectUrl = new URL(window.location.href);
        redirectUrl.hostname = canonicalDomain;
        redirectUrl.searchParams.set("login_email", normalizedEmail);
        window.location.replace(redirectUrl.toString());
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("login_email", normalizedEmail);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setStep("password");
    } catch {
      // Keep a generic fallback to avoid account-enumeration hints.
      setStep("password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (step === "email") {
      if (!normalizedEmail) return;
      await handleContinue();
      return;
    }

    if (!normalizedEmail || !password.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) throw authError;

      await checkAuth();
      onClose();

      const url = new URL(window.location.href);
      if (url.searchParams.has("login_email")) {
        url.searchParams.delete("login_email");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }

      navigate("/app");
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
            ? "Enter your email to continue to the correct workspace."
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
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@brand.com"
              className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
              required
              autoComplete="email"
            />
          </div>

          {step === "password" && (
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-white/10 rounded-xl text-gray-300 hover:bg-white/5 transition-colors font-medium"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !email || (step === "password" && !password)}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-3 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-bold shadow-lg hover:shadow-cyan-500/25"
            >
              {isLoading ? <LoadingSpinner size="sm" variant="light" /> : null}
              {step === "email" ? "Continue" : "Login"}
            </button>
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
