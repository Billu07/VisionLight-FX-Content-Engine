import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints, setActiveProfile } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { PageRef, PageRole } from "./types";
import { TourShell, apiError } from "./tourUi";
import { CREATOR_START } from "./tourSession";
import { invalidateMyPages } from "./myPages";

/**
 * drift.li/tour/invite/{token} — someone was invited to a page as an Admin, Editor or
 * Viewer. Shows whose page it is, the role and who it was sent to; a visitor creates an
 * account or logs in (and comes straight back here); a signed-in person accepts and lands
 * on the page.
 */

type InviteInfo = { email: string; page: PageRef; status: string; role?: PageRole };

const ROLE_LINE: Record<PageRole, { as: string; can: string }> = {
  ADMIN: { as: "an Admin", can: "manage the page, its people and its tours" },
  EDITOR: { as: "an Editor", can: "build and publish its Drift Tours" },
  VIEWER: { as: "a Viewer", can: "see all of its tours, drafts included" },
};

export default function TourInviteAccept() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { user, profiles, isLoading, profileSelectionRequired, checkAuth } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftTourInvite(token)
      .then((r) => alive && setInfo(r.data.invite))
      .catch((e) => alive && setError(apiError(e)));
    return () => {
      alive = false;
    };
  }, [token]);

  const role: PageRole = info?.role || "ADMIN";
  const signedIn = !!user || profileSelectionRequired;
  const signedInEmail = user?.email || profiles[0]?.email || "";
  const here = `/tour/invite/${token}`;
  const emailParam = info?.email ? `&email=${encodeURIComponent(info.email)}` : "";
  // Joining a page needs an account only — the sign-up skips the page type and own page.
  const signupUrl = `${CREATOR_START}?next=${encodeURIComponent(here)}${emailParam}`;
  const loginUrl = `${CREATOR_START}?mode=login&next=${encodeURIComponent(here)}${emailParam}`;

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await apiEndpoints.driftAcceptTourInvite(token);
      setActiveProfile(r.data.profileId, r.data.page?.name);
      invalidateMyPages();
      await checkAuth();
      navigate(r.data.page?.path || "/tour/dashboard", { replace: true });
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TourShell>
      <div style={{ maxWidth: 540, margin: "4vh auto 0" }}>
        <div className="d-card d-card-pad t-rise" style={{ display: "grid", gap: 14 }}>
          <div className="d-eyebrow">Page Invite</div>
          {error && !info ? (
            <>
              <h1 className="d-h1" style={{ fontSize: 22 }}>
                This Invite Can't Be Used
              </h1>
              <div className="d-banner err">{error}</div>
              <Link to="/tour" className="d-btn" style={{ textDecoration: "none", justifySelf: "start" }}>
                drift.li Tour
              </Link>
            </>
          ) : !info || isLoading ? (
            <div className="d-faint" style={{ fontSize: 13 }}>
              Loading Your Invite…
            </div>
          ) : (
            <>
              <h1 className="d-h1" style={{ fontSize: 24, lineHeight: 1.2 }}>
                Join {info.page.name} on drift.li
              </h1>
              <p className="d-sub">
                You've been invited to <b style={{ color: "var(--text)" }}>{info.page.name}</b> as {ROLE_LINE[role].as} — you'll be
                able to {ROLE_LINE[role].can}. The invite was sent to <b style={{ color: "var(--text)" }}>{info.email}</b>.
              </p>
              {info.status === "EXPIRED" ? (
                <div className="d-banner warn">This Invite Has Expired — Ask {info.page.name} to Send a New One.</div>
              ) : info.status === "ACCEPTED" ? (
                <div className="d-banner ok" style={{ flexWrap: "wrap" }}>
                  <span>This Invite Has Already Been Accepted.</span>
                  {info.page.path && (
                    <Link to={info.page.path} className="d-btn sm" style={{ textDecoration: "none" }}>
                      Open the Page
                    </Link>
                  )}
                </div>
              ) : signedIn ? (
                <>
                  {signedInEmail && (
                    <p className="d-sub" style={{ fontSize: 13, margin: 0 }}>
                      Signed In as <b style={{ color: "var(--text)" }}>{signedInEmail}</b>.
                    </p>
                  )}
                  {error && <div className="d-banner err">{error}</div>}
                  <button className="d-btn primary" style={{ padding: "13px 18px", fontSize: 14.5 }} onClick={accept} disabled={busy}>
                    {busy ? "Accepting…" : "Accept Invite"}
                  </button>
                </>
              ) : (
                <div className="t-actions">
                  <Link className="d-btn primary" to={signupUrl} style={{ textDecoration: "none" }}>
                    Create an Account
                  </Link>
                  <Link className="d-btn" to={loginUrl} style={{ textDecoration: "none" }}>
                    Log In
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TourShell>
  );
}
