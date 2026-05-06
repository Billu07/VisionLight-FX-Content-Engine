export type SiteBrand = "picdrift" | "visualfx" | "byok";

const VISUALFX_HOSTS = new Set(["visualfx.studio", "www.visualfx.studio"]);
const BYOK_HOSTS = new Set(["byok.link", "www.byok.link"]);

export const getSiteBrandFromHostname = (hostname: string): SiteBrand => {
  const normalized = hostname.trim().toLowerCase();
  if (BYOK_HOSTS.has(normalized)) return "byok";
  return VISUALFX_HOSTS.has(normalized) ? "visualfx" : "picdrift";
};

export const getSiteBrand = (): SiteBrand => {
  if (typeof window === "undefined") {
    return "picdrift";
  }

  return getSiteBrandFromHostname(window.location.hostname);
};
