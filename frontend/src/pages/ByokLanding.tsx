import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiEndpoints, setActiveProfile, setAuthToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { notify } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { DashboardEntryLoader } from "../components/DashboardEntryLoader";
import picdriftLogo from "../assets/picdrift.png";
import fxLogo from "../assets/fx.png";
import { getCanonicalDomainRedirectUrl } from "../lib/domain-routing";

type AuthMode = "signup" | "login";

type ByokLandingPlan = {
  code: string;
  title: string;
  annualPrice: string;
  monthlyEquivalent: string;
  blurb: string;
  modelLine: string;
  checkoutUrl: string;
  routingDomain: string;
  usersLabel: string;
  projectsLabel: string;
  storageLabel?: string;
  adminLabel: string;
  retentionLabel: string;
  highlight?: string;
  featured?: boolean;
};

const BYOK_LANDING_PLANS: ByokLandingPlan[] = [
  {
    code: "PD_APP",
    title: "PicDrift App",
    annualPrice: "$108",
    monthlyEquivalent: "$9/mo billed annually",
    blurb: "Focused solo PicDrift workflow with clean BYOK routing.",
    modelLine: "Nano Banana, GPT-2, Kling 2.6",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=df674622-e11f-4e88-8564-4bb12365d5e5&checkoutFlowId=0ca462cc-de89-4e2c-b02e-bb83d3c7ee98",
    routingDomain: "byok.link",
    usersLabel: "1 user",
    projectsLabel: "5 projects",
    adminLabel: "Admin panel locked",
    retentionLabel: "Standard retention policy",
  },
  {
    code: "VFX_APP",
    title: "VisualFX App",
    annualPrice: "$168",
    monthlyEquivalent: "$14/mo billed annually",
    blurb: "Solo VisualFX workflow with top video model access.",
    modelLine: "VisualFX video models",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=8351c366-2837-44cd-8522-65ec3fecb56d&checkoutFlowId=05b75b73-c0ed-4ae2-ab13-130ab4628ca6",
    routingDomain: "byok.visionlight.app",
    usersLabel: "1 user",
    projectsLabel: "5 projects",
    adminLabel: "Admin panel locked",
    retentionLabel: "Standard retention policy",
  },
  {
    code: "PD_STUDIO",
    title: "PicDrift Studio",
    annualPrice: "$588",
    monthlyEquivalent: "$49/mo billed annually",
    blurb: "Team-ready PicDrift studio for collaboration and management.",
    modelLine: "Nano Banana, GPT-2, Kling 2.6 + Studio Admin",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=dc751744-5641-4086-a510-7d203e187a79&checkoutFlowId=b5b1614d-e4d5-4352-804a-19d57d5225d0",
    routingDomain: "studio.byok.link",
    usersLabel: "5 users",
    projectsLabel: "120 projects",
    storageLabel: "10GB shared storage",
    adminLabel: "Admin panel enabled",
    retentionLabel: "30-day media retention",
    highlight: "Most Popular",
    featured: true,
  },
  {
    code: "VFX_STUDIO",
    title: "VisualFX Studio",
    annualPrice: "$1,188",
    monthlyEquivalent: "$99/mo billed annually",
    blurb: "High-capacity VisualFX studio with admin and shared workflows.",
    modelLine: "PicDrift + FX models + Studio Admin",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=a97eb2df-59b6-4500-ba93-618171001d4b&checkoutFlowId=e90e22a5-29ed-4093-b268-7838c0fca777",
    routingDomain: "vfx.byok.link",
    usersLabel: "10 users",
    projectsLabel: "300 projects",
    storageLabel: "30GB shared storage",
    adminLabel: "Admin panel enabled",
    retentionLabel: "45-day media retention",
  },
  {
    code: "VFX_STUDIO_AGENCY",
    title: "VisualFX Agency",
    annualPrice: "$2,364",
    monthlyEquivalent: "$197/mo billed annually",
    blurb: "Agency-scale operations with expanded seats and project capacity.",
    modelLine: "PicDrift + FX models + Agency controls",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=4785cf91-670a-416f-8bb1-637b926bf2a0&checkoutFlowId=893f469b-9e21-4baa-bb7b-3217b96aa285",
    routingDomain: "agency.byok.link",
    usersLabel: "25 users",
    projectsLabel: "900 projects",
    storageLabel: "80GB shared storage",
    adminLabel: "Advanced admin controls",
    retentionLabel: "90-day media retention",
  },
];

export const ByokLanding = () => {
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

    const resolvedUser = useAuth.getState().user;
    if (resolvedUser?.id) {
      try {
        const handoffResponse = await apiEndpoints.startWorkspaceHandoff(resolvedUser.id);
        const handoffUrl = handoffResponse.data?.handoffUrl;
        const domainSwitchRequired = handoffResponse.data?.domainSwitchRequired === true;
        if (
          domainSwitchRequired &&
          typeof handoffUrl === "string" &&
          handoffUrl.trim()
        ) {
          const targetUrl = new URL(handoffUrl);
          const hashParams = new URLSearchParams(
            targetUrl.hash.startsWith("#") ? targetUrl.hash.slice(1) : "",
          );
          hashParams.set("next", nextPath);
          targetUrl.hash = hashParams.toString();
          window.location.replace(targetUrl.toString());
          return;
        }
      } catch {
        // Fall through to canonical fallback below.
      }
    }

    const redirectUrl = getCanonicalDomainRedirectUrl(resolvedUser ?? null);
    if (redirectUrl) {
      const targetUrl = new URL(redirectUrl);
      targetUrl.pathname = "/";
      targetUrl.hash = "";
      targetUrl.search = "";
      const prefillEmail = email.trim().toLowerCase() || resolvedUser?.email || "";
      if (prefillEmail) {
        targetUrl.searchParams.set("login_email", prefillEmail);
      }
      if (resolvedUser?.id) {
        targetUrl.searchParams.set("login_profile", resolvedUser.id);
      }
      window.location.replace(targetUrl.toString());
      return;
    }

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
      <div className="absolute inset-0 bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />

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
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 text-sm text-slate-200/85 md:flex">
              <Link to="/terms" className="transition-colors hover:text-white">
                Terms
              </Link>
              <Link to="/privacy" className="transition-colors hover:text-white">
                Privacy
              </Link>
              <a
                href="https://www.picdrift.com/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white"
              >
                Contact
              </a>
            </div>
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
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-gray-950/90 p-4 backdrop-blur-md">
          <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-cyan-400/25 bg-[#060b1f] p-6 shadow-[0_30px_90px_rgba(2,8,23,0.82)] sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                  BYOK Packages
                </p>
                <h3 className="mt-2 text-3xl font-black text-white">Upgrade Anytime</h3>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
                  Choose a package that matches your production scale. Starting from $9/mo billed annually.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-8 overflow-y-auto pr-1 sm:pr-2">
              <div className="mb-8 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-xs text-slate-200 sm:grid-cols-3 sm:p-6">
                <div>
                  <p className="font-black uppercase tracking-[0.12em] text-cyan-200">1. Choose Plan</p>
                  <p className="mt-2 leading-relaxed text-slate-300">Open secure checkout in a new tab.</p>
                </div>
                <div>
                  <p className="font-black uppercase tracking-[0.12em] text-cyan-200">2. Complete Payment</p>
                  <p className="mt-2 leading-relaxed text-slate-300">Checkout confirms your selected package.</p>
                </div>
                <div>
                  <p className="font-black uppercase tracking-[0.12em] text-cyan-200">3. Start Rendering</p>
                  <p className="mt-2 leading-relaxed text-slate-300">Log in and link your Fal key in dashboard.</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {BYOK_LANDING_PLANS.map((plan) => (
                  <article
                    key={plan.code}
                    className={`relative flex h-full flex-col rounded-2xl border p-6 shadow-xl transition-all ${
                      plan.featured
                        ? "border-amber-300/40 bg-[linear-gradient(165deg,rgba(120,53,15,0.4),rgba(3,7,18,0.94))]"
                        : "border-white/12 bg-[linear-gradient(165deg,rgba(15,23,42,0.82),rgba(2,6,23,0.9))]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                          {plan.code.replaceAll("_", " ")}
                        </p>
                        <h4 className="mt-2 text-xl font-black text-white">{plan.title}</h4>
                      </div>
                      {plan.highlight && (
                        <span className="rounded-lg border border-amber-300/45 bg-amber-300/15 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-100">
                          {plan.highlight}
                        </span>
                      )}
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-slate-300">{plan.blurb}</p>
                    <p className="mt-2 text-xs text-cyan-200">{plan.modelLine}</p>

                    <div className="mt-6 flex items-end gap-2">
                      <span className="text-4xl font-black text-white">{plan.annualPrice}</span>
                      <span className="pb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        /year
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300">{plan.monthlyEquivalent}</p>

                    <div className="mt-6 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/25 p-4">
                      <p className="text-xs text-slate-200">{plan.usersLabel}</p>
                      <p className="text-xs text-slate-200">{plan.projectsLabel}</p>
                      {plan.storageLabel && (
                        <p className="text-xs text-slate-200">{plan.storageLabel}</p>
                      )}
                      <p className="text-xs text-slate-200">{plan.adminLabel}</p>
                      <p className="text-xs text-slate-200">{plan.retentionLabel}</p>
                      <p className="text-xs text-cyan-200">Domain: {plan.routingDomain}</p>
                    </div>

                    <div className="mt-6">
                      <a
                        href={plan.checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(249,115,22,0.32)] transition-all hover:brightness-110"
                      >
                        Choose {plan.title}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-gray-200 sm:w-auto"
              >
                I&apos;ll upgrade later
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
