import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth, type WorkspaceProfile } from "../hooks/useAuth";
import { apiEndpoints, setActiveProfile } from "../lib/api";

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

const isLocalHost = (host: string) =>
  host === "localhost" ||
  host === "0.0.0.0" ||
  host === "::1" ||
  host.startsWith("127.") ||
  host.endsWith(".local");

const profileLabel = (profile: WorkspaceProfile) =>
  profile.organizationName || profile.name || profile.email;

export default function StudioChooser() {
  const { checkAuth, isLoading, logout, profileSelectionRequired, profiles, user } = useAuth();
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleSelect = async (profile: WorkspaceProfile) => {
    setSelectingId(profile.id);
    setActiveProfile(profile.id, profileLabel(profile));

    const canonicalDomain = sanitizeDomain(profile.canonicalDomain);
    const currentHost = sanitizeDomain(window.location.host);
    if (
      canonicalDomain &&
      currentHost &&
      currentHost !== canonicalDomain &&
      !isLocalHost(currentHost)
    ) {
      try {
        const handoff = await apiEndpoints.startWorkspaceHandoff(profile.id);
        const handoffUrl = handoff.data?.handoffUrl;
        if (typeof handoffUrl === "string" && handoffUrl.trim()) {
          window.location.replace(handoffUrl);
          return;
        }
      } catch {
        // Fall back to legacy login-prefill redirect if handoff fails.
      }

      const redirectUrl = new URL(window.location.href);
      redirectUrl.hostname = canonicalDomain;
      redirectUrl.pathname = "/";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("login_email", profile.email);
      redirectUrl.searchParams.set("login_profile", profile.id);
      window.location.replace(redirectUrl.toString());
      return;
    }

    const result = await checkAuth();
    if (result.profileSelectionRequired) {
      setSelectingId(null);
      return;
    }
    navigate("/projects", { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  }

  if (user?.readOnlyImpersonation) {
    return <Navigate to="/projects" replace />;
  }

  if (user && !profileSelectionRequired && profiles.length <= 1) {
    return <Navigate to="/projects" replace />;
  }

  if ((!profileSelectionRequired && !user) || profiles.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(6,182,212,0.18),transparent_36%),radial-gradient(circle_at_82%_82%,rgba(217,70,239,0.12),transparent_34%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300">
            Select Workspace
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
            Choose the studio you want to enter
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-gray-400">
            This email has access to multiple organizations. Pick one workspace first; projects, credits, assets, and admin permissions will load for that studio only.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((profile) => {
            const isPicdrift = profile.view === "PICDRIFT";
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelect(profile)}
                disabled={!!selectingId}
                className="group rounded-[1.75rem] border border-white/10 bg-gray-900/75 p-6 text-left shadow-[0_18px_42px_rgba(2,8,23,0.4)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-gray-900 disabled:cursor-wait disabled:opacity-60"
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black text-white">
                      {profile.organizationName || "Personal Workspace"}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">{profile.email}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-widest ${isPicdrift ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200" : "border-amber-300/30 bg-amber-300/10 text-amber-200"}`}>
                    {isPicdrift ? "PicDrift" : "VisualFX"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                      profile.role === "SUPERADMIN"
                        ? "bg-violet-400/18 text-violet-100"
                        : profile.role === "ADMIN"
                          ? "bg-cyan-400/15 text-cyan-100"
                          : "bg-white/8 text-gray-300"
                    }`}
                  >
                    {profile.role || "USER"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                      profile.isOrgActive === false
                        ? "bg-rose-400/16 text-rose-100"
                        : "bg-emerald-400/20 text-emerald-100"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        profile.isOrgActive === false ? "bg-rose-300" : "bg-emerald-300"
                      }`}
                    />
                    {profile.isOrgActive === false ? "Inactive" : "Active"}
                  </span>
                </div>
                <div className="mt-6 text-xs font-bold uppercase tracking-widest text-cyan-200 opacity-80 transition-opacity group-hover:opacity-100">
                  <span className="inline-flex items-center gap-2">
                    {selectingId === profile.id && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                    {selectingId === profile.id ? "Opening..." : "Enter Dashboard"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-white/10 bg-gray-900/80 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Logout / use another email
          </button>
        </div>
      </div>
    </div>
  );
}
