/**
 * Anonymous visitors on drift.li's public endpoints: their IP (for rate limiting only) and a
 * small in-memory rate limiter (single box). No imports, so any route or service can use it.
 */

/** The visitor's IP: Cloudflare's / nginx's header first, then the first X-Forwarded-For hop, then the socket. */
export function visitorIp(req: { headers: { [name: string]: string | string[] | undefined }; ip?: string }) {
  const h = (name: string) => String(req.headers[name] || "").split(",")[0].trim();
  return h("cf-connecting-ip") || h("x-real-ip") || h("x-forwarded-for") || req.ip || "unknown";
}

/** allow(key) → false once `key` has used `max` calls in the last `windowMs`. */
export function rateLimiter(windowMs: number, max: number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    const ok = recent.length < max;
    if (ok) recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return ok;
  };
}
