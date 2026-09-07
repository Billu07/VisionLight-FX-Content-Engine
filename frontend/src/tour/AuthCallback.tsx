import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { DriftThemeStyles, useDriftTheme } from "../rotation3d/driftUiTheme";
import { CREATOR_START, ensureCreatorProfile, errorMessage, takeNext } from "./tourSession";

/**
 * /auth/callback — where Google sign-in and the email-confirmation link land.
 * supabase-js reads the tokens out of the URL on load; we wait for that session,
 * provision the creator profile, then continue to where the person was going.
 */

type Session = NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>;

// Supabase reports link errors in the URL (expired link, denied consent…).
const urlError = (): string | null => {
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const desc = hash.get("error_description") || query.get("error_description");
  const code = hash.get("error") || query.get("error");
  if (!desc && !code) return null;
  return (desc || code || "").replace(/\+/g, " ");
};

const waitForSession = (ms: number): Promise<Session | null> =>
  new Promise((resolve) => {
    let done = false;
    const finish = (s: Session | null) => {
      if (done) return;
      done = true;
      resolve(s);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) finish(s);
    });
    setTimeout(() => {
      data.subscription.unsubscribe();
      finish(null);
    }, ms);
  });

export default function AuthCallback() {
  const navigate = useNavigate();
  const [theme] = useDriftTheme();
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const linkError = urlError();
      if (linkError) throw new Error(linkError);
      const session = await waitForSession(10000);
      if (!session) throw new Error("We couldn't finish signing you in. Please try again.");
      const meta = (session.user?.user_metadata || {}) as Record<string, unknown>;
      const name = String(meta.full_name || meta.name || "").trim();
      await ensureCreatorProfile(name || undefined);
      window.history.replaceState(null, "", "/auth/callback");
      navigate(takeNext(), { replace: true });
    })().catch((e) => {
      if (alive) setError(errorMessage(e));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="drift-ui d-page" data-theme={theme}>
      <DriftThemeStyles />
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
        {error ? (
          <div className="d-card d-card-pad" style={{ maxWidth: 420, display: "grid", gap: 12 }}>
            <div className="d-eyebrow">Sign-in</div>
            <div className="d-h2">That didn't go through</div>
            <div className="d-banner err">{error}</div>
            <Link to={CREATOR_START} className="d-btn primary" style={{ textDecoration: "none" }}>
              Back to sign-in
            </Link>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div className="d-wordmark" style={{ marginBottom: 10 }}>
              drift<i>.li</i>
            </div>
            <div className="d-faint" style={{ fontSize: 13 }}>Signing you in…</div>
          </div>
        )}
      </div>
    </div>
  );
}
