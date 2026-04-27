type DomainScopedUser = {
  role?: "ADMIN" | "USER" | "MANAGER" | "SUPERADMIN";
  canonicalDomain?: string | null;
  domainRoutingEnabled?: boolean;
};

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
  if (!user || user.role === "SUPERADMIN" || user.domainRoutingEnabled === false) {
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
