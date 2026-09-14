import { lazy, type ComponentType } from "react";

const RELOAD_AT_KEY = "visionlight_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 30_000;

const session = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * React.lazy for route chunks. When a chunk can't be fetched — after a deploy the old
 * hashed files are gone, so a tab opened before it would crash on its next navigation —
 * reload once to pick up the new build. A cooldown stops a reload loop if a chunk is
 * genuinely unreachable; then the error reaches the ErrorBoundary as usual.
 */
export function lazyRoute<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      const store = session();
      const last = Number(store?.getItem(RELOAD_AT_KEY) || 0);
      if (store && Date.now() - last > RELOAD_COOLDOWN_MS) {
        try {
          store.setItem(RELOAD_AT_KEY, String(Date.now()));
        } catch {
          throw err;
        }
        window.location.reload();
        return new Promise<{ default: T }>(() => undefined);
      }
      throw err;
    }
  });
}
