export type SiteBrand = "picdrift" | "visualfx";

const VISUALFX_HOSTS = new Set(["visualfx.studio", "www.visualfx.studio"]);

export const getSiteBrandFromHostname = (hostname: string): SiteBrand => {
  const normalized = hostname.trim().toLowerCase();
  return VISUALFX_HOSTS.has(normalized) ? "visualfx" : "picdrift";
};

export const getSiteBrand = (): SiteBrand => {
  if (typeof window === "undefined") {
    return "picdrift";
  }

  return getSiteBrandFromHostname(window.location.hostname);
};
