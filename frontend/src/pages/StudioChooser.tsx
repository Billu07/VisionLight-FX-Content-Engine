import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth, type WorkspaceProfile } from "../hooks/useAuth";
import { setActiveProfile } from "../lib/api";

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

  if (user && !profileSelectionRequired && profiles.length <= 1) {
    return <Navigate to="/projects" replace />;
  }

  if ((!profileSelectionRequired && !user) || profiles.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_32%),linear-gradient(135deg,#030712,#0b1120_52%,#020617)] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center">
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
                className="group rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 text-left shadow-2xl backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/[0.09] disabled:cursor-wait disabled:opacity-60"
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
                <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    {profile.role || "USER"}
                  </span>
                  <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    {profile.isOrgActive === false ? "Inactive" : "Active"}
                  </span>
                </div>
                <div className="mt-6 text-xs font-bold uppercase tracking-widest text-cyan-200 opacity-80 transition-opacity group-hover:opacity-100">
                  {selectingId === profile.id ? "Opening..." : "Enter Dashboard"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            Logout / use another email
          </button>
        </div>
      </div>
    </div>
  );
}
