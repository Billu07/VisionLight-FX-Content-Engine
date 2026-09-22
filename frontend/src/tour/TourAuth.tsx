import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { DriftThemeStyles } from "../rotation3d/driftUiTheme";
import { TOUR_STYLES } from "./tourUi";
import type { PageRef, PageRole } from "./types";
import { invalidateMyPages } from "./myPages";
import {
  CREATOR_HOME,
  CREATOR_LANDING,
  ensureCreatorProfile,
  errorMessage,
  isConfirmRequired,
  isInvitePath,
  nextFromLocation,
  rememberAccountType,
  rememberNext,
  signInWithGoogle,
  type AccountType,
} from "./tourSession";

/**
 * /tour/start — sign up / log in for the drift.li creator suite. Mobile-first:
 * one calm card. Google one-tap or email + password (with email confirmation), then
 * straight into the creator's space — or the demo tour when they came from "View demo".
 * Two variants:
 * - from an invite link (?next=/tour/invite/…): an account only — no page type and no
 *   page of their own — then back to accept the invite;
 * - ?create=1, signed in with only joined pages: create a page of their own.
 */

type Mode = "signup" | "login" | "forgot" | "sent";

const ACCOUNT_TYPES: { value: AccountType; label: string; who: string; note: string }[] = [
  {
    value: "GENERAL",
    label: "General",
    who: "Realtors · Brands · Venues",
    note: "Build tours of your own spaces — and invite your photographer or videographer any time.",
  },
  {
    value: "PRO",
    label: "Pro",
    who: "Photographers · Videographers",
    note: "Create tour pages for your clients and manage them all from one place.",
  },
];

const ROLE_AS: Record<PageRole, string> = { ADMIN: "an Admin", EDITOR: "an Editor", VIEWER: "a Viewer" };

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
.ta-grid{width:100%;max-width:440px;display:grid;justify-items:center}
.ta-card{position:relative;width:100%;max-width:440px;justify-self:center;display:grid;gap:14px;padding:clamp(20px,4vw,28px)}
.ta-x{position:absolute;top:12px;right:12px;z-index:1}
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
.ta-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ta-type{appearance:none;cursor:pointer;display:grid;gap:3px;text-align:left;padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font:inherit;transition:border-color .16s,background .16s,box-shadow .16s}
.ta-type b{font-size:15px;font-weight:750}
.ta-type span{font-size:11.5px;color:var(--muted);line-height:1.35}
.ta-type:hover{border-color:var(--border-strong)}
.ta-type.on{border-color:var(--accent-border);background:var(--accent-soft);box-shadow:0 0 0 3px var(--accent-soft)}
.ta-type-note{font-size:12px;color:var(--muted);line-height:1.45}
`;

export default function TourAuth() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profiles, profileSelectionRequired, isLoading, checkAuth } = useAuth();
  // × — back where they came from (the Tour landing when they arrived straight here).
  const close = () => (location.key !== "default" ? navigate(-1) : navigate(CREATOR_LANDING));

  const params = new URLSearchParams(location.search);
  const next = nextFromLocation(location.search);
  // From an invite link: they join someone else's page — an account is all they need.
  const joining = isInvitePath(next);
  const inviteToken = joining ? next.slice("/tour/invite/".length).split(/[?#/]/)[0] : "";
  const creating = params.get("create") === "1";
  const [mode, setMode] = useState<Mode>(params.get("mode") === "login" ? "login" : "signup");
  const [name, setName] = useState("");
  // ?type=pro — the landing's "Are you a Photographer?" — starts on Pro.
  const [accountType, setAccountType] = useState<AccountType>(() => {
    const t = (params.get("type") || "").toUpperCase();
    return t === "PRO" ? "PRO" : "GENERAL";
  });
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<{ page: PageRef; role?: PageRole } | null>(null);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Joining: whose page, and as what (shown in the copy).
  useEffect(() => {
    if (!inviteToken) return;
    let alive = true;
    apiEndpoints
      .driftTourInvite(inviteToken)
      .then((r) => alive && setInvite(r.data?.invite || null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [inviteToken]);

  // Already signed in on a creator profile? Straight through — unless they came to create
  // a page of their own.
  useEffect(() => {
    if (!isLoading && user?.view === "TOUR" && !creating) navigate(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user?.view]);
  const ownPageMode = creating && !isLoading && user?.view === "TOUR";

  // Already signed in on a studio/brand profile (or a multi-workspace login): the
  // creator space is only ever created from this explicit confirmation.
  const [confirmPending, setConfirmPending] = useState(false);
  const signedInElsewhere = !isLoading && (user ? user.view !== "TOUR" : profileSelectionRequired);
  const signedInEmail = user?.email || profiles[0]?.email || email.trim();
  const continueSignedIn = async () => {
    if (joining) {
      navigate(next, { replace: true });
      return;
    }
    setBusy(true);
    setError("");
    try {
      rememberNext(next);
      await ensureCreatorProfile(undefined, { confirm: true, accountType });
      navigate(next, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Provision a brand-new identity right away; an existing studio/brand account is
  // never converted silently — surface the confirmation instead. Joining a page by
  // invite provisions nothing: accepting the invite gives them their profile there.
  const provisionOrAsk = async (displayName?: string) => {
    if (joining) {
      await checkAuth();
      navigate(next, { replace: true });
      return;
    }
    try {
      await ensureCreatorProfile(displayName, { accountType });
    } catch (e) {
      if (!isConfirmRequired(e)) throw e;
      await checkAuth();
      setConfirmPending(true);
      setNotice("You're signed in. Confirm below to create your creator space.");
      return;
    }
    navigate(next, { replace: true });
  };

  // Someone who has only joined pages makes one of their own.
  const createOwnPage = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureCreatorProfile(name.trim() || undefined, { confirm: true, accountType, ownPage: true });
      invalidateMyPages();
      navigate(CREATOR_HOME, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
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
      rememberAccountType(joining ? null : accountType);
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
        setNotice("If That Email Has an Account, a Reset Link Is on Its Way.");
        return;
      }
      if (mode === "signup" && password.length < 8) throw new Error("Use at Least 8 Characters for Your Password.");
      rememberNext(next);
      if (mode === "signup") rememberAccountType(joining ? null : accountType);
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
          setError("You Already Have an Account with This Email — Log In Instead.");
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
        if (!data.session) throw new Error("Unable to Start a Session.");
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
      setNotice("Sent Again — Give It a Minute and Check Spam Too.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const inviteLine = invite ? `${invite.page.name} as ${ROLE_AS[invite.role || "ADMIN"]}` : "";
  const eyebrow = ownPageMode ? "Your Own Page" : joining ? "Page Invite" : mode === "login" ? "Creator Login" : "Try It Free";
  const title = ownPageMode
    ? "Create Your Own Page"
    : mode === "login"
      ? "Welcome Back"
      : mode === "forgot"
        ? "Reset Your Password"
        : mode === "sent"
          ? "Check Your Inbox"
          : joining
            ? "Create Your Account"
            : "Create Your First Tour";
  const sub = ownPageMode
    ? "A page of your own for your tours. The pages you've joined stay just as they are."
    : mode === "login"
      ? joining
        ? inviteLine
          ? `Log in to join ${inviteLine}.`
          : "Log In to Accept Your Invite."
        : "Log In to Your Creator Space."
      : mode === "forgot"
        ? "We'll Email You a Link to Set a New Password."
        : mode === "sent"
          ? ""
          : joining
            ? inviteLine
              ? `Then you'll join ${inviteLine}.`
              : "Then You'll Accept Your Invite."
            : "Free to start. Turn three phone clips into an interactive tour in minutes.";

  const typePicker = (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="ta-types" role="radiogroup" aria-label="Account type">
        {ACCOUNT_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={accountType === t.value}
            className={`ta-type ${accountType === t.value ? "on" : ""}`}
            onClick={() => setAccountType(t.value)}
          >
            <b>{t.label}</b>
            <span>{t.who}</span>
          </button>
        ))}
      </div>
      <div className="ta-type-note">{ACCOUNT_TYPES.find((t) => t.value === accountType)?.note}</div>
    </div>
  );
  const nameField = (
    <div>
      <label className="d-label" htmlFor="ta-name">
        {joining ? "Your Name" : "Your Page Name"}
      </label>
      <input
        id="ta-name"
        className="d-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={joining ? "So the Page's Team Knows It's You" : "Your Name or Business Name"}
        autoComplete={joining ? "name" : "organization"}
      />
    </div>
  );

  return (
    <div className="drift-ui d-page t-page" data-theme="dark">
      <DriftThemeStyles />
      <style>{TOUR_STYLES}</style>
      <style>{STYLES}</style>
      <div className="ta-wrap">
        <header className="d-topbar">
          <Link to="/" className="d-wordmark" style={{ textDecoration: "none" }}>
            drift<i>.li</i>
          </Link>
        </header>
        <div className="ta-body">
          <div className="ta-grid">
            <div className="d-card ta-card">
              <button type="button" className="d-x ta-x" onClick={close} aria-label="Close" title="Close">
                ×
              </button>
              {mode === "sent" ? (
                <div className="ta-sent">
                  <div className="ico">✉</div>
                  <div className="ta-title">Check Your Inbox</div>
                  <p className="d-sub">
                    We sent a confirmation link to <strong style={{ color: "var(--text)" }}>{email.trim()}</strong>. Open it on
                    this device and you'll land {joining ? "back on your invite" : "straight in your creator space"}.
                  </p>
                  {notice && <div className="d-banner ok">{notice}</div>}
                  {error && <div className="d-banner err">{error}</div>}
                  <div className="ta-links" style={{ justifyContent: "center", marginTop: 6 }}>
                    <button type="button" onClick={resend} disabled={busy}>
                      Resend Email
                    </button>
                    <button type="button" onClick={() => switchMode("login")}>
                      Already Confirmed? Log In
                    </button>
                  </div>
                </div>
              ) : ownPageMode ? (
                <>
                  <div>
                    <div className="d-eyebrow" style={{ marginBottom: 8 }}>
                      {eyebrow}
                    </div>
                    <div className="ta-title">{title}</div>
                    <p className="d-sub" style={{ marginTop: 6 }}>
                      {sub}
                    </p>
                  </div>
                  <div className="ta-form">
                    {typePicker}
                    {nameField}
                    {error && <div className="d-banner err">{error}</div>}
                    <button type="button" className="d-btn primary ta-submit" onClick={createOwnPage} disabled={busy}>
                      {busy ? "Creating…" : "Create My Page"}
                    </button>
                  </div>
                  <div className="ta-links">
                    <Link to={CREATOR_HOME}>← Back to My Pages</Link>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="d-eyebrow" style={{ marginBottom: 8 }}>
                      {eyebrow}
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
                        {joining ? (
                          <>
                            You're signed in as <strong>{signedInEmail}</strong>. Continue to accept the invite with this
                            account.
                          </>
                        ) : (
                          <>
                            You're signed in as <strong>{signedInEmail}</strong>, which already has a workspace. Create a
                            separate creator space for it? Your existing workspace stays exactly as it is.
                          </>
                        )}
                      </span>
                      <button type="button" className="d-btn primary" onClick={continueSignedIn} disabled={busy}>
                        {busy ? "One Moment…" : joining ? "Continue to the Invite" : "Continue with This Account"}
                      </button>
                    </div>
                  )}
                  {GOOGLE_ENABLED && mode !== "forgot" && (
                    <>
                      <button type="button" className="d-btn ta-google" onClick={google} disabled={busy}>
                        <GoogleMark />
                        Continue with Google
                      </button>
                      <div className="ta-or">Or</div>
                    </>
                  )}

                  <form className="ta-form" onSubmit={submit}>
                    {mode === "signup" && !joining && typePicker}
                    {mode === "signup" && nameField}
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
                          placeholder={mode === "signup" ? "At Least 8 Characters" : "Your Password"}
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
                        ? "One Moment…"
                        : mode === "signup"
                          ? joining
                            ? "Create Account"
                            : "Create My Free Account"
                          : mode === "login"
                            ? "Log In"
                            : "Send Reset Link"}
                    </button>
                  </form>

                  <div className="ta-links">
                    {mode === "signup" && (
                      <span>
                        Have an Account?{" "}
                        <button type="button" onClick={() => switchMode("login")}>
                          Log In
                        </button>
                      </span>
                    )}
                    {mode === "login" && (
                      <>
                        <span>
                          New Here?{" "}
                          <button type="button" onClick={() => switchMode("signup")}>
                            {joining ? "Create an Account" : "Try It Free"}
                          </button>
                        </span>
                        <button type="button" onClick={() => switchMode("forgot")}>
                          Forgot Password?
                        </button>
                      </>
                    )}
                    {mode === "forgot" && (
                      <button type="button" onClick={() => switchMode("login")}>
                        ← Back to Log In
                      </button>
                    )}
                  </div>

                  {mode === "signup" && (
                    <div className="ta-fine">
                      By Continuing You Agree to the <a href="/terms">Terms</a> and{" "}
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
