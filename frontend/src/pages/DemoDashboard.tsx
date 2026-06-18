import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Dashboard from "./Dashboard";
import { DemoPricingModal } from "../components/DemoPricingModal";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { API_BASE_URL, setDemoMode, clearDemoMode } from "../lib/api";
import { getSiteBrand } from "../lib/branding";

type DemoView = "PICDRIFT" | "VISIONLIGHT";

const defaultViewFromBrand = (): DemoView =>
  getSiteBrand() === "picdrift" ? "PICDRIFT" : "VISIONLIGHT";

// Synthetic, view-aware user shaped so the real dashboard renders the normal
// create surface — no auth token, no byok, no locks.
const makeDemoUser = (view: DemoView) => ({
  id: "demo",
  authUserId: "demo",
  email: "demo@picdrift.com",
  name: "Demo Studio",
  creditSystem: "COMMERCIAL",
  role: "USER",
  organizationId: null,
  organizationName: "Demo Studio",
  organizationIsDefault: true,
  organizationTenantPlan: "PAID",
  demoExpired: false,
  isOrgActive: true,
  needsActivation: false,
  orgLockReason: null,
  videoEditorEnabledForAll: true,
  carouselEnabledForAll: true,
  view,
  orgViewType: view,
  maxProjects: 3,
  isSuperAdmin: false,
  adminCreditLimitsEnabled: false,
  canonicalDomain: null,
  domainRoutingEnabled: false,
  domainRedirectRequired: false,
});

async function fetchDemoContent(view: DemoView) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/demo/content?view=${view}`);
    const data = await res.json();
    return {
      posts: Array.isArray(data?.posts) ? data.posts : [],
      assets: Array.isArray(data?.assets) ? data.assets : [],
    };
  } catch {
    return { posts: [], assets: [] };
  }
}

export default function DemoDashboard() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialView = useRef<DemoView>(
    (() => {
      const param = new URLSearchParams(location.search).get("view");
      const upper = param?.toUpperCase();
      if (upper === "PICDRIFT" || upper === "VISIONLIGHT") return upper;
      return defaultViewFromBrand();
    })(),
  ).current;

  const [view, setView] = useState<DemoView>(initialView);
  const [ready, setReady] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const applyDemo = async (v: DemoView) => {
    const { posts, assets } = await fetchDemoContent(v);
    const user = makeDemoUser(v);
    setDemoMode({ view: v, posts, assets, user });
    localStorage.setItem("visionlight_active_project", "demo");
    useAuth.setState({
      user: user as any,
      isLoading: false,
      token: "demo",
      profiles: [],
      profileSelectionRequired: false,
    });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["user-credits"] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    setReady(true);
  };

  // Initial load.
  useEffect(() => {
    void applyDemo(initialView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup when leaving the demo so the real app re-authenticates normally.
  useEffect(() => {
    return () => {
      clearDemoMode();
      localStorage.removeItem("visionlight_active_project");
      useAuth.setState({
        user: null,
        token: null,
        isLoading: false,
        profiles: [],
        profileSelectionRequired: false,
      });
    };
  }, []);

  // Any blocked action (mutation) surfaces the pricing page.
  useEffect(() => {
    const handler = () => setShowPricing(true);
    window.addEventListener("visionlight:demo-locked", handler);
    return () => window.removeEventListener("visionlight:demo-locked", handler);
  }, []);

  const switchView = (v: DemoView) => {
    if (v === view) return;
    setView(v);
    void applyDemo(v);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070a20]">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  }

  return (
    <>
      <Dashboard />

      {/* Demo control pill — read-only badge + view toggle + sign up */}
      <div className="fixed left-1/2 top-2 z-[150] -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#070a20]/90 px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <span className="hidden rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:inline">
            Demo · Read-only
          </span>
          <div className="flex rounded-full bg-white/5 p-0.5">
            {(["VISIONLIGHT", "PICDRIFT"] as DemoView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  view === v ? "bg-white text-gray-900" : "text-gray-300 hover:text-white"
                }`}
              >
                {v === "PICDRIFT" ? "PicDrift" : "Visionlight"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowPricing(true)}
            className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white transition hover:from-cyan-400 hover:to-blue-400"
          >
            Sign Up
          </button>
        </div>
      </div>

      {showPricing && <DemoPricingModal onClose={() => setShowPricing(false)} />}
    </>
  );
}
