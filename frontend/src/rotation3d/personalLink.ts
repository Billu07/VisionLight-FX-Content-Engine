import { apiEndpoints } from "../lib/api";

/**
 * Personal tour links (…?to={token}). The first page of the visit notes the token for
 * this browser tab (the open is counted once), then drops it from the address so a
 * re-shared URL doesn't carry someone else's link. The player tags that tour's drift
 * views with it, and enquiries send it along.
 */

const KEY = "drift_personal_link";
type Stored = { token: string; flowId: string };

const read = (): Stored | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return v && typeof v.token === "string" && typeof v.flowId === "string" ? (v as Stored) : null;
  } catch {
    return null;
  }
};

export function captureShareLink(): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const token = (url.searchParams.get("to") || "").trim().toLowerCase();
  if (!token) return;
  url.searchParams.delete("to");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  if (!/^[a-z0-9]{6,20}$/.test(token) || read()?.token === token) return;
  apiEndpoints
    .driftOpenShareLink(token)
    .then((r) => {
      if (!r.data?.ok || typeof r.data.flowId !== "string") return;
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ token, flowId: r.data.flowId }));
      } catch {
        /* storage blocked: the visit just isn't attributed */
      }
    })
    .catch(() => undefined);
}

/** The personal link this visit came through, for this tour (null otherwise). */
export function shareLinkFor(flowId?: string | null): string | null {
  const cur = read();
  return cur && flowId && cur.flowId === flowId ? cur.token : null;
}
