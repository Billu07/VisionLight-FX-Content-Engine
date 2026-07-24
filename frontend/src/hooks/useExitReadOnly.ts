import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiEndpoints,
  stopReadOnlyImpersonation,
  clearSupportSessionToken,
  setSupportSessionToken,
  setAuthToken,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Shared "exit read-only impersonation" flow. Used by the studio Dashboard and
 * the Rotation3D brand dashboard so both surfaces restore the operator's own
 * (superadmin/agency) session identically. Handles three paths:
 *   1. Same-domain: re-sync the API token from the operator's still-present
 *      Supabase session and restore them directly (avoids a stale-token bounce
 *      to login).
 *   2. Cross-domain: workspace handoff back to the operator's canonical domain.
 *   3. Local recovery fallback if neither of the above yields a session.
 *
 * Extracted verbatim from Dashboard.handleExitReadOnly so behaviour is unchanged.
 */
export function useExitReadOnly() {
  const navigate = useNavigate();
  const { user, checkAuth } = useAuth();
  const [exiting, setExiting] = useState(false);

  const exitReadOnly = async () => {
    if (exiting) return;
    setExiting(true);
    const impersonatorId = user?.impersonator?.id;
    const impersonatorEmail =
      typeof user?.impersonator?.email === "string"
        ? user.impersonator.email.trim().toLowerCase()
        : "";

    try {
      // Same-domain read-only: the operator's own Supabase session is still
      // present on this domain. It may have refreshed in the background while the
      // read-only view sat idle, so re-sync the API token from it and restore the
      // operator directly. This prevents a stale/expired API token from dropping
      // us at the login screen on exit. (Cross-domain has no local Supabase
      // session, so this is skipped and the workspace handoff below runs.)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          setAuthToken(session.access_token);
          stopReadOnlyImpersonation();
          clearSupportSessionToken();
          const directAuth = await checkAuth();
          if (directAuth.hasUser) {
            const restored = useAuth.getState().user;
            const isAdmin =
              restored?.role === "ADMIN" || restored?.role === "SUPERADMIN";
            navigate(isAdmin ? "/admin" : "/projects", { replace: true });
            return;
          }
        }
      } catch {
        // No usable local Supabase session (cross-domain) — fall through to the
        // workspace handoff path below.
      }

      try {
        if (impersonatorId) {
          const handoffRes = await apiEndpoints.startWorkspaceHandoff(
            impersonatorId,
            "/admin",
          );
          const handoffUrl =
            typeof handoffRes.data?.handoffUrl === "string"
              ? handoffRes.data.handoffUrl.trim()
              : "";
          const sessionToken =
            typeof handoffRes.data?.sessionToken === "string"
              ? handoffRes.data.sessionToken.trim()
              : "";
          const sessionLabel =
            handoffRes.data?.target?.email ||
            handoffRes.data?.target?.name ||
            "Workspace Session";
          if (handoffRes.data?.domainSwitchRequired && handoffUrl) {
            stopReadOnlyImpersonation();
            clearSupportSessionToken();
            window.location.replace(handoffUrl);
            return;
          }
          if (sessionToken) {
            stopReadOnlyImpersonation();
            setSupportSessionToken(sessionToken, sessionLabel);
            await checkAuth();
            navigate("/admin", { replace: true });
            return;
          }
        }
      } catch {
        // Fall through to local recovery path below.
      }

      stopReadOnlyImpersonation();
      clearSupportSessionToken();
      const authState = await checkAuth();
      if (!authState.hasUser) {
        if (impersonatorEmail) {
          try {
            const domainRes = await apiEndpoints.resolveAuthDomain(impersonatorEmail);
            const canonicalDomainRaw = domainRes.data?.canonicalDomain;
            const canonicalDomain =
              typeof canonicalDomainRaw === "string"
                ? canonicalDomainRaw.trim().toLowerCase()
                : "";
            if (
              canonicalDomain &&
              canonicalDomain !== window.location.hostname.toLowerCase()
            ) {
              const targetUrl = new URL(
                `${window.location.protocol}//${canonicalDomain}/admin`,
              );
              targetUrl.searchParams.set("login_email", impersonatorEmail);
              window.location.replace(targetUrl.toString());
              return;
            }
          } catch {
            // Fall through to default auth route.
          }
        }
        navigate("/", { replace: true });
        return;
      }

      const restoredUser = useAuth.getState().user;
      const isAdminProfile =
        restoredUser?.role === "ADMIN" || restoredUser?.role === "SUPERADMIN";
      navigate(isAdminProfile ? "/admin" : "/projects", { replace: true });
    } finally {
      setExiting(false);
    }
  };

  return { exitReadOnly, exiting };
}
