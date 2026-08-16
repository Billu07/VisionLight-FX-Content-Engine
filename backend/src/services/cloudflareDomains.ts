import axios from "axios";

/**
 * Cloudflare for SaaS custom-hostname helper for drift custom domains. A brand
 * CNAMEs their domain (e.g. drift.brandsite.com) to our fallback origin; we
 * register it as a Cloudflare custom hostname so CF terminates SSL and proxies
 * to our origin. All calls are no-ops (throw ConfigError) unless the CF env is set.
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN   API token with #ssl_and_certificates:edit on the zone
 *   CLOUDFLARE_ZONE_ID     the drift.li zone id (the SaaS zone)
 *   DRIFT_DOMAIN_TARGET    CNAME target brands point at (default "link.drift.li")
 */

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const CF_ZONE = process.env.CLOUDFLARE_ZONE_ID || "";
export const DRIFT_DOMAIN_TARGET = process.env.DRIFT_DOMAIN_TARGET || "link.drift.li";

export const cloudflareConfigured = () => !!(CF_TOKEN && CF_ZONE);

const api = () =>
  axios.create({
    baseURL: `https://api.cloudflare.com/client/v4/zones/${CF_ZONE}`,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
    timeout: 20000,
  });

export class ConfigError extends Error {}

export type CustomHostnameResult = {
  cfHostnameId: string;
  status: string; // pending | active | ...
  sslStatus: string | null;
  verification: {
    target: string; // CNAME target the brand must set
    ownership?: { name: string; value: string } | null; // optional TXT ownership record
    sslRecords?: { name: string; value: string; type?: string }[]; // DCV records if any
  };
};

const shape = (h: any): CustomHostnameResult => ({
  cfHostnameId: h?.id,
  status: h?.status || "pending",
  sslStatus: h?.ssl?.status || null,
  verification: {
    target: DRIFT_DOMAIN_TARGET,
    ownership: h?.ownership_verification
      ? { name: h.ownership_verification.name, value: h.ownership_verification.value }
      : null,
    sslRecords: Array.isArray(h?.ssl?.validation_records)
      ? h.ssl.validation_records
          .filter((r: any) => r?.txt_name || r?.cname)
          .map((r: any) => ({ name: r.txt_name || r.cname, value: r.txt_value || r.cname_target, type: r.txt_name ? "TXT" : "CNAME" }))
      : [],
  },
});

export async function createCustomHostname(hostname: string): Promise<CustomHostnameResult> {
  if (!cloudflareConfigured()) throw new ConfigError("Cloudflare is not configured");
  const r = await api().post("/custom_hostnames", {
    hostname,
    ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
  });
  return shape(r.data?.result);
}

export async function getCustomHostname(id: string): Promise<CustomHostnameResult> {
  if (!cloudflareConfigured()) throw new ConfigError("Cloudflare is not configured");
  const r = await api().get(`/custom_hostnames/${id}`);
  return shape(r.data?.result);
}

export async function deleteCustomHostname(id: string): Promise<void> {
  if (!cloudflareConfigured()) throw new ConfigError("Cloudflare is not configured");
  await api().delete(`/custom_hostnames/${id}`);
}
