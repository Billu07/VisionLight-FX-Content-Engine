import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiEndpoints, setActiveProfile, setAuthToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { notify } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";

type AuthMode = "signup" | "login";

const FAL_KEYS_URL = "https://fal.ai/dashboard/keys";

export const ByokLanding = () => {
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [falApiKey, setFalApiKey] = useState("");
  const [falHelperShown, setFalHelperShown] = useState(false);
  const [isLinkingKey, setIsLinkingKey] = useState(false);

  useEffect(() => {
    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setAuthToken(session.access_token);
      try {
        const bootstrap = await apiEndpoints.byokBootstrap();
        const profileId = bootstrap.data?.profileId;
        if (typeof profileId === "string" && profileId.trim()) {
          setActiveProfile(profileId, email || "BYOK Workspace");
        }
        const status = bootstrap.data?.status;
        if (status?.isByok && !status?.hasFalKey) {
          setShowKeyModal(true);
          return;
        }
        const authResult = await checkAuth();
        navigate(authResult.profileSelectionRequired ? "/studios" : "/projects", {
          replace: true,
        });
      } catch {
        // silent
      }
    };
    void run();
  }, []);

  const ctaLabel = useMemo(
    () => (authMode === "signup" ? "Create BYOK Account" : "Login"),
    [authMode],
  );

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsSubmitting(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          notify.success("Signup submitted. Confirm your email, then login.");
          setAuthMode("login");
          setIsSubmitting(false);
          return;
        }
        setAuthToken(accessToken);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        if (!data.session?.access_token) {
          throw new Error("Unable to start session.");
        }
        setAuthToken(data.session.access_token);
      }

      const bootstrap = await apiEndpoints.byokBootstrap();
      const profileId = bootstrap.data?.profileId;
      if (typeof profileId === "string" && profileId.trim()) {
        setActiveProfile(profileId, email.trim().toLowerCase());
      }

      const status = bootstrap.data?.status;
      if (status?.isByok && !status?.hasFalKey) {
        setShowAuth(false);
        setShowKeyModal(true);
        return;
      }

      await checkAuth();
      navigate("/projects", { replace: true });
    } catch (error: any) {
      notify.error(error?.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!falApiKey.trim()) return;
    setIsLinkingKey(true);
    try {
      await apiEndpoints.byokLinkKey(falApiKey.trim());
      notify.success("14-day trial activated. Dashboard unlocked.");
      await checkAuth();
      navigate("/projects", { replace: true });
    } catch (error: any) {
      notify.error(error?.message || "Failed to link Fal key.");
    } finally {
      setIsLinkingKey(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050616] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(215,70,239,0.28),transparent_38%),radial-gradient(circle_at_82%_22%,rgba(59,130,246,0.24),transparent_45%),radial-gradient(circle_at_42%_72%,rgba(11,18,46,0.9),transparent_62%)]" />
      <div className="absolute inset-y-0 right-[-18%] w-[68%] bg-[radial-gradient(circle_at_40%_50%,rgba(236,72,153,0.38),transparent_40%),radial-gradient(circle_at_58%_46%,rgba(56,189,248,0.32),transparent_42%)] blur-2xl" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-3 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-200">
            BYOK Link
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Bring Your Own Key
          </div>
          <h1 className="mt-6 text-5xl font-black leading-[1.05] text-white sm:text-6xl">
            Stop Paying
            <br />
            <span className="bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
              Credit Markups
            </span>
          </h1>
          <ul className="mt-7 space-y-3 text-lg text-slate-200">
            <li>Use your own Fal.ai API key</li>
            <li>Start in under 2 minutes</li>
            <li>No credit markup from platform side</li>
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setShowAuth(true);
              }}
              className="rounded-2xl bg-gradient-to-r from-fuchsia-500 to-blue-500 px-8 py-4 text-sm font-black uppercase tracking-[0.14em] text-white shadow-[0_18px_45px_rgba(59,130,246,0.45)] transition hover:brightness-110"
            >
              Link Key: Start Now
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setShowAuth(true);
              }}
              className="rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/10"
            >
              Login
            </button>
          </div>
          <p className="mt-5 text-sm text-cyan-200/85">
            14-day trial: full dashboard access, max 5 renders/day.
          </p>
        </section>

        <section className="mt-12 w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#0a0f2a]/75 p-7 shadow-[0_30px_80px_rgba(6,8,28,0.65)] backdrop-blur-xl lg:mt-0">
          <h2 className="text-2xl font-black tracking-tight text-white">How It Works</h2>
          <div className="mt-6 grid gap-4">
            {[
              ["1", "Signup", "Use email + password"],
              ["2", "Link Fal Key", "Paste API key from Fal"],
              ["3", "Render", "Trial starts immediately"],
            ].map(([step, title, copy]) => (
              <div
                key={step}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                  Step {step}
                </div>
                <div className="mt-1 text-lg font-bold text-white">{title}</div>
                <div className="text-sm text-slate-300">{copy}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showAuth && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a102b] p-6 shadow-2xl">
            <h3 className="text-xl font-black text-white">{ctaLabel}</h3>
            <p className="mt-2 text-sm text-slate-300">
              {authMode === "signup"
                ? "Create account, then link Fal key to start trial."
                : "Login to your BYOK workspace."}
            </p>

            <form className="mt-5 space-y-3" onSubmit={handleAuth}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300"
                required
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAuth(false)}
                  className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-200 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-500 to-blue-500 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner size="sm" variant="light" />
                      Working
                    </span>
                  ) : (
                    ctaLabel
                  )}
                </button>
              </div>
            </form>

            <div className="mt-4 text-center text-xs text-slate-300">
              {authMode === "signup" ? "Already have an account?" : "Need a new account?"}{" "}
              <button
                type="button"
                onClick={() =>
                  setAuthMode((prev) => (prev === "signup" ? "login" : "signup"))
                }
                className="font-bold text-cyan-300 hover:text-cyan-200"
              >
                {authMode === "signup" ? "Login" : "Create one"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-400/25 bg-[#050b1f] p-7 shadow-[0_30px_90px_rgba(2,8,23,0.8)]">
            <h3 className="text-2xl font-black text-white">Bring Your Own Key</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Pay direct. Total control. 1-2 minute Fal signup.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setFalHelperShown(true);
                  window.open(FAL_KEYS_URL, "_blank", "noopener,noreferrer");
                }}
                className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-400/20"
              >
                Signup Fal
              </button>
              <a
                href={FAL_KEYS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-white/10"
              >
                Fal API Key Link
              </a>
            </div>

            {falHelperShown && (
              <p className="mt-3 text-xs text-cyan-200">
                Fal will open in a new window. Signup and return to this window.
              </p>
            )}

            <form className="mt-5 space-y-3" onSubmit={handleLinkKey}>
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
                Fal Key
              </label>
              <input
                type="password"
                value={falApiKey}
                onChange={(e) => setFalApiKey(e.target.value)}
                placeholder="Paste your Fal API key"
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300"
                required
              />
              <button
                type="submit"
                disabled={isLinkingKey}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-60"
              >
                {isLinkingKey ? "Submitting..." : "Submitted"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ByokLanding;
