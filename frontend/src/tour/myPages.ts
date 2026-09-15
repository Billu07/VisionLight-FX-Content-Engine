import { apiEndpoints } from "../lib/api";
import type { MyPage } from "./types";

/**
 * The tour pages this login can open (GET /api/drift/creator/pages), cached for the
 * session so the header's page switcher and the Dashboard share one request. Call
 * invalidateMyPages() after anything that adds or removes a page — a new client page, an
 * accepted invite, leaving a page, a role change, signing out.
 */

export const MY_PAGES_EVENT = "drift:my-pages";

let cached: Promise<MyPage[]> | null = null;

export function loadMyPages(force = false): Promise<MyPage[]> {
  if (!cached || force) {
    const request: Promise<MyPage[]> = apiEndpoints
      .driftCreatorPages()
      .then((r) => (Array.isArray(r.data?.pages) ? (r.data.pages as MyPage[]) : []))
      .catch((err) => {
        if (cached === request) cached = null;
        throw err;
      });
    cached = request;
  }
  return cached;
}

export function invalidateMyPages() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MY_PAGES_EVENT));
}
