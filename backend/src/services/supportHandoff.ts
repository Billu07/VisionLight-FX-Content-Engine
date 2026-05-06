import crypto from "node:crypto";

type HandoffPayload = {
  typ: "support_handoff";
  jti: string;
  iss: string;
  sub: string;
  aud: string;
  src?: string;
  iat: number;
  exp: number;
};

type SupportSessionPayload = {
  typ: "support_session";
  jti: string;
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
};

const HANDOFF_TTL_SECONDS = 60;
const SUPPORT_SESSION_TTL_SECONDS = 15 * 60;

const secret = (() => {
  const configured =
    process.env.SUPPORT_HANDOFF_SECRET ||
    process.env.TENANT_ENCRYPTION_KEY ||
    process.env.JWT_SECRET;
  if (!configured) {
    console.warn(
      "[Security] SUPPORT_HANDOFF_SECRET is not set. Using insecure fallback key. Configure SUPPORT_HANDOFF_SECRET.",
    );
    return "insecure-support-handoff-fallback-key";
  }
  return configured;
})();

const handoffStore = new Map<
  string,
  {
    issuerUserId: string;
    targetUserId: string;
    audienceDomain: string;
    expiresAt: number;
    consumedAt: number | null;
  }
>();

const normalizeHost = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const decodeBase64Url = (value: string) => {
  const restored = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = restored + "=".repeat((4 - (restored.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const sign = (payloadSegment: string) =>
  crypto
    .createHmac("sha256", secret)
    .update(payloadSegment)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const constantTimeEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const parseAndVerify = <T extends { typ: string }>(
  token: string,
  expectedType: T["typ"],
): T | null => {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadSegment, signature] = parts;
  const expectedSignature = sign(payloadSegment);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as T;
    if (payload.typ !== expectedType) return null;
    if (!Number.isFinite((payload as any).exp)) return null;
    if ((payload as any).exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

const issueToken = <T extends { typ: string }>(payload: T) => {
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(payloadSegment);
  return `${payloadSegment}.${signature}`;
};

const pruneExpired = () => {
  const now = Date.now();
  for (const [jti, item] of handoffStore.entries()) {
    const consumedTooOld = item.consumedAt !== null && now - item.consumedAt > 5 * 60 * 1000;
    if (item.expiresAt <= now || consumedTooOld) {
      handoffStore.delete(jti);
    }
  }
};

export const supportHandoffService = {
  issueHandoffToken(input: {
    issuerUserId: string;
    targetUserId: string;
    audienceDomain: string;
    sourceDomain?: string | null;
  }) {
    pruneExpired();
    const audienceDomain = normalizeHost(input.audienceDomain);
    if (!audienceDomain) {
      throw new Error("Invalid audience domain.");
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    const payload: HandoffPayload = {
      typ: "support_handoff",
      jti,
      iss: input.issuerUserId,
      sub: input.targetUserId,
      aud: audienceDomain,
      src: normalizeHost(input.sourceDomain || null) || undefined,
      iat: nowSeconds,
      exp: nowSeconds + HANDOFF_TTL_SECONDS,
    };

    handoffStore.set(jti, {
      issuerUserId: input.issuerUserId,
      targetUserId: input.targetUserId,
      audienceDomain,
      expiresAt: payload.exp * 1000,
      consumedAt: null,
    });

    return issueToken(payload);
  },

  consumeHandoffToken(token: string, incomingHost?: string | null) {
    pruneExpired();
    const payload = parseAndVerify<HandoffPayload>(token, "support_handoff");
    if (!payload) {
      throw new Error("Invalid or expired handoff token.");
    }

    const expectedHost = normalizeHost(payload.aud);
    const requestHost = normalizeHost(incomingHost || null);
    if (!expectedHost || !requestHost || expectedHost !== requestHost) {
      throw new Error("Handoff token audience mismatch.");
    }

    const record = handoffStore.get(payload.jti);
    if (!record) {
      throw new Error("Handoff token is not recognized.");
    }
    if (record.consumedAt !== null) {
      throw new Error("Handoff token has already been consumed.");
    }
    if (
      record.issuerUserId !== payload.iss ||
      record.targetUserId !== payload.sub ||
      record.audienceDomain !== expectedHost
    ) {
      throw new Error("Handoff token state mismatch.");
    }

    record.consumedAt = Date.now();
    handoffStore.set(payload.jti, record);

    return {
      issuerUserId: payload.iss,
      targetUserId: payload.sub,
      audienceDomain: expectedHost,
      sourceDomain: payload.src || null,
    };
  },

  issueSupportSessionToken(input: {
    issuerUserId: string;
    targetUserId: string;
    audienceDomain: string;
  }) {
    const audienceDomain = normalizeHost(input.audienceDomain);
    if (!audienceDomain) {
      throw new Error("Invalid support session audience.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: SupportSessionPayload = {
      typ: "support_session",
      jti: crypto.randomUUID(),
      iss: input.issuerUserId,
      sub: input.targetUserId,
      aud: audienceDomain,
      iat: nowSeconds,
      exp: nowSeconds + SUPPORT_SESSION_TTL_SECONDS,
    };

    return issueToken(payload);
  },

  parseSupportSessionToken(token: string, incomingHost?: string | null) {
    const payload = parseAndVerify<SupportSessionPayload>(token, "support_session");
    if (!payload) return null;
    const expectedHost = normalizeHost(payload.aud);
    const requestHost = normalizeHost(incomingHost || null);
    if (!expectedHost || !requestHost || expectedHost !== requestHost) {
      return null;
    }
    return payload;
  },
};

