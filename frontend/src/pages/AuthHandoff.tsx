import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { apiEndpoints, setSupportSessionToken } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

const parsePayloadFromHash = () => {
  const hash = window.location.hash || "";
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const token = params.get("token");
  const nextRaw = params.get("next");
  const nextPath =
    typeof nextRaw === "string" &&
    /^\/[A-Za-z0-9/_-]*$/.test(nextRaw) &&
    !nextRaw.startsWith("//")
      ? nextRaw
      : "/projects";
  return {
    token: typeof token === "string" ? token.trim() : "",
    nextPath,
  };
};

export function AuthHandoff() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const { token, nextPath } = parsePayloadFromHash();
        if (!token) {
          throw new Error("Missing handoff token.");
        }
        // The handoff token can occasionally miss on the very first consume
        // (redirect racing the token store); one short retry makes it reliable.
        let response;
        try {
          response = await apiEndpoints.consumeWorkspaceHandoff(token);
        } catch (firstErr) {
          await new Promise((r) => setTimeout(r, 800));
          response = await apiEndpoints.consumeWorkspaceHandoff(token);
        }
        const sessionToken = response.data?.sessionToken;
        if (!sessionToken || typeof sessionToken !== "string") {
          throw new Error("Workspace session token was not returned.");
        }
        const label =
          response.data?.target?.email ||
          response.data?.target?.name ||
          "Workspace Session";
        setSupportSessionToken(sessionToken, label);
        window.history.replaceState(null, "", "/auth/handoff");
        await checkAuth();
        navigate(nextPath, { replace: true });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Failed to establish workspace handoff session.");
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
              Studio Handoff Failed
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
              Switching Studio
            </h1>
            <p className="mt-4 text-sm text-gray-400">
              Establishing a secure cross-domain workspace session.
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

export default AuthHandoff;
