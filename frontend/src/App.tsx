import { Suspense, useEffect, useRef, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

// --- App shell (eager: needed before any route renders) ---
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandProvider } from "./contexts/BrandContext";
import { useAuth } from "./hooks/useAuth";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { installAlertBridge } from "./lib/notifications";
import { getCanonicalDomainRedirectUrl } from "./lib/domain-routing";
import { DashboardEntryLoader } from "./components/DashboardEntryLoader";
import { useAutoAppRefresh } from "./hooks/useAutoAppRefresh";
import { lazyRoute } from "./lib/lazyRoute";
import { loadDriftPlayer, loadTourPage, loadTourPathway } from "./routeChunks";
import {
  isRotation3dSite,
  isDriftHost,
  looksLikePlatformHost,
  getPlayerBrand,
  getResolvedDriftBrandSlug,
  setResolvedDriftHost,
} from "./lib/branding";
import { apiEndpoints } from "./lib/api";

// --- Routes: each is its own chunk, so a drift.li visitor never downloads the studio
// (and a studio user never downloads the tour player) until they go there. ---
const MarketingSite = lazyRoute(() => import("./pages/MarketingSite").then((m) => ({ default: m.MarketingSite })));
const Pricing = lazyRoute(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const Dashboard = lazyRoute(() => import("./pages/Dashboard"));
const SuperAdminDashboard = lazyRoute(() => import("./pages/SuperAdminDashboard"));
const TenantDashboard = lazyRoute(() => import("./pages/TenantDashboard"));
const Projects = lazyRoute(() => import("./pages/Projects"));
const DemoDashboard = lazyRoute(() => import("./pages/DemoDashboard"));
const StudioChooser = lazyRoute(() => import("./pages/StudioChooser"));
const SupportHandoff = lazyRoute(() => import("./pages/SupportHandoff").then((m) => ({ default: m.SupportHandoff })));
const ResetPassword = lazyRoute(() => import("./pages/ResetPassword"));
const BillingReturn = lazyRoute(() => import("./pages/BillingReturn"));
const AuthHandoff = lazyRoute(() => import("./pages/AuthHandoff"));
const Terms = lazyRoute(() => import("./pages/Terms").then((m) => ({ default: m.Terms })));
const Privacy = lazyRoute(() => import("./pages/Privacy").then((m) => ({ default: m.Privacy })));
const Rotation3DDemo = lazyRoute(() => import("./rotation3d/Rotation3DDemo"));
const Rotation3DLanding = lazyRoute(() => import("./rotation3d/Rotation3DLanding"));
const DriftLanding = lazyRoute(() => import("./rotation3d/DriftLanding"));
const Rotation3DPlayer = lazyRoute(loadDriftPlayer);
const BrandShowcasePage = lazyRoute(() => import("./rotation3d/BrandShowcasePage"));
const Rotation3DBrandDashboard = lazyRoute(() => import("./rotation3d/Rotation3DBrandDashboard"));
const DriftBrandDashboard = lazyRoute(() => import("./rotation3d/DriftBrandDashboard"));
const TourAuth = lazyRoute(() => import("./tour/TourAuth"));
const AuthCallback = lazyRoute(() => import("./tour/AuthCallback"));
const TourIndex = lazyRoute(() => import("./tour/TourIndex").then((m) => ({ default: m.TourIndex })));
const TourEditRedirect = lazyRoute(() => import("./tour/TourIndex").then((m) => ({ default: m.TourEditRedirect })));
const TourPage = lazyRoute(loadTourPage);
const TourPathway = lazyRoute(loadTourPathway);
const TourInviteAccept = lazyRoute(() => import("./tour/TourInviteAccept"));
const DriftViewLanding = lazyRoute(() => import("./rotation3d/DriftViewLanding"));
const DriftMemoryLanding = lazyRoute(() => import("./rotation3d/DriftMemoryLanding"));
const DriftPathLanding = lazyRoute(() => import("./rotation3d/DriftPathLanding"));

// Shown only while a route's code loads on a first visit — in-app navigations keep the
// current screen up meanwhile (router transitions). Blank for a beat, then a spinner.
const RouteFallback = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 350);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true">
      {show && <LoadingSpinner size="lg" variant="neon" />}
    </div>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// --- Admin Dashboard Switcher ---
const AdminDashboardSwitcher = () => {
  const { user } = useAuth();
  // In BYOK workspaces, always use the tenant admin surface so integrations
  // (Fal key link) and org-scoped controls are available.
  if (user?.byok?.isByok) return <TenantDashboard />;
  if (user?.role === "SUPERADMIN") return <SuperAdminDashboard />;
  return <TenantDashboard />;
};

const DeactivatedAccountScreen = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4 text-gray-200">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-gray-900 p-8 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] sm:p-12">
        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10">
          <span className="text-5xl text-rose-300">!</span>
        </div>
        <h1 className="mb-4 text-3xl font-black uppercase tracking-[0.2em] text-white">
          Account Deactivated
        </h1>
        <p className="mb-10 text-sm leading-relaxed text-gray-400 sm:text-base">
          Your organization{" "}
          <span className="font-bold text-white">
            {user?.organizationName || "workspace"}
          </span>{" "}
          is currently deactivated.
          <br />
          <br />
          Please contact your platform administrator to reactivate your account.
        </p>
        <button
          onClick={logout}
          className="w-full rounded-2xl border border-white/10 bg-gray-800 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Switch Account / Logout
        </button>
      </div>
    </div>
  );
};

// --- Standard Protected Route ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, checkAuth, profileSelectionRequired } = useAuth();
  const location = useLocation();
  const isDashboardPath = location.pathname === "/app";
  const redirectUrl = getCanonicalDomainRedirectUrl(user, {
    suspendRedirect: location.pathname === "/billing/return",
  });
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (
      isLoading ||
      profileSelectionRequired ||
      !user ||
      !redirectUrl ||
      hasRedirectedRef.current
    )
      return;

    hasRedirectedRef.current = true;
    window.location.replace(redirectUrl);
  }, [isLoading, profileSelectionRequired, user, redirectUrl]);

  if (isLoading)
    return isDashboardPath ? (
      <DashboardEntryLoader playMode="loop" overlay />
    ) : (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (profileSelectionRequired) return <Navigate to="/studios" replace />;

  if (!user) return <Navigate to="/" state={{ from: location }} replace />;

  if (redirectUrl) {
    return isDashboardPath ? (
      <DashboardEntryLoader playMode="loop" overlay />
    ) : (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  }

  if (user.orgLockReason === "DEACTIVATED") {
    return <DeactivatedAccountScreen />;
  }

  return <>{children}</>;
};

// --- Project Selected Route ---
const ProjectRoute = ({ children }: { children: React.ReactNode }) => {
  const activeProject = localStorage.getItem("visionlight_active_project");
  
  if (!activeProject) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
};

// --- App Entry ---
// Rotation3D brand admins land in their brand dashboard; every other studio
// keeps the exact existing project-scoped dashboard (no behavior change).
const AppEntry = () => {
  const { user } = useAuth();
  // drift.li creators (view "TOUR") have their own home under /tour.
  if (user?.view === "TOUR") return <Navigate to="/tour" replace />;
  if (user?.view === "ROTATION3D") {
    return (
      <ErrorBoundary>
        <Rotation3DBrandDashboard />
      </ErrorBoundary>
    );
  }
  if (user?.view === "DRIFT") {
    return (
      <ErrorBoundary>
        <DriftBrandDashboard />
      </ErrorBoundary>
    );
  }
  return (
    <ProjectRoute>
      <ErrorBoundary>
        <Dashboard />
      </ErrorBoundary>
    </ProjectRoute>
  );
};

// --- 🔒 Admin Only Route ---
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, checkAuth, profileSelectionRequired } = useAuth();
  const location = useLocation();
  const redirectUrl = getCanonicalDomainRedirectUrl(user, {
    suspendRedirect: location.pathname === "/billing/return",
  });
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (
      isLoading ||
      profileSelectionRequired ||
      !user ||
      !redirectUrl ||
      hasRedirectedRef.current
    )
      return;

    hasRedirectedRef.current = true;
    window.location.replace(redirectUrl);
  }, [isLoading, profileSelectionRequired, user, redirectUrl]);

  if (isLoading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );

  if (profileSelectionRequired) return <Navigate to="/studios" replace />;

  // 1. Must be logged in
  if (!user) return <Navigate to="/" replace />;

  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  }

  if (user.orgLockReason === "DEACTIVATED") {
    return <DeactivatedAccountScreen />;
  }

  // 2. Must be an Admin or SuperAdmin
  const isAdmin = user.role === "ADMIN" || user.role === "SUPERADMIN";
  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }
  if (user.byok?.adminPanelLocked) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
};

// The "/" element. Custom drift domains (resolved at boot) show that brand's
// showcase; drift.li itself shows the generic landing; rotation3d its landing;
// everything else the studio marketing site.
const RootRoute = () => {
  if (isRotation3dSite()) return <Rotation3DLanding />;
  const customBrand = getResolvedDriftBrandSlug();
  if (customBrand) return <BrandShowcasePage brandSlugOverride={customBrand} />;
  if (typeof window !== "undefined" && isDriftHost(window.location.hostname)) return <DriftLanding />;
  return <MarketingSite />;
};

// For hosts that aren't a known platform host, resolve whether it's a brand's
// custom drift domain BEFORE rendering routes (so drift routing is set up). Known
// hosts (rotation3d/drift/studio) skip the lookup and render immediately.
const AppBootGate = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(
    () =>
      typeof window === "undefined" ||
      looksLikePlatformHost(window.location.hostname) ||
      getPlayerBrand() !== null,
  );
  useEffect(() => {
    if (ready) return;
    let alive = true;
    apiEndpoints
      .driftResolveHost(window.location.hostname)
      .then((r) => {
        if (alive && r.data?.brandSlug) setResolvedDriftHost(r.data.brandSlug);
      })
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready]);
  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  return <>{children}</>;
};

function App() {
  useAutoAppRefresh();

  useEffect(() => {
    const restore = installAlertBridge();
    return restore;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <Toaster
          theme="dark"
          position="top-center"
          closeButton
          visibleToasts={4}
          duration={4800}
          offset={18}
          gap={12}
          toastOptions={{
            classNames: {
              toast:
                "!w-[min(92vw,420px)] !items-start !gap-3 !rounded-2xl !border !border-white/10 !bg-[#0b0f1c]/90 !px-4 !py-3.5 !text-gray-100 !backdrop-blur-2xl !ring-1 !ring-inset !ring-white/5 !shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)]",
              title: "!text-[13.5px] !font-semibold !tracking-tight !text-white",
              description: "!mt-0.5 !text-[12.5px] !leading-relaxed !text-gray-400",
              icon: "!mt-0.5",
              actionButton:
                "!rounded-lg !bg-white !px-3 !py-1.5 !text-[11px] !font-bold !text-gray-900 !transition-colors hover:!bg-gray-200",
              cancelButton:
                "!rounded-lg !border !border-white/12 !bg-white/[0.06] !px-3 !py-1.5 !text-[11px] !font-semibold !text-gray-200 !transition-colors hover:!bg-white/[0.12]",
              closeButton:
                "!border !border-white/12 !bg-white/[0.08] !text-gray-300 !backdrop-blur hover:!bg-white/[0.16] hover:!text-white",
              success: "!border-l-[3px] !border-l-emerald-400/90",
              error: "!border-l-[3px] !border-l-rose-400/90",
              warning: "!border-l-[3px] !border-l-amber-400/90",
              info: "!border-l-[3px] !border-l-cyan-400/90",
            },
          }}
        />
        <AppBootGate>
        <Router>
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public Routes. On the Rotation3D host, "/" is the Rotation3D
                landing; every other domain keeps the studio marketing site.
                The rest of the routes (auth, chooser, dashboards) are shared,
                so brands can log in on rotation3d.com too. */}
            <Route path="/" element={<RootRoute />} />
            {/* Rotation3D public player + iframe embed (linked from rotation3d.com) */}
            <Route path="/p/:productId" element={<Rotation3DPlayer />} />
            <Route path="/embed/:productId" element={<Rotation3DPlayer />} />
            <Route path="/embed/showcase/:brandSlug" element={<BrandShowcasePage embed />} />
            <Route path="/pricing" element={<Pricing />} />

            {/* --- ADD THESE NEW ROUTES --- */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/studios" element={<StudioChooser />} />
            <Route path="/support-handoff" element={<SupportHandoff />} />
            <Route path="/auth/handoff" element={<AuthHandoff />} />
            {/* drift.li creator suite — auth. Google/email-confirm links land on /auth/callback. */}
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/tour/start" element={<TourAuth />} />
            <Route path="/tour/invite/:token" element={<TourInviteAccept />} />
            {/* drift.li/tour — a signed-in creator lands on their page. Pages and pathways
                are public (their admins see the tools in place); a drift's readable link
                plays in the player. /tour/:id/edit and /tour/{old-slug} still resolve. */}
            <Route path="/tour" element={<TourIndex />} />
            <Route path="/tour/:id/edit" element={<TourEditRedirect />} />
            <Route path="/tour/:page" element={<TourPage />} />
            <Route path="/tour/:page/:tour" element={<TourPathway />} />
            <Route path="/tour/:tourPage/:tourFlow/:tourDrift" element={<Rotation3DPlayer />} />
            {/* drift.li product landings — coming soon, each with its wait list */}
            <Route path="/view" element={<DriftViewLanding />} />
            <Route path="/memory" element={<DriftMemoryLanding />} />
            <Route path="/path" element={<DriftPathLanding />} />
            <Route
              path="/billing/return"
              element={<BillingReturn />}
            />
            {/* --------------------------- */}

            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <Projects />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppEntry />
                </ProtectedRoute>
              }
            />

            {/* 🔒 ADMIN ROUTE */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <ErrorBoundary>
                    <AdminDashboardSwitcher />
                  </ErrorBoundary>
                </AdminRoute>
              }
            />

            {/* Public, read-only demo preview (no auth, no mutations) */}
            <Route path="/demo" element={<DemoDashboard />} />
            {/* Rotation3D — public player preview (no auth). Path-gated for now;
                moves behind the Rotation3D domain once DNS + branding land. */}
            <Route path="/rotation3d" element={<Rotation3DDemo />} />
            {/* Rotation3D vanity URLs (kept last so specific routes win):
                /{brand}/{product} = player, /{brand} = brand showcase.
                Non-Rotation3D hosts fall through to "/" inside the components. */}
            <Route path="/:brandSlug/:productSlug" element={<Rotation3DPlayer />} />
            <Route path="/:brandSlug" element={<BrandShowcasePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </Router>
        </AppBootGate>
      </BrandProvider>
    </QueryClientProvider>
  );
}

export default App;
