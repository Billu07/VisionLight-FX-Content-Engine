import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints, setActiveProfile } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { PageRef } from "./types";
import { TourShell, apiError } from "./tourUi";
import { CREATOR_START } from "./tourSession";

/**
 * drift.li/tour/invite/{token} — a General page invited a Pro to manage it. Shows
 * whose page it is and who it was sent to; a visitor creates a Pro account or logs in
 * (and comes straight back here); a signed-in person accepts and lands on the page as
 * one of its admins.
 */

type InviteInfo = { email: string; page: PageRef; status: string };

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

  const signedIn = !!user || profileSelectionRequired;
  const signedInEmail = user?.email || profiles[0]?.email || "";
  const here = `/tour/invite/${token}`;
  const emailParam = info?.email ? `&email=${encodeURIComponent(info.email)}` : "";
  const signupUrl = `${CREATOR_START}?type=pro&next=${encodeURIComponent(here)}${emailParam}`;
  const loginUrl = `${CREATOR_START}?mode=login&next=${encodeURIComponent(here)}${emailParam}`;

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await apiEndpoints.driftAcceptTourInvite(token);
      setActiveProfile(r.data.profileId, r.data.page?.name);
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
          <div className="d-eyebrow">Invite a Pro</div>
          {error && !info ? (
            <>
              <h1 className="d-h1" style={{ fontSize: 22 }}>
                This invite can't be used
              </h1>
              <div className="d-banner err">{error}</div>
              <Link to="/tour" className="d-btn" style={{ textDecoration: "none", justifySelf: "start" }}>
                drift.li tour
              </Link>
            </>
          ) : !info || isLoading ? (
            <div className="d-faint" style={{ fontSize: 13 }}>
              Loading your invite…
            </div>
          ) : (
            <>
              <h1 className="d-h1" style={{ fontSize: 24, lineHeight: 1.2 }}>
                Manage {info.page.name} on drift.li
              </h1>
              <p className="d-sub">
                You've been invited to build and manage Drift Tours for <b style={{ color: "var(--text)" }}>{info.page.name}</b>{" "}
                with your existing equipment and skills. The invite was sent to{" "}
                <b style={{ color: "var(--text)" }}>{info.email}</b>.
              </p>
              {info.status === "EXPIRED" ? (
                <div className="d-banner warn">This invite has expired — ask {info.page.name} to send a new one.</div>
              ) : info.status === "ACCEPTED" ? (
                <div className="d-banner ok" style={{ flexWrap: "wrap" }}>
                  <span>This invite has already been accepted.</span>
                  {info.page.path && (
                    <Link to={info.page.path} className="d-btn sm" style={{ textDecoration: "none" }}>
                      Open the page
                    </Link>
                  )}
                </div>
              ) : signedIn ? (
                <>
                  {signedInEmail && (
                    <p className="d-sub" style={{ fontSize: 13, margin: 0 }}>
                      Signed in as <b style={{ color: "var(--text)" }}>{signedInEmail}</b>.
                    </p>
                  )}
                  {error && <div className="d-banner err">{error}</div>}
                  <button className="d-btn primary" style={{ padding: "13px 18px", fontSize: 14.5 }} onClick={accept} disabled={busy}>
                    {busy ? "Accepting…" : "Accept invite"}
                  </button>
                </>
              ) : (
                <div className="t-actions">
                  <Link className="d-btn primary" to={signupUrl} style={{ textDecoration: "none" }}>
                    Create a Pro account
                  </Link>
                  <Link className="d-btn" to={loginUrl} style={{ textDecoration: "none" }}>
                    Log in
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
