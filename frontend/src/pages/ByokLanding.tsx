import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  apiEndpoints,
  clearActiveProfile,
  clearSupportSessionToken,
  setActiveProfile,
  setAuthToken,
} from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { notify } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { DashboardEntryLoader } from "../components/DashboardEntryLoader";
import { getCanonicalDomainRedirectUrl } from "../lib/domain-routing";

type AuthMode = "signup" | "login";
type BillingCycle = "monthly" | "annual";

type ByokLandingPlan = {
  code: string;
  title: string;
  monthlyPrice: string;
  annualPrice: string;
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
    monthlyPrice: "$9/mo",
    annualPrice: "$108/yr",
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
    monthlyPrice: "$14/mo",
    annualPrice: "$168/yr",
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
    monthlyPrice: "$49/mo",
    annualPrice: "$588/yr",
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
    monthlyPrice: "$99/mo",
    annualPrice: "$1,188/yr",
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
    monthlyPrice: "$197/mo",
    annualPrice: "$2,364/yr",
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
  const [showPackageSheet, setShowPackageSheet] = useState(false);
  const [packageBillingCycle, setPackageBillingCycle] = useState<BillingCycle>("monthly");
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStudioLoader, setShowStudioLoader] = useState(false);
  const shouldStayOnLanding = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("stay") === "1" || params.get("landing") === "1";
  }, []);

  const clearSourceDomainSession = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // no-op
    }
    clearSupportSessionToken();
    clearActiveProfile();
    setAuthToken(null);
  };

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
          await clearSourceDomainSession();
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
      await clearSourceDomainSession();
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
      if (shouldStayOnLanding) return;
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
  }, [shouldStayOnLanding]);

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
            <button
              type="button"
              onClick={() => setShowPackageSheet(true)}
              className="rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-8 py-4 text-sm font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Dashboard Pricing
            </button>
          </div>
          <p className="mt-5 text-sm font-semibold text-cyan-100">
            Packages start from $9/mo (annual billing).
          </p>
          <p className="mt-2 text-sm text-cyan-200/85">
            14-day trial with full dashboard access.
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

      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-12 lg:px-12">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#081126]/82 p-6 shadow-[0_28px_80px_rgba(2,8,23,0.55)] backdrop-blur-xl sm:p-8">
          <div className="pointer-events-none absolute -left-24 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-20 h-64 w-64 rounded-full bg-cyan-400/18 blur-3xl" />

          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/85">
              Prebuilt Dashboards
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Clean by Default. Ready Instantly.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
              Same platform feel, now shown with real dashboard-style previews and model coverage.
            </p>
          </div>

          <div className="relative mt-6 grid gap-3 rounded-2xl border border-white/10 bg-[#09142a]/85 p-4 text-sm text-slate-200 sm:grid-cols-3 sm:p-5">
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">Use your own Fal key</p>
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">No platform credit markup</p>
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">Cancel or upgrade anytime</p>
          </div>

          <div className="relative mt-6 grid gap-4 lg:grid-cols-12">
            <article className="rounded-2xl border border-fuchsia-300/25 bg-[#0b1428]/92 p-4 lg:col-span-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-200">
                    PicDrift
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-white">Image & Animation</h3>
                </div>
                <span className="rounded-lg border border-fuchsia-300/30 bg-fuchsia-300/10 px-2 py-1 text-[10px] font-semibold uppercase text-fuchsia-100">
                  App
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <img src="/login-previews/optimized/preview_character_1-sm.webp" alt="Character preview" className="h-20 w-full rounded-lg border border-white/10 object-cover" />
                <img src="/login-previews/optimized/preview_abstract_1-sm.webp" alt="Abstract preview" className="h-20 w-full rounded-lg border border-white/10 object-cover" />
                <img src="/login-previews/optimized/preview_landscape_1-sm.webp" alt="Landscape preview" className="h-20 w-full rounded-lg border border-white/10 object-cover" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-200">
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">Nano Banana</span>
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">GPT-2</span>
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">Kling</span>
              </div>
            </article>

            <article className="rounded-2xl border border-cyan-300/25 bg-[#0b1428]/92 p-4 lg:col-span-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                    VisualFX
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-white">Video Models</h3>
                </div>
                <span className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase text-cyan-100">
                  Pro
                </span>
              </div>
              <img
                src="/login-previews/optimized/cinematic_futuristic-poster.webp"
                alt="VisualFX cinematic preview"
                className="mt-4 h-32 w-full rounded-xl border border-white/10 object-cover"
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <img src="/login-previews/optimized/d3-poster.webp" alt="Video preview 1" className="h-16 w-full rounded-lg border border-white/10 object-cover" />
                <img src="/login-previews/optimized/d4-poster.webp" alt="Video preview 2" className="h-16 w-full rounded-lg border border-white/10 object-cover" />
                <img src="/login-previews/optimized/d5-poster.webp" alt="Video preview 3" className="h-16 w-full rounded-lg border border-white/10 object-cover" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-200">
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">Seedance 2.0</span>
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">Kling 3.0</span>
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">Veo 3.1</span>
                <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1">Topaz</span>
              </div>
            </article>

            <article className="rounded-2xl border border-emerald-300/25 bg-[#0b1428]/92 p-4 lg:col-span-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                    Studio
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-white">Team & Management</h3>
                </div>
                <span className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-100">
                  Studio
                </span>
              </div>
              <img
                src="/login-previews/optimized/preview_night_street-md.webp"
                alt="Studio preview panel"
                className="mt-4 h-32 w-full rounded-xl border border-white/10 object-cover"
              />
              <div className="mt-4 space-y-2 text-sm text-slate-200">
                <p>Team members and shared folders</p>
                <p>More storage and cleaner project flow</p>
                <p>Central controls for scaling work</p>
              </div>
              <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                Full Studio access during trial
              </div>
            </article>
          </div>

          <div className="relative mt-6 grid gap-3 rounded-2xl border border-white/10 bg-[#09142a]/90 p-4 sm:grid-cols-3 sm:p-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-200">Apps</p>
              <p className="mt-2 text-2xl font-extrabold text-white">From $9/mo</p>
              <p className="mt-1 text-sm text-slate-300">Direct usage. No markup.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">BYOK</p>
              <p className="mt-2 text-sm text-slate-200">Use your own Fal key</p>
              <p className="mt-1 text-sm text-slate-200">Pay provider directly</p>
              <p className="mt-1 text-sm text-slate-200">No platform credit markup</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Studio</p>
              <p className="mt-2 text-xl font-extrabold text-white">Upgrade Anytime</p>
              <p className="mt-1 text-sm text-slate-300">Scale seats, storage, and admin flow when needed.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-7 text-xs text-slate-200/90 lg:px-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <span className="text-white/35">|</span>
          <Link to="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
          <span className="text-white/35">|</span>
          <a
            href="https://www.picdrift.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-white"
          >
            Contact
          </a>
        </div>
      </footer>

      {showPackageSheet && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-gray-950/90 p-4 backdrop-blur-md">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-600/45 bg-[#070f1f] p-5 shadow-[0_26px_70px_rgba(2,8,23,0.72)] sm:p-7">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                  BYOK Packages
                </p>
                <h3 className="mt-2 text-2xl font-extrabold text-white">Upgrade Anytime</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                  Choose a package that matches your production scale.
                </p>
                <p className="mt-3 max-w-2xl rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-100">
                  Important: use the same email for checkout and BYOK login so your package activates instantly.
                </p>
                <div className="mt-4 inline-flex rounded-xl border border-white/15 bg-[#0b1629] p-1">
                  <button
                    type="button"
                    onClick={() => setPackageBillingCycle("monthly")}
                    className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                      packageBillingCycle === "monthly"
                        ? "bg-cyan-300/20 text-cyan-100"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setPackageBillingCycle("annual")}
                    className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                      packageBillingCycle === "annual"
                        ? "bg-cyan-300/20 text-cyan-100"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Annually
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="rounded-xl border border-slate-500/50 bg-slate-900/70 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-200 transition hover:border-slate-400 hover:bg-slate-800/80"
              >
                Close
              </button>
            </div>
            <div className="mt-5 border-t border-white/10" />

            <div className="mt-6 overflow-y-auto pr-1 sm:pr-2">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {BYOK_LANDING_PLANS.map((plan, index) => {
                  const centeredRowClass =
                    BYOK_LANDING_PLANS.length === 5 && index === 3
                      ? "lg:col-start-2"
                      : BYOK_LANDING_PLANS.length === 5 && index === 4
                        ? "lg:col-start-4"
                        : "";
                  return (
                    <article
                      key={plan.code}
                      className={`relative flex h-full flex-col rounded-2xl border bg-[#0e1729] p-5 shadow-[0_14px_32px_rgba(2,10,26,0.45)] transition-all lg:col-span-2 ${centeredRowClass} ${
                        plan.featured
                          ? "border-cyan-300/45"
                          : "border-white/12"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                            {plan.code.replaceAll("_", " ")}
                          </p>
                          <h4 className="mt-1.5 text-xl font-extrabold text-white">{plan.title}</h4>
                        </div>
                        {plan.highlight && (
                          <span className="rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-cyan-100">
                            {plan.highlight}
                          </span>
                        )}
                      </div>

                      <p className="mt-4 text-sm leading-relaxed text-slate-300">{plan.blurb}</p>
                      <p className="mt-2 text-xs text-slate-400">{plan.modelLine}</p>

                      <div className="relative mt-6 h-11 overflow-hidden">
                        <span
                          className={`absolute left-0 top-0 text-3xl font-extrabold text-white transition-all duration-300 ${
                            packageBillingCycle === "monthly"
                              ? "translate-y-0 opacity-100"
                              : "translate-y-2 opacity-0"
                          }`}
                        >
                          {plan.monthlyPrice}
                        </span>
                        <span
                          className={`absolute left-0 top-0 text-3xl font-extrabold text-white transition-all duration-300 ${
                            packageBillingCycle === "annual"
                              ? "translate-y-0 opacity-100"
                              : "translate-y-2 opacity-0"
                          }`}
                        >
                          {plan.annualPrice}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {packageBillingCycle === "monthly" ? "Monthly View" : "Annual View"}
                      </p>

                      <div className="mt-5 grid grid-cols-1 divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0a1222]">
                        <p className="px-3 py-2 text-xs text-slate-200">{plan.usersLabel}</p>
                        <p className="px-3 py-2 text-xs text-slate-200">{plan.projectsLabel}</p>
                        {plan.storageLabel && (
                          <p className="px-3 py-2 text-xs text-slate-200">{plan.storageLabel}</p>
                        )}
                        <p className="px-3 py-2 text-xs text-slate-200">{plan.adminLabel}</p>
                        <p className="px-3 py-2 text-xs text-slate-200">{plan.retentionLabel}</p>
                        <p className="px-3 py-2 text-xs text-slate-300">Domain: {plan.routingDomain}</p>
                      </div>

                      <div className="mt-5">
                        <a
                          href={plan.checkoutUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-full rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/20"
                        >
                          Choose {plan.title}
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => setShowPackageSheet(false)}
                className="w-full rounded-xl border border-slate-500/50 bg-slate-900/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:border-slate-400 hover:bg-slate-800/80 sm:w-auto"
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
