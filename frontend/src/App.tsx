import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- EXISTING IMPORTS ---
import { MarketingSite } from "./pages/MarketingSite";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandProvider } from "./contexts/BrandContext";
import { useAuth } from "./hooks/useAuth";
import { LoadingSpinner } from "./components/LoadingSpinner";

// --- NEW IMPORTS (Add these) ---
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";

// Define your Admin Email here
const ADMIN_EMAILS = ["snowfix07@gmail.com", "keith@picdrift.com"];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// --- Standard Protected Route ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, checkAuth } = useAuth();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;

  return <>{children}</>;
};

// --- 🔒 Admin Only Route ---
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );

  // 1. Must be logged in
  if (!user) return <Navigate to="/" replace />;

  // 2. Must be in the Allowed List
  if (!ADMIN_EMAILS.includes(user.email)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<MarketingSite />} />

            {/* --- ADD THESE NEW ROUTES --- */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* --------------------------- */}

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <Dashboard />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* 🔒 ADMIN ROUTE */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <ErrorBoundary>
                    <AdminDashboard />
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
