export type SiteBrand = "picdrift" | "visualfx" | "byok";

const BYOK_HOSTS = new Set(["byok.link", "www.byok.link"]);

export const getSiteBrandFromHostname = (hostname: string): SiteBrand => {
  const normalized = hostname.trim().toLowerCase();
  if (BYOK_HOSTS.has(normalized)) return "byok";
  // Any VisualFX product domain (visualfx.app, visualfx.studio, www.* etc.)
  // brands as VisualFX; everything else defaults to PicDrift.
  if (normalized.includes("visualfx")) return "visualfx";
  return "picdrift";
};

export const getSiteBrand = (): SiteBrand => {
  if (typeof window === "undefined") {
    return "picdrift";
  }

  return getSiteBrandFromHostname(window.location.hostname);
};

// Rotation3D is a separate product surface (not a studio brand theme), so it is
// gated by host rather than folded into SiteBrand. When the app is served on one
// of these hosts, App renders the Rotation3D route tree instead of the studio SPA.
const ROTATION3D_HOSTS = new Set(["rotation3d.com", "www.rotation3d.com"]);

export const isRotation3dHost = (hostname: string): boolean =>
  ROTATION3D_HOSTS.has(hostname.trim().toLowerCase());

export const isRotation3dSite = (): boolean => {
  if (typeof window === "undefined") return false;
  return isRotation3dHost(window.location.hostname);
};

// Drift (drift.li) is the SAME spin-player surface as Rotation3D — same brands,
// products, admin and API — just a different skin plus a loop toggle. Rotation3D
// is one use case running on top of the generic Drift player. drift.li serves the
// identical route tree with Drift branding; nothing is duplicated on the backend.
const DRIFT_HOSTS = new Set(["drift.li", "www.drift.li"]);

export const isDriftHost = (hostname: string): boolean =>
  DRIFT_HOSTS.has(hostname.trim().toLowerCase());

export const isDriftSite = (): boolean => {
  if (typeof window === "undefined") return false;
  return isDriftHost(window.location.hostname);
};

export type PlayerBrand = "rotation3d" | "drift";

// Which spin-player surface (if any) the current host serves. Used to gate the
// shared player/showcase routes and to pick the skin.
export const getPlayerBrand = (): PlayerBrand | null => {
  if (typeof window === "undefined") return null;
  const h = window.location.hostname;
  if (isRotation3dHost(h)) return "rotation3d";
  if (isDriftHost(h)) return "drift";
  return null;
};

// True on rotation3d.com OR drift.li — the hosts that render the spin player.
export const isSpinPlayerSite = (): boolean => getPlayerBrand() !== null;

export type PlayerBranding = {
  name: string;
  url: string;
  /** default player accent colors when a tenant hasn't set their own */
  primary: string;
  secondary: string;
  /** Drift auto-plays a looping drift path; Rotation3D is drag-only by default */
  loopByDefault: boolean;
};

export const PLAYER_BRANDING: Record<PlayerBrand, PlayerBranding> = {
  rotation3d: {
    name: "Rotation3D",
    url: "https://rotation3d.com",
    primary: "#6366f1",
    secondary: "#8b5cf6",
    loopByDefault: false,
  },
  drift: {
    name: "Drift",
    url: "https://drift.li",
    primary: "#22d3ee",
    secondary: "#3b82f6",
    loopByDefault: true,
  },
};

// The active player skin for this host (defaults to Rotation3D off-domain).
export const getPlayerBranding = (): PlayerBranding =>
  PLAYER_BRANDING[getPlayerBrand() ?? "rotation3d"];
