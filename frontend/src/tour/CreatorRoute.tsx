import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { setActiveProfile } from "../lib/api";
import { DriftThemeStyles, useDriftTheme } from "../rotation3d/driftUiTheme";
import { CREATOR_START, ensureCreatorProfile, errorMessage } from "./tourSession";

/**
 * Gate for creator pages (drift.li/tour/*): the visitor must be signed in on
 * their creator (TOUR) profile.
 * - signed out → /tour/start, remembering where they were going
 * - several profiles → the creator profile is activated automatically (no chooser)
 * - signed in on a studio/brand profile → offer to create their creator space
 */
export default function CreatorRoute({ children }: { children: React.ReactNode }) {
  const { user, profiles, isLoading, profileSelectionRequired, checkAuth } = useAuth();
  const location = useLocation();
  const [theme] = useDriftTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activating = useRef(false);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const creatorProfile = profiles.find((p) => p.view === "TOUR");

  // A multi-profile email lands here needing a workspace: pick the creator one.
  useEffect(() => {
    if (isLoading || activating.current || !profileSelectionRequired || !creatorProfile) return;
    activating.current = true;
    setActiveProfile(creatorProfile.id, creatorProfile.organizationName || creatorProfile.email);
    checkAuth().finally(() => {
      activating.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, profileSelectionRequired, creatorProfile?.id]);

  if (isLoading || (profileSelectionRequired && creatorProfile)) {
    return (
      <div className="drift-ui d-page" data-theme={theme}>
        <DriftThemeStyles />
        <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
          <div className="d-faint" style={{ fontSize: 13 }}>Loading your space…</div>
        </div>
      </div>
    );
  }

  if (!user && !profileSelectionRequired) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${CREATOR_START}?next=${next}`} replace />;
  }

  if (user?.view === "TOUR") return <>{children}</>;

  // Signed in, but on a studio/brand workspace (or a chooser with no creator profile).
  const email = user?.email || profiles[0]?.email || "";
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureCreatorProfile();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="drift-ui d-page" data-theme={theme}>
      <DriftThemeStyles />
      <main className="d-main" style={{ maxWidth: 520 }}>
        <div className="d-card d-card-pad" style={{ display: "grid", gap: 14 }}>
          <div className="d-eyebrow">drift.li · creator suite</div>
          <h1 className="d-h1" style={{ fontSize: 24 }}>Set up your creator space</h1>
          <p className="d-sub">
            You're signed in as <strong style={{ color: "var(--text)" }}>{email}</strong>. Your creator
            space is a separate, personal workspace for tours — your other workspaces stay exactly as
            they are.
          </p>
          {error && <div className="d-banner err">{error}</div>}
          <button className="d-btn primary" style={{ padding: "12px 16px", fontSize: 14 }} disabled={busy} onClick={create}>
            {busy ? "Setting up…" : "Create my creator space"}
          </button>
        </div>
      </main>
    </div>
  );
}
