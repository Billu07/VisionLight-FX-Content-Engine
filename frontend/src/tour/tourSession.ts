import { apiEndpoints, setActiveProfile, setAuthToken } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

/**
 * Creator-suite session helpers (drift.li/tour): where to send someone after
 * they authenticate, and the provisioning handshake that turns a signed-in
 * Supabase identity into a creator profile the app can use.
 */

const NEXT_KEY = "drift_creator_next";
export const CREATOR_HOME = "/tour";
export const CREATOR_START = "/tour/start";
export const CREATOR_DEMO = "/tour/demo";

// Only same-site paths — never an absolute URL — may be used as a post-auth target.
export const isSafeNext = (p: unknown): p is string =>
  typeof p === "string" && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(p) && !p.startsWith("//");

/** Remember where to go after an auth round-trip (OAuth / email confirmation). */
export function rememberNext(next?: string | null) {
  try {
    if (isSafeNext(next)) localStorage.setItem(NEXT_KEY, next);
    else localStorage.removeItem(NEXT_KEY);
  } catch {
    /* storage unavailable — the fallback route still works */
  }
}

export function takeNext(fallback: string = CREATOR_HOME): string {
  try {
    const v = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return isSafeNext(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Resolve the post-auth target from the current URL (?next= / ?intent=demo). */
export function nextFromLocation(search: string): string {
  const q = new URLSearchParams(search);
  const next = q.get("next");
  if (isSafeNext(next)) return next;
  if (q.get("intent") === "demo") return CREATOR_DEMO;
  return CREATOR_HOME;
}

/**
 * Make sure the signed-in identity has a creator profile, activate it (the same
 * email may also own a studio/brand workspace) and refresh the auth store.
 */
export async function ensureCreatorProfile(name?: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You're not signed in yet.");
  setAuthToken(session.access_token);
  const r = await apiEndpoints.driftCreatorSignup(name);
  const profileId = r.data?.profileId as string | undefined;
  if (profileId) setActiveProfile(profileId, r.data?.name || undefined);
  await useAuth.getState().checkAuth();
}

/** Start Google sign-in; the browser leaves for Google and returns to /auth/callback. */
export async function signInWithGoogle(next?: string): Promise<void> {
  rememberNext(next);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

/** Friendly message for auth/API errors. */
export const errorMessage = (e: any, fallback = "Something went wrong. Please try again.") =>
  e?.response?.data?.error || e?.message || fallback;
