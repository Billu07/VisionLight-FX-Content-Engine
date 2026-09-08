import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { DriftThemeStyles, ThemeToggle, useDriftTheme } from "../rotation3d/driftUiTheme";
import { TOUR_STYLES } from "./tourUi";
import {
  ensureCreatorProfile,
  errorMessage,
  isConfirmRequired,
  nextFromLocation,
  rememberNext,
  signInWithGoogle,
} from "./tourSession";

/**
 * /tour/start — sign up / log in for the drift.li creator suite. Mobile-first:
 * one calm card; on wide screens a short value prop sits beside it. Google
 * one-tap or email + password (with email confirmation), then straight into the
 * creator's space — or the demo tour when they came from "View demo".
 */

type Mode = "signup" | "login" | "forgot" | "sent";

// Google sign-in needs the Supabase Google provider (a Google Cloud OAuth client).
// Off until that's configured: set VITE_TOUR_GOOGLE_AUTH=1 at build time to show it.
const GOOGLE_ENABLED = import.meta.env.VITE_TOUR_GOOGLE_AUTH === "1";

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z" />
    <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const STYLES = `
.ta-wrap{min-height:100dvh;display:grid;grid-template-rows:auto 1fr}
.ta-body{display:grid;place-items:center;padding:24px 16px 48px}
.ta-grid{width:100%;max-width:960px;display:grid;gap:28px;align-items:center}
@media(min-width:880px){.ta-grid{grid-template-columns:1.05fr .95fr;gap:56px}}
.ta-pitch{display:none}
@media(min-width:880px){.ta-pitch{display:block}}
.ta-pitch h1{font-size:clamp(30px,4vw,44px);line-height:1.05;letter-spacing:-.025em;font-weight:800;margin:14px 0 14px}
.ta-pitch h1 i{font-style:normal;color:var(--accent)}
.ta-pitch p{font-size:15.5px;line-height:1.6;color:var(--muted);max-width:44ch}
.ta-steps{display:grid;gap:10px;margin-top:22px}
.ta-step{display:flex;gap:12px;align-items:flex-start;font-size:14px;color:var(--text)}
.ta-step b{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--accent-soft);color:var(--accent);font-size:12px;flex:none;border:1px solid var(--accent-border)}
.ta-step span{color:var(--muted)}
.ta-card{width:100%;max-width:440px;justify-self:center;display:grid;gap:14px;padding:clamp(20px,4vw,28px)}
.ta-title{font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.ta-google{width:100%;padding:12px 14px;font-size:14px;gap:10px}
.ta-or{display:flex;align-items:center;gap:12px;color:var(--faint);font-size:11.5px;text-transform:uppercase;letter-spacing:.08em}
.ta-or:before,.ta-or:after{content:"";flex:1;height:1px;background:var(--border)}
.ta-form{display:grid;gap:12px}
.ta-form .d-input{padding:12px 13px;font-size:15px}
.ta-submit{width:100%;padding:13px 16px;font-size:14.5px}
.ta-links{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--muted);flex-wrap:wrap}
.ta-links button,.ta-links a{appearance:none;background:none;border:0;padding:0;color:var(--accent);font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
.ta-links button:hover,.ta-links a:hover{text-decoration:underline}
.ta-fine{font-size:12px;color:var(--faint);line-height:1.5}
.ta-fine a{color:var(--muted);text-decoration:underline}
.ta-sent{display:grid;gap:10px;text-align:center;padding:8px 0}
.ta-sent .ico{width:56px;height:56px;border-radius:18px;margin:0 auto 4px;display:grid;place-items:center;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);font-size:24px}
`;

export default function TourAuth() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profiles, profileSelectionRequired, isLoading, checkAuth } = useAuth();
  const [theme, toggleTheme] = useDriftTheme();

  const params = new URLSearchParams(location.search);
  const next = nextFromLocation(location.search);
  const [mode, setMode] = useState<Mode>(params.get("mode") === "login" ? "login" : "signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Already signed in on a creator profile? Straight through.
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isLoading && user?.view === "TOUR") navigate(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user?.view]);

  // Already signed in on a studio/brand profile (or a multi-workspace login): the
  // creator space is only ever created from this explicit confirmation.
  const [confirmPending, setConfirmPending] = useState(false);
  const signedInElsewhere = !isLoading && (user ? user.view !== "TOUR" : profileSelectionRequired);
  const signedInEmail = user?.email || profiles[0]?.email || email.trim();
  const continueSignedIn = async () => {
    setBusy(true);
    setError("");
    try {
      rememberNext(next);
      await ensureCreatorProfile(undefined, { confirm: true });
      navigate(next, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Provision a brand-new identity right away; an existing studio/brand account is
  // never converted silently — surface the confirmation instead.
  const provisionOrAsk = async (displayName?: string) => {
    try {
      await ensureCreatorProfile(displayName);
    } catch (e) {
      if (!isConfirmRequired(e)) throw e;
      await checkAuth();
      setConfirmPending(true);
      setNotice("You're signed in. Confirm below to create your creator space.");
      return;
    }
    navigate(next, { replace: true });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setNotice("");
  };

  const google = async () => {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle(next);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(em, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
        return;
      }
      if (mode === "signup" && password.length < 8) throw new Error("Use at least 8 characters for your password.");
      rememberNext(next);
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: em,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        // Supabase returns an identity-less user for an email that already exists.
        if (data.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
          setMode("login");
          setError("You already have an account with this email — log in instead.");
          return;
        }
        if (!data.session) {
          setMode("sent");
          return;
        }
        await provisionOrAsk(name.trim() || undefined);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw error;
        if (!data.session) throw new Error("Unable to start a session.");
        await provisionOrAsk();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setNotice("Sent again — give it a minute and check spam too.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "login" ? "Welcome back" : mode === "forgot" ? "Reset your password" : mode === "sent" ? "Check your inbox" : "Create your first tour";
  const sub =
    mode === "login"
      ? "Log in to your creator space."
      : mode === "forgot"
        ? "We'll email you a link to set a new password."
        : mode === "sent"
          ? ""
          : "Free to start. Turn three phone clips into an interactive tour in minutes.";

  return (
    <div className="drift-ui d-page t-page" data-theme={theme}>
      <DriftThemeStyles />
      <style>{TOUR_STYLES}</style>
      <style>{STYLES}</style>
      <div className="ta-wrap">
        <header className="d-topbar">
          <Link to="/" className="d-wordmark" style={{ textDecoration: "none" }}>
            drift<i>.li</i>
          </Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>
        <div className="ta-body">
          <div className="ta-grid">
            <section className="ta-pitch">
              <div className="d-eyebrow">Tour · creator suite</div>
              <h1>
                Film it on your phone.
                <br />
                Make it a <i>tour</i>.
              </h1>
              <p>
                Short clips become drift paths people scrub with a finger — connected into a guided
                walkthrough with headlines and buttons. No app, no editing.
              </p>
              <div className="ta-steps">
                <div className="ta-step">
                  <b>1</b>
                  <div>
                    Upload three clips <span>— up to 5 seconds each</span>
                  </div>
                </div>
                <div className="ta-step">
                  <b>2</b>
                  <div>
                    Add a title, a headline, a button <span>— we build every step</span>
                  </div>
                </div>
                <div className="ta-step">
                  <b>3</b>
                  <div>
                    Share one link <span>— the path links itself, even after reordering</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="d-card ta-card">
              {mode === "sent" ? (
                <div className="ta-sent">
                  <div className="ico">✉</div>
                  <div className="ta-title">Check your inbox</div>
                  <p className="d-sub">
                    We sent a confirmation link to <strong style={{ color: "var(--text)" }}>{email.trim()}</strong>. Open it on
                    this device and you'll land straight in your creator space.
                  </p>
                  {notice && <div className="d-banner ok">{notice}</div>}
                  {error && <div className="d-banner err">{error}</div>}
                  <div className="ta-links" style={{ justifyContent: "center", marginTop: 6 }}>
                    <button type="button" onClick={resend} disabled={busy}>
                      Resend email
                    </button>
                    <button type="button" onClick={() => switchMode("login")}>
                      Already confirmed? Log in
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="d-eyebrow" style={{ marginBottom: 8 }}>
                      {mode === "login" ? "Creator login" : "Start free"}
                    </div>
                    <div className="ta-title">{title}</div>
                    {sub && (
                      <p className="d-sub" style={{ marginTop: 6 }}>
                        {sub}
                      </p>
                    )}
                  </div>

                  {(signedInElsewhere || confirmPending) && mode !== "forgot" && (
                    <div className="d-banner" style={{ display: "grid", gap: 8 }}>
                      <span>
                        You're signed in as <strong>{signedInEmail}</strong>, which already has a workspace. Create a
                        separate creator space for it? Your existing workspace stays exactly as it is.
                      </span>
                      <button type="button" className="d-btn primary" onClick={continueSignedIn} disabled={busy}>
                        {busy ? "One moment…" : "Continue with this account"}
                      </button>
                    </div>
                  )}
                  {GOOGLE_ENABLED && mode !== "forgot" && (
                    <>
                      <button type="button" className="d-btn ta-google" onClick={google} disabled={busy}>
                        <GoogleMark />
                        Continue with Google
                      </button>
                      <div className="ta-or">or</div>
                    </>
                  )}

                  <form className="ta-form" onSubmit={submit}>
                    {mode === "signup" && (
                      <div>
                        <label className="d-label" htmlFor="ta-name">
                          Your name
                        </label>
                        <input
                          id="ta-name"
                          className="d-input"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="How should we call you?"
                          autoComplete="name"
                        />
                      </div>
                    )}
                    <div>
                      <label className="d-label" htmlFor="ta-email">
                        Email
                      </label>
                      <input
                        id="ta-email"
                        className="d-input"
                        type="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                    {mode !== "forgot" && (
                      <div>
                        <label className="d-label" htmlFor="ta-password">
                          Password
                        </label>
                        <input
                          id="ta-password"
                          className="d-input"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                          autoComplete={mode === "signup" ? "new-password" : "current-password"}
                          required
                          minLength={mode === "signup" ? 8 : undefined}
                        />
                      </div>
                    )}
                    {error && <div className="d-banner err">{error}</div>}
                    {notice && <div className="d-banner ok">{notice}</div>}
                    <button type="submit" className="d-btn primary ta-submit" disabled={busy}>
                      {busy
                        ? "One moment…"
                        : mode === "signup"
                          ? "Create my free account"
                          : mode === "login"
                            ? "Log in"
                            : "Send reset link"}
                    </button>
                  </form>

                  <div className="ta-links">
                    {mode === "signup" && (
                      <>
                        <span>
                          Have an account?{" "}
                          <button type="button" onClick={() => switchMode("login")}>
                            Log in
                          </button>
                        </span>
                      </>
                    )}
                    {mode === "login" && (
                      <>
                        <span>
                          New here?{" "}
                          <button type="button" onClick={() => switchMode("signup")}>
                            Start free
                          </button>
                        </span>
                        <button type="button" onClick={() => switchMode("forgot")}>
                          Forgot password?
                        </button>
                      </>
                    )}
                    {mode === "forgot" && (
                      <button type="button" onClick={() => switchMode("login")}>
                        ← Back to log in
                      </button>
                    )}
                  </div>

                  {mode === "signup" && (
                    <div className="ta-fine">
                      By continuing you agree to the <a href="/terms">Terms</a> and{" "}
                      <a href="/privacy">Privacy Policy</a>.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
