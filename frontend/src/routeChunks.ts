/**
 * Route chunk loaders shared by App's lazy routes and idle preloads. A dynamic import
 * is fetched once — a preload now makes the later navigation instant.
 */
export const loadDriftPlayer = () => import("./rotation3d/Rotation3DPlayer");
export const loadTourPage = () => import("./tour/TourPage");
export const loadTourPathway = () => import("./tour/TourPathway");

/** Fetch a chunk when the browser is idle (skipped on data-saver connections). */
export function preloadWhenIdle(load: () => Promise<unknown>): void {
  if (typeof window === "undefined") return;
  const conn = (navigator as any).connection;
  if (conn?.saveData) return;
  const run = () => {
    load().catch(() => undefined);
  };
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (typeof ric === "function") ric(run, { timeout: 3000 });
  else window.setTimeout(run, 1500);
}
