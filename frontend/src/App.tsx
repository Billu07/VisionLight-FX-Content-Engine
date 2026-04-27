import { useEffect } from "react";
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

// --- Standard Protected Route ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, checkAuth } = useAuth();
  const location = useLocation();
  const redirectUrl = getCanonicalDomainRedirectUrl(user);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && user && redirectUrl) {
      window.location.replace(redirectUrl);
    }
  }, [isLoading, user, redirectUrl]);

  if (isLoading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;

  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
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
  const { user, isLoading, checkAuth } = useAuth();
  const redirectUrl = getCanonicalDomainRedirectUrl(user);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && user && redirectUrl) {
      window.location.replace(redirectUrl);
    }
  }, [isLoading, user, redirectUrl]);

  if (isLoading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );

  // 1. Must be logged in
  if (!user) return <Navigate to="/" replace />;

  if (redirectUrl) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
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
