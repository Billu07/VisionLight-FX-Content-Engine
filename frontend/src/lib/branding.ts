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
