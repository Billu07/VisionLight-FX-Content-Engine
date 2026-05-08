import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiEndpoints, setActiveProfile, setAuthToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { notify } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { DashboardEntryLoader } from "../components/DashboardEntryLoader";
import picdriftLogo from "../assets/picdrift.png";
import fxLogo from "../assets/fx.png";

type AuthMode = "signup" | "login";

export const ByokLanding = () => {
  const BYOK_PRICING_URL = "https://www.picdrift.com/pricing-plans/byok";
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showPackageSheet, setShowPackageSheet] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStudioLoader, setShowStudioLoader] = useState(false);

  const finalizeByokSession = async (profileLabel: string) => {
    const initialAuth = await checkAuth();
    if (initialAuth.profileSelectionRequired) {
      navigate("/studios", { replace: true });
      return;
    }

    try {
      const bootstrap = await apiEndpoints.byokBootstrap();
      const profileId = bootstrap.data?.profileId;
      if (typeof profileId === "string" && profileId.trim()) {
        setActiveProfile(profileId, profileLabel);
      }
    } catch (error: any) {
      if (error?.status === 409 && error?.code === "PROFILE_SELECTION_REQUIRED") {
        navigate("/studios", { replace: true });
        return;
      }
      throw error;
    }

    const finalAuth = await checkAuth();
    const nextPath = finalAuth.profileSelectionRequired ? "/studios" : "/projects";
    setShowStudioLoader(true);
    await new Promise((resolve) => setTimeout(resolve, 2400));
    navigate(nextPath, {
      replace: true,
    });
  };

  useEffect(() => {
    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setAuthToken(session.access_token);
      try {
        await finalizeByokSession(email || "BYOK Workspace");
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

      await finalizeByokSession(email.trim().toLowerCase());
    } catch (error: any) {
      if (error?.status === 409 && error?.code === "PROFILE_SELECTION_REQUIRED") {
        navigate("/studios", { replace: true });
      } else {
        notify.error(error?.message || "Authentication failed.");
        setShowStudioLoader(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showStudioLoader) {
    return (
      <DashboardEntryLoader
        organizationName={email.trim().toLowerCase() || "BYOK Workspace"}
        playMode="once"
        durationMs={2400}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a20] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(157,57,255,0.2),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(26,103,255,0.35),transparent_42%),radial-gradient(circle_at_50%_64%,rgba(15,12,40,0.65),transparent_62%)]" />
      <div className="absolute inset-x-0 top-0 h-[52%] bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />
      <div
        className="absolute inset-x-0 bottom-[-140px] h-[68%] bg-gradient-to-r from-[#2f58df] via-[#5364f2] to-[#3f58dd]"
        style={{ clipPath: "polygon(0 16%, 100% 0, 100% 100%, 0 100%)" }}
      />

      <header className="relative z-20 border-b border-white/10 bg-[#120f2b]/65 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <a
            href="https://picdrift.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3"
          >
            <img
              src={picdriftLogo}
              alt="PicDrift"
              className="h-9 w-auto object-contain sm:h-10"
            />
            <span className="h-7 w-px bg-white/20" />
            <img
              src={fxLogo}
              alt="FX"
              className="h-7 w-auto object-contain opacity-95"
            />
          </a>
          <button
            type="button"
            onClick={() => {
              setAuthMode("login");
              setShowAuth(true);
            }}
            className="rounded-full border border-white/35 bg-white/5 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            Login
          </button>
        </div>
      </header>

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
          <p className="mt-5 text-sm font-semibold text-cyan-100">
            Packages start from $9/mo (annual billing).
          </p>
          <p className="mt-2 text-sm text-cyan-200/85">
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

      {showPackageSheet && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0a102b]/95 p-6 shadow-[0_30px_90px_rgba(8,10,34,0.75)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-white">BYOK Packages</h3>
                <p className="mt-1 text-sm text-cyan-100">Starting from $9/mo billed annually.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["Solo App", "$9/mo", "Focused solo workflow"],
                ["Studio", "$49/mo", "Team-ready collaboration"],
                ["Agency", "$197/mo", "Scale with expanded limits"],
              ].map(([plan, price, note]) => (
                <div key={plan} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">{plan}</div>
                  <div className="mt-2 text-2xl font-black text-white">{price}</div>
                  <div className="mt-1 text-xs text-slate-300">{note}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white"
              >
                Continue to BYOK
              </button>
              <a
                href={BYOK_PRICING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-gray-200 hover:bg-white/10"
              >
                View Full Pricing
              </a>
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a102b] p-6 shadow-2xl">
            <h3 className="text-xl font-black text-white">{ctaLabel}</h3>
            <p className="mt-2 text-sm text-slate-300">
              {authMode === "signup"
                ? "Create account and enter dashboard. You can link Fal key inside dashboard."
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
    </div>
  );
};

export default ByokLanding;
