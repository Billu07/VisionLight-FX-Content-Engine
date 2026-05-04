import net from "node:net";
import { dbService as airtableService } from "../services/database";
import { encryptionUtils } from "../utils/encryption";

export const isOrganizationExpired = (org: any) =>
  org?.tenantPlan === "DEMO" &&
  org?.trialEndsAt &&
  new Date(org.trialEndsAt).getTime() <= Date.now();

export async function getTenantApiKeys(userId: string) {
  const user = await airtableService.findUserById(userId);
  if (!user) throw new Error("User not found");

  const org = user.organization;
  const isDefaultOrg = org?.isDefault;
  const noOrg = !org;

  const falKey = encryptionUtils.decrypt(org?.falApiKey);
  const kieKey = encryptionUtils.decrypt(org?.kieApiKey);
  const openAIKey = encryptionUtils.decrypt(org?.openaiApiKey);

  if (!isDefaultOrg && !noOrg) {
    if (org?.isActive === false || isOrganizationExpired(org)) {
      throw new Error(
        "Your organization is currently deactivated. Please contact your platform administrator.",
      );
    }
    if (!falKey) {
      throw new Error(
        "Your platform is not active. Please configure your Fal API key in the Admin Panel.",
      );
    }
  }

  return {
    falApiKey: falKey || (isDefaultOrg || noOrg ? process.env.FAL_KEY : undefined),
    kieApiKey:
      kieKey || (isDefaultOrg || noOrg ? process.env.KIE_AI_API_KEY : undefined),
    openaiApiKey:
      openAIKey || (isDefaultOrg || noOrg ? process.env.OPENAI_API_KEY : undefined),
  };
}

export async function getTenantSettings(_userId: string) {
  // Pricing is centrally controlled by SuperAdmin. Organization records still
  // store API keys and legacy values, but render deductions come from global settings.
  return await airtableService.getGlobalSettings();
}

const r2PublicHost = (() => {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
})();

export function normalizeHostname(hostname: string): string {
  return hostname.replace(/\.$/, "").toLowerCase();
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const ipType = net.isIP(host);
  if (ipType === 4) {
    const octets = host.split(".").map((n) => Number(n));
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;

    const [a, b] = octets;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
  }

  if (ipType === 6) {
    const lower = host.toLowerCase();
    if (
      lower === "::1" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd")
    ) {
      return true;
    }
  }

  return false;
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (isPrivateOrLocalHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isAllowedProxyImageUrl(rawUrl: string): boolean {
  if (!isSafeExternalUrl(rawUrl)) return false;
  const hostname = normalizeHostname(new URL(rawUrl).hostname);

  if (r2PublicHost && hostname === r2PublicHost) return true;
  if (hostname.endsWith(".r2.dev")) return true;
  if (hostname === "res.cloudinary.com") return true;

  return false;
}

export function normalizeAssetUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return rawUrl.trim();
  }
}
