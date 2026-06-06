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
