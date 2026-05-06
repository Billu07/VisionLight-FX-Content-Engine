import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { apiEndpoints, setSupportSessionToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

const parseTokenFromHash = () => {
  const hash = window.location.hash || "";
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const token = params.get("token");
  return typeof token === "string" ? token.trim() : "";
};

export function SupportHandoff() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const token = parseTokenFromHash();
        if (!token) {
          throw new Error("Missing handoff token.");
        }
        const response = await apiEndpoints.consumeSupportHandoff(token);
        const sessionToken = response.data?.sessionToken;
        if (!sessionToken || typeof sessionToken !== "string") {
          throw new Error("Support session token was not returned.");
        }
        const label =
          response.data?.target?.email ||
          response.data?.target?.name ||
          "Support Session";
        setSupportSessionToken(sessionToken, label);
        window.history.replaceState(null, "", "/support-handoff");
        await checkAuth();
        navigate("/projects", { replace: true });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Failed to establish support handoff session.");
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [checkAuth, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-gray-200">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-gray-900 p-8 text-center shadow-[0_0_60px_rgba(0,0,0,0.45)]">
        {error ? (
          <>
            <h1 className="text-2xl font-black uppercase tracking-[0.14em] text-red-300">
              Support Handoff Failed
            </h1>
            <p className="mt-4 text-sm text-gray-400">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="mt-8 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300 transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              Back To Login
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black uppercase tracking-[0.14em] text-white">
              Establishing Support Session
            </h1>
            <p className="mt-4 text-sm text-gray-400">
              Validating one-time handoff token and opening read-only dashboard access.
            </p>
            <div className="mt-8 flex justify-center">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

