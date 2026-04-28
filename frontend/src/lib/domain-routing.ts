import { supabase } from "./supabase";

type DomainScopedUser = {
  role?: "ADMIN" | "USER" | "MANAGER" | "SUPERADMIN";
  canonicalDomain?: string | null;
  domainRoutingEnabled?: boolean;
};

type DomainAuthRelayPayload = {
  accessToken: string;
  refreshToken: string;
  issuedAt: number;
};

const DOMAIN_AUTH_RELAY_HASH_KEY = "__vl_auth_relay";
const DOMAIN_AUTH_RELAY_MAX_AGE_MS = 2 * 60 * 1000;

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

const isPrivateIpv4 = (host: string): boolean => {
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) return false;

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
};

const isLocalOrPrivateHost = (host: string): boolean => {
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  return isPrivateIpv4(host);
};

export const getCanonicalDomainRedirectUrl = (user: DomainScopedUser | null): string | null => {
  if (!user || user.domainRoutingEnabled === false) {
    return null;
  }

  const canonicalDomain = sanitizeDomain(user.canonicalDomain);
  if (!canonicalDomain) return null;

  const currentHost = sanitizeDomain(window.location.host);
  if (!currentHost) return null;
  if (isLocalOrPrivateHost(currentHost)) return null;
  if (currentHost === canonicalDomain) return null;

  return `${window.location.protocol}//${canonicalDomain}${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const encodeRelayPayload = (payload: DomainAuthRelayPayload): string =>
  btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const decodeRelayPayload = (raw: string): DomainAuthRelayPayload | null => {
  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(decoded) as Partial<DomainAuthRelayPayload>;

    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
};

const buildCleanUrlAfterRelay = (hashParams: URLSearchParams): string =>
  `${window.location.pathname}${window.location.search}${hashParams.toString() ? `#${hashParams.toString()}` : ""}`;

export const buildCanonicalDomainRelayUrl = async (
  user: DomainScopedUser | null,
): Promise<string | null> => {
  const redirectUrl = getCanonicalDomainRedirectUrl(user);
  if (!redirectUrl) return null;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.refresh_token) {
      return redirectUrl;
    }

    const payload: DomainAuthRelayPayload = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      issuedAt: Date.now(),
    };

    const url = new URL(redirectUrl);
    const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
    hashParams.set(DOMAIN_AUTH_RELAY_HASH_KEY, encodeRelayPayload(payload));
    url.hash = hashParams.toString();
    return url.toString();
  } catch {
    return redirectUrl;
  }
};

export const consumeDomainAuthRelay = async (): Promise<boolean> => {
  const rawHash = window.location.hash;
  if (!rawHash || !rawHash.startsWith("#")) return false;

  const hashParams = new URLSearchParams(rawHash.slice(1));
  const relayToken = hashParams.get(DOMAIN_AUTH_RELAY_HASH_KEY);
  if (!relayToken) return false;

  hashParams.delete(DOMAIN_AUTH_RELAY_HASH_KEY);
  const cleanUrl = buildCleanUrlAfterRelay(hashParams);
  const cleanupUrl = () => window.history.replaceState(null, "", cleanUrl);

  const payload = decodeRelayPayload(relayToken);
  if (!payload) {
    cleanupUrl();
    return false;
  }

  const ageMs = Date.now() - payload.issuedAt;
  if (ageMs < 0 || ageMs > DOMAIN_AUTH_RELAY_MAX_AGE_MS) {
    cleanupUrl();
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });

  cleanupUrl();
  return !error;
};
