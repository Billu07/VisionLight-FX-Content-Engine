import { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

// --- EXISTING IMPORTS ---
import { MarketingSite } from "./pages/MarketingSite";
import Dashboard from "./pages/Dashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import TenantDashboard from "./pages/TenantDashboard";
import Projects from "./pages/Projects";
import StudioChooser from "./pages/StudioChooser";
import { SupportHandoff } from "./pages/SupportHandoff";
import ResetPassword from "./pages/ResetPassword";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandProvider } from "./contexts/BrandContext";
import { useAuth } from "./hooks/useAuth";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { installAlertBridge } from "./lib/notifications";
import { getCanonicalDomainRedirectUrl } from "./lib/domain-routing";

// --- NEW IMPORTS (Add these) ---
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";

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
  const redirectUrl = getCanonicalDomainRedirectUrl(user);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isLoading || !user || !redirectUrl || hasRedirectedRef.current) return;

    hasRedirectedRef.current = true;
    window.location.replace(redirectUrl);
  }, [isLoading, user, redirectUrl]);

  if (isLoading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (profileSelectionRequired) return <Navigate to="/studios" replace />;

  if (!user) return <Navigate to="/" state={{ from: location }} replace />;

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

// --- 🔒 Admin Only Route ---
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, checkAuth, profileSelectionRequired } = useAuth();
  const redirectUrl = getCanonicalDomainRedirectUrl(user);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isLoading || !user || !redirectUrl || hasRedirectedRef.current) return;

    hasRedirectedRef.current = true;
    window.location.replace(redirectUrl);
  }, [isLoading, user, redirectUrl]);

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

  return <>{children}</>;
};

function App() {
  useEffect(() => {
    const restore = installAlertBridge();
    return restore;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={5000}
          toastOptions={{
            className: "!bg-gray-900 !text-gray-100 !border !border-white/10",
          }}
        />
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<MarketingSite />} />

            {/* --- ADD THESE NEW ROUTES --- */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/studios" element={<StudioChooser />} />
            <Route path="/support-handoff" element={<SupportHandoff />} />
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
                  <ProjectRoute>
                    <ErrorBoundary>
                      <Dashboard />
                    </ErrorBoundary>
                  </ProjectRoute>
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

            <Route path="/demo" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </BrandProvider>
    </QueryClientProvider>
  );
}

export default App;
