type DomainScopedUser = {
  role?: "ADMIN" | "USER" | "MANAGER" | "SUPERADMIN";
  canonicalDomain?: string | null;
  domainRoutingEnabled?: boolean;
};

const REDIRECT_MARKER_PARAM = "__drh";
const REDIRECT_BUDGET_KEY = "visionlight_domain_redirect_budget_v1";
const REDIRECT_BUDGET_WINDOW_MS = 60 * 1000;
const MAX_REDIRECT_HOPS = 3;

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

export const getCanonicalDomainRedirectUrl = (
  user: DomainScopedUser | null,
  options?: { suspendRedirect?: boolean },
): string | null => {
  if (!user || user.domainRoutingEnabled === false) {
    return null;
  }
  if (options?.suspendRedirect) return null;

  const canonicalDomain = sanitizeDomain(user.canonicalDomain);
  if (!canonicalDomain) return null;

  const currentHost = sanitizeDomain(window.location.host);
  if (!currentHost) return null;
  if (isLocalOrPrivateHost(currentHost)) return null;
  if (currentHost === canonicalDomain) {
    try {
      sessionStorage.removeItem(REDIRECT_BUDGET_KEY);
    } catch {
      // no-op
    }
    return null;
  }

  const nextUrl = new URL(window.location.href);
  const queryHopRaw = Number.parseInt(
    nextUrl.searchParams.get(REDIRECT_MARKER_PARAM) || "0",
    10,
  );
  const queryHop = Number.isFinite(queryHopRaw) ? Math.max(0, queryHopRaw) : 0;
  const now = Date.now();

  let sessionHop = 0;
  try {
    const raw = sessionStorage.getItem(REDIRECT_BUDGET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        from?: string;
        to?: string;
        ts?: number;
        hops?: number;
      };
      if (
        parsed?.from === currentHost &&
        parsed?.to === canonicalDomain &&
        typeof parsed.ts === "number" &&
        now - parsed.ts < REDIRECT_BUDGET_WINDOW_MS &&
        typeof parsed.hops === "number"
      ) {
        sessionHop = Math.max(0, Math.floor(parsed.hops));
      }
    }
  } catch {
    // no-op
  }

  const nextHop = Math.max(queryHop, sessionHop) + 1;
  if (nextHop > MAX_REDIRECT_HOPS) {
    return null;
  }

  nextUrl.hostname = canonicalDomain;
  nextUrl.searchParams.set(REDIRECT_MARKER_PARAM, String(nextHop));
  try {
    sessionStorage.setItem(
      REDIRECT_BUDGET_KEY,
      JSON.stringify({
        from: currentHost,
        to: canonicalDomain,
        hops: nextHop,
        ts: now,
      }),
    );
  } catch {
    // no-op
  }

  return nextUrl.toString();
};
