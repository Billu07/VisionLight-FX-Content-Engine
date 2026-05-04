import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

export default function ResetPassword() {
  const navigate = useNavigate();
  const logout = useAuth((state) => state.logout);
  const [isChecking, setIsChecking] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const initializeRecoverySession = async () => {
      try {
        let {
          data: { session },
        } = await supabase.auth.getSession();

        const code = new URLSearchParams(window.location.search).get("code");
        if (!session && code) {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          session = data.session;
          window.history.replaceState(null, "", "/reset-password");
        }

        if (!mounted) return;
        setCanReset(!!session);
        setResetEmail(session?.user?.email || "");
        if (!session) {
          setError("This reset link is expired or invalid. Request a new reset link from the login page.");
        }
      } catch (err: any) {
        if (!mounted) return;
        setCanReset(false);
        setError(err?.message || "Unable to verify this password reset link.");
      } finally {
        if (mounted) setIsChecking(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setCanReset(true);
        setResetEmail(session.user?.email || "");
        setError("");
        setIsChecking(false);
      }
    });

    void initializeRecoverySession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPassword = newPassword.trim();

    if (trimmedPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (trimmedPassword !== confirmPassword.trim()) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });
      if (updateError) throw updateError;
      await logout();
      setIsComplete(true);
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4 text-gray-100">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gray-900 p-8 shadow-2xl">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative">
          <h1 className="mb-2 text-2xl font-bold text-white">Reset Password</h1>
          <p className="mb-6 text-sm leading-relaxed text-gray-400">
            Set a new password for your account. This password applies to every
            studio connected to your email.
          </p>

          {isChecking ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
              <LoadingSpinner size="sm" variant="neon" />
              Verifying reset link...
            </div>
          ) : isComplete ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                Your password has been updated. Please log in with your new password.
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    resetEmail
                      ? `/?login_email=${encodeURIComponent(resetEmail)}`
                      : "/",
                  )
                }
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-bold text-white transition-all hover:from-cyan-600 hover:to-blue-600"
              >
                Back to Login
              </button>
            </div>
          ) : canReset ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-purple-200">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-white/10 bg-gray-800/50 p-3 text-white outline-none transition-all focus:ring-2 focus:ring-cyan-400/50"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-purple-200">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-white/10 bg-gray-800/50 p-3 text-white outline-none transition-all focus:ring-2 focus:ring-cyan-400/50"
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-bold text-white transition-all hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50"
              >
                {isSaving ? <LoadingSpinner size="sm" variant="light" /> : null}
                Update Password
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-gray-200 transition-colors hover:bg-white/5"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
