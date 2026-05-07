import express, { Request, Response } from "express";
import crypto from "node:crypto";
import {
  authenticateToken,
  AuthenticatedRequest,
  requireSuperAdmin,
} from "../middleware/auth";
import { byokService } from "../services/byok";
import { prisma } from "../services/database";
import {
  BYOK_PACKAGE_ORDER,
  BYOK_PACKAGE_CONFIG,
  ByokPackageCode,
} from "../config/byok";

const router = express.Router();

const BYOK_WEBHOOK_SECRET = process.env.BYOK_WIX_WEBHOOK_SECRET || "";
const BYOK_WEBHOOK_ALLOW_QUERY_SECRET =
  (process.env.BYOK_WIX_ALLOW_QUERY_SECRET ?? "true").toLowerCase() !== "false";
const BYOK_WEBHOOK_ALLOW_BODY_SECRET =
  (process.env.BYOK_WIX_ALLOW_BODY_SECRET ?? "true").toLowerCase() !== "false";
const BYOK_WIX_SIGNATURE_SECRET = process.env.BYOK_WIX_SIGNATURE_SECRET || "";
const BYOK_WIX_REQUIRE_SIGNATURE =
  (process.env.BYOK_WIX_REQUIRE_SIGNATURE ?? "false").toLowerCase() === "true";
const BYOK_WIX_SIGNATURE_MAX_AGE_SECONDS = Math.max(
  30,
  Number.parseInt(process.env.BYOK_WIX_SIGNATURE_MAX_AGE_SECONDS || "300", 10) ||
    300,
);
const BYOK_WIX_SIGNATURE_MAX_FUTURE_SKEW_SECONDS = Math.max(
  0,
  Number.parseInt(
    process.env.BYOK_WIX_SIGNATURE_MAX_FUTURE_SKEW_SECONDS || "90",
    10,
  ) || 90,
);
const BYOK_WEBHOOK_RATE_LIMIT_WINDOW_MS = Math.max(
  1000,
  Number.parseInt(process.env.BYOK_WEBHOOK_RATE_LIMIT_WINDOW_MS || "60000", 10) || 60000,
);
const BYOK_WEBHOOK_RATE_LIMIT_MAX = Math.max(
  1,
  Number.parseInt(process.env.BYOK_WEBHOOK_RATE_LIMIT_MAX || "90", 10) || 90,
);
const BYOK_STALE_PENDING_MINUTES = Math.max(
  5,
  Number.parseInt(process.env.BYOK_STALE_PENDING_MINUTES || "15", 10) || 15,
);

const WEBHOOK_PROVIDER_WIX = "WIX";
const WEBHOOK_PROVIDER_CHECKOUT = "WIX_CHECKOUT_SESSION";

const BYOK_CHECKOUT_URLS: Record<ByokPackageCode, string> = {
  BYOK_TRIAL: "",
  PD_APP:
    process.env.BYOK_WIX_CHECKOUT_URL_PD_APP ||
    "https://www.picdrift.com/pricing-plans/checkout-1?planId=df674622-e11f-4e88-8564-4bb12365d5e5&checkoutFlowId=0ca462cc-de89-4e2c-b02e-bb83d3c7ee98",
  VFX_APP:
    process.env.BYOK_WIX_CHECKOUT_URL_VFX_APP ||
    "https://www.picdrift.com/pricing-plans/checkout-1?planId=8351c366-2837-44cd-8522-65ec3fecb56d&checkoutFlowId=05b75b73-c0ed-4ae2-ab13-130ab4628ca6",
  PD_STUDIO:
    process.env.BYOK_WIX_CHECKOUT_URL_PD_STUDIO ||
    "https://www.picdrift.com/pricing-plans/checkout-1?planId=dc751744-5641-4086-a510-7d203e187a79&checkoutFlowId=b5b1614d-e4d5-4352-804a-19d57d5225d0",
  VFX_STUDIO:
    process.env.BYOK_WIX_CHECKOUT_URL_VFX_STUDIO ||
    "https://www.picdrift.com/pricing-plans/checkout-1?planId=a97eb2df-59b6-4500-ba93-618171001d4b&checkoutFlowId=e90e22a5-29ed-4093-b268-7838c0fca777",
  VFX_STUDIO_AGENCY:
    process.env.BYOK_WIX_CHECKOUT_URL_VFX_STUDIO_AGENCY ||
    "https://www.picdrift.com/pricing-plans/checkout-1?planId=4785cf91-670a-416f-8bb1-637b926bf2a0&checkoutFlowId=893f469b-9e21-4baa-bb7b-3217b96aa285",
};

type ActivationStatus = "PENDING" | "PROCESSED" | "ERROR";
const CHECKOUT_INTENT_MATCH_WINDOW_MINUTES = Math.max(
  5,
  Number.parseInt(process.env.BYOK_CHECKOUT_INTENT_MATCH_WINDOW_MINUTES || "90", 10) ||
    90,
);
const webhookRateWindow = new Map<
  string,
  {
    windowStart: number;
    count: number;
  }
>();

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol
    .split("/")[0]
    ?.replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return host || null;
};

const resolveIncomingHost = (req: Request): string | null => {
  const forwarded = req.headers["x-forwarded-host"];
  const forwardedHost = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = forwardedHost || req.headers.host || "";
  const firstHost = candidate.toString().split(",")[0];
  return sanitizeDomain(firstHost);
};

const resolveClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
};

const isWebhookRateLimited = (ip: string) => {
  const now = Date.now();
  const current = webhookRateWindow.get(ip);
  if (!current || now - current.windowStart >= BYOK_WEBHOOK_RATE_LIMIT_WINDOW_MS) {
    webhookRateWindow.set(ip, {
      windowStart: now,
      count: 1,
    });
    return false;
  }
  current.count += 1;
  webhookRateWindow.set(ip, current);
  if (current.count > BYOK_WEBHOOK_RATE_LIMIT_MAX) {
    return true;
  }
  return false;
};

const sendError = (
  res: Response,
  status: number,
  error: string,
  code: string,
  details?: Record<string, unknown>,
) => res.status(status).json({ error, code, ...(details ? { details } : {}) });

const getRequestProtocol = (req: Request) => {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  if (typeof rawProto === "string" && rawProto.trim()) {
    const proto = rawProto.split(",")[0]?.trim().toLowerCase();
    if (proto === "http" || proto === "https") return proto;
  }
  return req.protocol === "https" ? "https" : "http";
};

const parseWebhookPayload = (body: unknown) => {
  if (!body) return null;
  if (typeof body === "object") return body as Record<string, unknown>;
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const jwtParts = trimmed.split(".");
      if (jwtParts.length === 3) {
        try {
          return JSON.parse(Buffer.from(jwtParts[1], "base64url").toString("utf8"));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

const resolvePackageCodeFromPayload = (payload: any): ByokPackageCode | null => {
  const values = [
    payload?.packageCode,
    payload?.package_code,
    payload?.planCode,
    payload?.plan_code,
    payload?.plan?.code,
    payload?.metadata?.packageCode,
    payload?.metadata?.package_code,
    payload?.lineItem?.name,
    payload?.lineItems?.[0]?.name,
    payload?.lineItems?.[0]?.productName,
    payload?.lineItems?.[0]?.catalogReference?.name,
  ]
    .filter((v) => typeof v === "string")
    .map((v: string) => v.trim().toUpperCase());

  const aliasMap: Record<string, ByokPackageCode> = {
    PICDRIFT_APP: "PD_APP",
    PD_APP: "PD_APP",
    VISUALFX_APP: "VFX_APP",
    VFX_APP: "VFX_APP",
    PICDRIFT_STUDIO: "PD_STUDIO",
    PD_STUDIO: "PD_STUDIO",
    VISUALFX_STUDIO: "VFX_STUDIO",
    VFX_STUDIO: "VFX_STUDIO",
    VISUALFX_STUDIO_AGENCY: "VFX_STUDIO_AGENCY",
    VFX_STUDIO_AGENCY: "VFX_STUDIO_AGENCY",
  };

  for (const raw of values) {
    const normalized = raw.replace(/[^\w]+/g, "_");
    if (aliasMap[normalized]) {
      return aliasMap[normalized];
    }
  }

  return null;
};

const resolveCustomerEmail = (payload: any): string | null => {
  const candidates = [
    payload?.customerEmail,
    payload?.customer_email,
    payload?.buyerEmail,
    payload?.buyer?.email,
    payload?.contact?.email,
    payload?.billingInfo?.email,
    payload?.order?.buyerInfo?.email,
  ].filter((v) => typeof v === "string");

  const email = candidates[0]?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
};

const resolveEventKey = (payload: any): string => {
  const raw =
    payload?.eventId ||
    payload?.event_id ||
    payload?.id ||
    payload?.orderId ||
    payload?.order_id ||
    crypto.randomUUID();
  return String(raw);
};

const resolveCheckoutSessionIdFromPayload = (
  req: Request,
  payload: any,
): string | null => {
  const candidates = [
    payload?.checkoutSessionId,
    payload?.checkout_session_id,
    payload?.sessionId,
    payload?.session_id,
    payload?.metadata?.checkoutSessionId,
    payload?.metadata?.checkout_session_id,
    payload?.customData?.checkoutSessionId,
    payload?.customData?.checkout_session_id,
    payload?.customFields?.checkoutSessionId,
    payload?.customFields?.checkout_session_id,
    payload?.order?.metadata?.checkoutSessionId,
    payload?.order?.metadata?.checkout_session_id,
    typeof req.query.checkoutSessionId === "string" ? req.query.checkoutSessionId : "",
    typeof req.query.checkout_session_id === "string"
      ? req.query.checkout_session_id
      : "",
  ]
    .filter((value) => typeof value === "string")
    .map((value: string) => value.trim())
    .filter(Boolean);

  const raw = candidates[0] || "";
  if (!raw) return null;
  return raw.slice(0, 128);
};

const secureEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const SIGNATURE_FIELD_KEYS = new Set([
  "secret",
  "webhooksecret",
  "webhook_secret",
  "byokwebhooksecret",
  "byok_webhook_secret",
  "signature",
  "webhooksignature",
  "webhook_signature",
  "byoksignature",
  "byok_signature",
  "timestamp",
  "ts",
  "sentat",
]);

const normalizeObjectForSignature = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeObjectForSignature(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    if (SIGNATURE_FIELD_KEYS.has(key.toLowerCase())) continue;
    const next = normalizeObjectForSignature(value[key]);
    if (next !== undefined) {
      normalized[key] = next;
    }
  }
  return normalized;
};

const parseTimestampMs = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    if (trimmed.length <= 10) return Math.floor(num * 1000);
    return Math.floor(num);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
};

const parseCompositeSignature = (raw: string) => {
  const parts = raw.split(",").map((p) => p.trim());
  let timestamp = "";
  let signature = "";
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    if (key === "t" || key === "timestamp" || key === "ts") {
      timestamp = value;
    } else if (key === "v1" || key === "sig" || key === "signature") {
      signature = value;
    }
  }
  return {
    timestamp,
    signature,
  };
};

const normalizeProvidedSignature = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("sha256=")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
};

const resolveWebhookSignatureParts = (req: Request, payload: any) => {
  const headerSignatureRaw =
    ((req.headers["x-byok-signature"] as string) ||
      (req.headers["x-webhook-signature"] as string) ||
      (req.headers["x-wix-signature"] as string) ||
      "")
      .trim();
  const parsedComposite = parseCompositeSignature(headerSignatureRaw);
  const signature =
    normalizeProvidedSignature(parsedComposite.signature) ||
    normalizeProvidedSignature(headerSignatureRaw) ||
    normalizeProvidedSignature(
      typeof req.query.signature === "string" ? req.query.signature : "",
    ) ||
    normalizeProvidedSignature(typeof req.query.sig === "string" ? req.query.sig : "") ||
    normalizeProvidedSignature(
      typeof payload?.signature === "string" ? payload.signature : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.webhookSignature === "string" ? payload.webhookSignature : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.webhook_signature === "string"
        ? payload.webhook_signature
        : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.byokSignature === "string" ? payload.byokSignature : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.byok_signature === "string" ? payload.byok_signature : "",
    );

  const timestampRaw =
    parsedComposite.timestamp ||
    (typeof req.headers["x-byok-timestamp"] === "string"
      ? req.headers["x-byok-timestamp"]
      : "") ||
    (typeof req.headers["x-webhook-timestamp"] === "string"
      ? req.headers["x-webhook-timestamp"]
      : "") ||
    (typeof req.headers["x-wix-timestamp"] === "string"
      ? req.headers["x-wix-timestamp"]
      : "") ||
    (typeof req.query.timestamp === "string" ? req.query.timestamp : "") ||
    (typeof req.query.ts === "string" ? req.query.ts : "") ||
    (typeof req.query.t === "string" ? req.query.t : "") ||
    (typeof payload?.timestamp === "string" ? payload.timestamp : "") ||
    (typeof payload?.ts === "string" ? payload.ts : "") ||
    (typeof payload?.sentAt === "string" ? payload.sentAt : "");

  return {
    signature,
    timestampRaw: timestampRaw.trim(),
  };
};

const evaluateWebhookSignature = (req: Request, payload: any) => {
  if (!BYOK_WIX_SIGNATURE_SECRET) {
    return {
      configured: false,
      present: false,
      valid: false,
      reason: "SIGNATURE_NOT_CONFIGURED",
    } as const;
  }

  const { signature, timestampRaw } = resolveWebhookSignatureParts(req, payload);
  const present = !!signature || !!timestampRaw;
  if (!signature || !timestampRaw) {
    return {
      configured: true,
      present,
      valid: false,
      reason: "SIGNATURE_OR_TIMESTAMP_MISSING",
    } as const;
  }

  const timestampMs = parseTimestampMs(timestampRaw);
  if (!timestampMs) {
    return {
      configured: true,
      present: true,
      valid: false,
      reason: "INVALID_SIGNATURE_TIMESTAMP",
    } as const;
  }

  const now = Date.now();
  if (timestampMs > now + BYOK_WIX_SIGNATURE_MAX_FUTURE_SKEW_SECONDS * 1000) {
    return {
      configured: true,
      present: true,
      valid: false,
      reason: "SIGNATURE_TIMESTAMP_IN_FUTURE",
    } as const;
  }
  if (now - timestampMs > BYOK_WIX_SIGNATURE_MAX_AGE_SECONDS * 1000) {
    return {
      configured: true,
      present: true,
      valid: false,
      reason: "SIGNATURE_TIMESTAMP_EXPIRED",
    } as const;
  }

  const stablePayload = JSON.stringify(normalizeObjectForSignature(payload ?? {}));
  const signedInput = `${timestampRaw}.${stablePayload}`;
  const expectedHex = crypto
    .createHmac("sha256", BYOK_WIX_SIGNATURE_SECRET)
    .update(signedInput, "utf8")
    .digest("hex");
  const expectedBase64 = Buffer.from(expectedHex, "hex").toString("base64");
  const expectedBase64Url = Buffer.from(expectedHex, "hex").toString("base64url");
  const valid =
    secureEqual(signature, expectedHex) ||
    secureEqual(signature, expectedBase64) ||
    secureEqual(signature, expectedBase64Url);

  return {
    configured: true,
    present: true,
    valid,
    reason: valid ? null : "INVALID_SIGNATURE",
    timestampMs,
  } as const;
};

const resolveWebhookSecretFromPayload = (payload: any) => {
  const candidate = [
    payload?.secret,
    payload?.webhookSecret,
    payload?.webhook_secret,
    payload?.byokWebhookSecret,
    payload?.byok_webhook_secret,
  ].find((v) => typeof v === "string");
  return typeof candidate === "string" ? candidate.trim() : "";
};

const isWebhookAuthorized = (req: Request, payload: any) => {
  if (!BYOK_WEBHOOK_SECRET) {
    return false;
  }
  const headerSecret =
    (req.headers["x-byok-webhook-secret"] as string) ||
    (req.headers["x-webhook-secret"] as string) ||
    "";
  if (headerSecret && secureEqual(headerSecret, BYOK_WEBHOOK_SECRET)) {
    return true;
  }
  const authHeader = (req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && secureEqual(token, BYOK_WEBHOOK_SECRET)) {
      return true;
    }
  }

  if (BYOK_WEBHOOK_ALLOW_BODY_SECRET) {
    const bodySecret = resolveWebhookSecretFromPayload(payload);
    if (bodySecret && secureEqual(bodySecret, BYOK_WEBHOOK_SECRET)) {
      return true;
    }
  }

  if (BYOK_WEBHOOK_ALLOW_QUERY_SECRET) {
    const querySecret =
      typeof req.query.secret === "string" ? req.query.secret.trim() : "";
    if (querySecret && secureEqual(querySecret, BYOK_WEBHOOK_SECRET)) {
      return true;
    }
  }
  return false;
};

const toByokPlanCode = (raw: unknown): ByokPackageCode | null => {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "BYOK_TRIAL") return "BYOK_TRIAL";
  return BYOK_PACKAGE_ORDER.includes(normalized as ByokPackageCode)
    ? (normalized as ByokPackageCode)
    : null;
};

const buildCheckoutUrl = (
  baseCheckoutUrl: string,
  params: Record<string, string>,
) => {
  const url = new URL(baseCheckoutUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

const buildReturnUrlForDomain = (
  req: Request,
  targetDomain: string,
  checkoutSessionId: string,
  packageCode: ByokPackageCode,
) => {
  const protocol = getRequestProtocol(req);
  const url = new URL(`${protocol}://${targetDomain}/billing/return`);
  url.searchParams.set("checkoutSessionId", checkoutSessionId);
  url.searchParams.set("plan", packageCode);
  return url.toString();
};

const mapEventStatusToActivation = (status?: string | null): ActivationStatus => {
  const normalized = (status || "").trim().toUpperCase();
  if (normalized === "PROCESSED") return "PROCESSED";
  if (normalized === "ERROR") return "ERROR";
  return "PENDING";
};

const upsertCheckoutSessionEvent = async (
  checkoutSessionId: string,
  fields: {
    status: string;
    eventType?: string | null;
    organizationId?: string | null;
    error?: string | null;
    payload?: any;
  },
) => {
  await prisma.webhookEvent.upsert({
    where: {
      provider_eventKey: {
        provider: WEBHOOK_PROVIDER_CHECKOUT,
        eventKey: checkoutSessionId,
      },
    },
    update: {
      status: fields.status,
      eventType: fields.eventType || undefined,
      organizationId: fields.organizationId || undefined,
      error: fields.error ?? null,
      payload: fields.payload,
    },
    create: {
      provider: WEBHOOK_PROVIDER_CHECKOUT,
      eventKey: checkoutSessionId,
      status: fields.status,
      eventType: fields.eventType || undefined,
      organizationId: fields.organizationId || undefined,
      error: fields.error ?? null,
      payload: fields.payload,
    },
  });
};

const resolveFallbackCheckoutSessionId = async (params: {
  customerEmail: string;
  packageCode: ByokPackageCode;
  orderId?: string | null;
}) => {
  const customerEmail = params.customerEmail.trim().toLowerCase();
  if (!customerEmail) return null;

  const profile = await prisma.user.findFirst({
    where: {
      email: { equals: customerEmail, mode: "insensitive" },
      organization: { provisioningSource: "BYOK" },
    },
    select: { organizationId: true },
    orderBy: [{ createdAt: "asc" }],
  });
  if (!profile?.organizationId) return null;

  const cutoff = new Date(
    Date.now() - CHECKOUT_INTENT_MATCH_WINDOW_MINUTES * 60 * 1000,
  );
  const candidates = await prisma.webhookEvent.findMany({
    where: {
      provider: WEBHOOK_PROVIDER_CHECKOUT,
      status: { in: ["PENDING", "RECEIVED", "VERIFIED"] },
      createdAt: { gte: cutoff },
      OR: [
        { organizationId: profile.organizationId },
        { organizationId: null },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
    select: {
      eventKey: true,
      organizationId: true,
      payload: true,
    },
  });

  const normalizedOrderId = params.orderId ? String(params.orderId).trim() : "";
  for (const candidate of candidates) {
    const payload = (candidate.payload || {}) as any;
    const candidatePackage =
      toByokPlanCode(payload.packageCode || payload.requestedPackageCode || payload.plan) ||
      null;
    if (candidatePackage !== params.packageCode) continue;

    const payloadEmail = String(payload.customerEmail || "").trim().toLowerCase();
    if (!payloadEmail || payloadEmail !== customerEmail) continue;

    const candidateOrderId = String(payload.orderId || "").trim();
    if (normalizedOrderId && candidateOrderId && normalizedOrderId !== candidateOrderId) {
      continue;
    }

    const orgMatches =
      candidate.organizationId === profile.organizationId ||
      payload.organizationId === profile.organizationId;
    if (!orgMatches) continue;

    return candidate.eventKey;
  }

  return null;
};

const getCheckoutSessionSnapshot = async (checkoutSessionId: string) => {
  const sessionEvent = await prisma.webhookEvent.findUnique({
    where: {
      provider_eventKey: {
        provider: WEBHOOK_PROVIDER_CHECKOUT,
        eventKey: checkoutSessionId,
      },
    },
  });
  if (!sessionEvent) return null;

  const sessionPayload = (sessionEvent.payload || {}) as any;
  const eventOrgId =
    sessionEvent.organizationId ||
    (typeof sessionPayload.organizationId === "string"
      ? sessionPayload.organizationId
      : null);
  const requestedPackage = toByokPlanCode(sessionPayload.packageCode) || null;

  let org: {
    id: string;
    routingDomain: string | null;
    entitlementCode: string | null;
    entitlement: { packageCode: string } | null;
  } | null = null;
  if (eventOrgId) {
    org = await prisma.organization.findUnique({
      where: { id: eventOrgId },
      select: {
        id: true,
        routingDomain: true,
        entitlementCode: true,
        entitlement: {
          select: {
            packageCode: true,
          },
        },
      },
    });
  }

  const resolvedPackage =
    toByokPlanCode(org?.entitlement?.packageCode || org?.entitlementCode || null) ||
    requestedPackage;
  const activation = mapEventStatusToActivation(sessionEvent.status);
  const activationConfirmed =
    activation === "PROCESSED" &&
    !!resolvedPackage &&
    resolvedPackage !== "BYOK_TRIAL" &&
    (!requestedPackage || requestedPackage === resolvedPackage);
  const status: ActivationStatus = activationConfirmed
    ? "PROCESSED"
    : activation === "ERROR"
      ? "ERROR"
      : "PENDING";

  return {
    statusCode: 200,
    eventOrgId,
    payload: {
      success: true,
      status,
      checkoutSessionId,
      packageCode: resolvedPackage,
      requestedPackageCode: requestedPackage,
      routingDomain:
        org?.routingDomain ||
        (resolvedPackage ? BYOK_PACKAGE_CONFIG[resolvedPackage].routingDomain : null),
      entitlementCode: org?.entitlementCode || null,
      lifecycle: sessionEvent.status,
      webhookEventId: sessionPayload.eventKey || null,
      orderId: sessionPayload.orderId || null,
      updatedAt: sessionEvent.updatedAt,
      activationConfirmed,
      message:
        status === "PROCESSED"
          ? "Activation complete."
          : status === "ERROR"
            ? sessionEvent.error || "Activation failed."
            : "Waiting for payment confirmation.",
    },
  } as const;
};

router.get("/api/byok/packages", async (_req, res) => {
  const packages = await byokService.getPackageCatalog();
  res.json({
    success: true,
    packages: packages.filter((pkg) => pkg.code !== "BYOK_TRIAL"),
    trial: BYOK_PACKAGE_CONFIG.BYOK_TRIAL,
  });
});

router.post(
  "/api/byok/checkout-intent",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const packageCode = toByokPlanCode(req.body?.packageCode);
      if (!packageCode || packageCode === "BYOK_TRIAL") {
        return res.status(400).json({ error: "Invalid package code." });
      }

      const status = await byokService.getStatusForSessionUser(req.user!.id);
      if (!status?.isByok || !status.organizationId) {
        return res.status(403).json({ error: "BYOK workspace required." });
      }

      const packageConfig = BYOK_PACKAGE_CONFIG[packageCode];
      const baseCheckoutUrl = BYOK_CHECKOUT_URLS[packageCode];
      if (!baseCheckoutUrl) {
        return res
          .status(503)
          .json({ error: "Checkout URL is not configured for this package." });
      }

      const checkoutSessionId = crypto.randomUUID();
      const returnUrl = buildReturnUrlForDomain(
        req,
        packageConfig.routingDomain,
        checkoutSessionId,
        packageCode,
      );
      const checkoutUrl = buildCheckoutUrl(baseCheckoutUrl, {
        checkoutSessionId,
        package: packageCode,
        plan: packageCode,
        returnUrl,
        callbackUrl: returnUrl,
      });

      await upsertCheckoutSessionEvent(checkoutSessionId, {
        status: "PENDING",
        eventType: "checkout_intent",
        organizationId: status.organizationId,
        payload: {
          checkoutSessionId,
          packageCode,
          organizationId: status.organizationId,
          customerEmail: status.email || null,
          returnUrl,
          checkoutUrl,
          sourceDomain: resolveIncomingHost(req),
          createdByUserId: req.user!.id,
          createdAt: new Date().toISOString(),
        },
      });

      return res.json({
        success: true,
        checkoutSessionId,
        packageCode,
        returnUrl,
        checkoutUrl,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: error?.message || "Failed to create checkout intent." });
    }
  },
);

router.get(
  "/api/byok/activation-status",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const checkoutSessionId =
        typeof req.query.checkoutSessionId === "string"
          ? req.query.checkoutSessionId.trim()
          : "";
      if (!checkoutSessionId) {
        return res.status(400).json({ error: "checkoutSessionId is required." });
      }

      const status = await byokService.getStatusForSessionUser(req.user!.id);
      if (!status?.isByok || !status.organizationId) {
        return res.status(403).json({ error: "BYOK workspace required." });
      }

      const snapshot = await getCheckoutSessionSnapshot(checkoutSessionId);
      if (!snapshot) {
        return res.status(404).json({ error: "Checkout session not found." });
      }
      if (!snapshot.eventOrgId) {
        return res.status(409).json({
          error:
            "Checkout session is missing organization binding. Start checkout again.",
        });
      }
      if (snapshot.eventOrgId !== status.organizationId) {
        return res.status(403).json({
          error: "Checkout session does not belong to current workspace.",
        });
      }
      return res.json(snapshot.payload);
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: error?.message || "Failed to fetch activation status." });
    }
  },
);

router.get("/api/byok/activation-status-public", async (req, res) => {
  try {
    const checkoutSessionId =
      typeof req.query.checkoutSessionId === "string"
        ? req.query.checkoutSessionId.trim()
        : "";
    if (!checkoutSessionId) {
      return res.status(400).json({ error: "checkoutSessionId is required." });
    }
    const snapshot = await getCheckoutSessionSnapshot(checkoutSessionId);
    if (!snapshot) {
      return res.status(404).json({ error: "Checkout session not found." });
    }
    return res.json(snapshot.payload);
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to fetch activation status." });
  }
});

const handleWixWebhook = async (req: Request, res: Response) => {
  const clientIp = resolveClientIp(req);
  if (isWebhookRateLimited(clientIp)) {
    return sendError(res, 429, "Webhook rate limit exceeded.", "WEBHOOK_RATE_LIMITED", {
      ip: clientIp,
      windowMs: BYOK_WEBHOOK_RATE_LIMIT_WINDOW_MS,
      max: BYOK_WEBHOOK_RATE_LIMIT_MAX,
    });
  }

  const payload = parseWebhookPayload(req.body);
  if (!isWebhookAuthorized(req, payload)) {
    return sendError(res, 401, "Unauthorized webhook.", "UNAUTHORIZED_WEBHOOK");
  }

  if (!payload || typeof payload !== "object") {
    return sendError(res, 400, "Invalid webhook payload.", "INVALID_WEBHOOK_PAYLOAD");
  }

  const signatureCheck = evaluateWebhookSignature(req, payload);
  if (BYOK_WIX_REQUIRE_SIGNATURE) {
    if (!signatureCheck.configured) {
      return sendError(
        res,
        503,
        "Webhook signature validation misconfigured.",
        "WEBHOOK_SIGNATURE_MISCONFIGURED",
      );
    }
    if (!signatureCheck.valid) {
      return sendError(res, 401, "Invalid webhook signature.", "INVALID_WEBHOOK_SIGNATURE", {
        reason: signatureCheck.reason,
      });
    }
  } else if (
    signatureCheck.configured &&
    signatureCheck.present &&
    !signatureCheck.valid
  ) {
    return sendError(res, 401, "Invalid webhook signature.", "INVALID_WEBHOOK_SIGNATURE", {
      reason: signatureCheck.reason,
    });
  }

  const packageCode = resolvePackageCodeFromPayload(payload);
  const customerEmail = resolveCustomerEmail(payload);
  const eventKey = resolveEventKey(payload);
  const eventType = String(payload?.eventType || payload?.event_type || "wix_event");
  let checkoutSessionId = resolveCheckoutSessionIdFromPayload(req, payload);
  const orderId = payload?.orderId || payload?.order_id || payload?.order?.id || null;
  const transactionId =
    payload?.transactionId || payload?.transaction_id || payload?.payment?.id || null;
  if (!checkoutSessionId && packageCode && customerEmail) {
    checkoutSessionId = await resolveFallbackCheckoutSessionId({
      customerEmail,
      packageCode,
      orderId: orderId ? String(orderId) : null,
    });
  }

  const lifecycleBasePayload = {
    packageCode,
    customerEmail,
    orderId: orderId ? String(orderId) : null,
    transactionId: transactionId ? String(transactionId) : null,
    checkoutSessionId,
    signature: {
      configured: signatureCheck.configured,
      valid: signatureCheck.valid,
      reason: signatureCheck.reason,
      timestampMs: signatureCheck.timestampMs || null,
    },
    receivedAt: new Date().toISOString(),
    payload,
  };

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
    select: { status: true },
  });

  await prisma.webhookEvent.upsert({
    where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
    update: {
      eventType,
      payload: lifecycleBasePayload,
      status: "RECEIVED",
      error: null,
    },
    create: {
      provider: WEBHOOK_PROVIDER_WIX,
      eventKey,
      eventType,
      payload: lifecycleBasePayload,
      status: "RECEIVED",
    },
  });

  if (checkoutSessionId) {
    await upsertCheckoutSessionEvent(checkoutSessionId, {
      status: "RECEIVED",
      eventType,
      payload: {
        ...lifecycleBasePayload,
        eventKey,
      },
    });
  }

  if (existingEvent?.status === "PROCESSED") {
    if (checkoutSessionId) {
      await upsertCheckoutSessionEvent(checkoutSessionId, {
        status: "PROCESSED",
        eventType,
        payload: {
          ...lifecycleBasePayload,
          eventKey,
          duplicate: true,
        },
      });
    }
    return res.json({ success: true, processed: true, duplicate: true });
  }

  if (!packageCode) {
    const error = "Unsupported or missing package code.";
    await prisma.webhookEvent.update({
      where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
      data: {
        status: "IGNORED",
        error,
      },
    });
    if (checkoutSessionId) {
      await upsertCheckoutSessionEvent(checkoutSessionId, {
        status: "ERROR",
        eventType,
        error,
        payload: {
          ...lifecycleBasePayload,
          eventKey,
        },
      });
    }
    return res.json({ success: true, ignored: true });
  }

  if (!customerEmail) {
    const error = "Customer email missing.";
    await prisma.webhookEvent.update({
      where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
      data: {
        status: "ERROR",
        error,
      },
    });
    if (checkoutSessionId) {
      await upsertCheckoutSessionEvent(checkoutSessionId, {
        status: "ERROR",
        eventType,
        error,
        payload: {
          ...lifecycleBasePayload,
          eventKey,
        },
      });
    }
    return res.status(400).json({ error });
  }

  await prisma.webhookEvent.update({
    where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
    data: { status: "VERIFIED", error: null },
  });
  if (checkoutSessionId) {
    await upsertCheckoutSessionEvent(checkoutSessionId, {
      status: "VERIFIED",
      eventType,
      payload: {
        ...lifecycleBasePayload,
        eventKey,
      },
    });
  }

  try {
    let targetOrganizationId: string | null = null;
    if (checkoutSessionId) {
      const checkoutSession = await prisma.webhookEvent.findUnique({
        where: {
          provider_eventKey: {
            provider: WEBHOOK_PROVIDER_CHECKOUT,
            eventKey: checkoutSessionId,
          },
        },
        select: {
          organizationId: true,
          payload: true,
        },
      });
      const boundOrgId =
        checkoutSession?.organizationId ||
        (typeof (checkoutSession?.payload as any)?.organizationId === "string"
          ? ((checkoutSession?.payload as any).organizationId as string)
          : null);
      if (boundOrgId) {
        targetOrganizationId = boundOrgId;
      }
    }

    const activation = targetOrganizationId
      ? await byokService.activatePackageForOrganization(targetOrganizationId, packageCode, {
          customerEmail: customerEmail || null,
          wixOrderId: orderId ? String(orderId) : null,
          wixTransactionId: transactionId ? String(transactionId) : null,
          source: "wix_webhook",
          raw: payload,
        })
      : await byokService.activatePackageForEmail(customerEmail, packageCode, {
          wixOrderId: orderId ? String(orderId) : null,
          wixTransactionId: transactionId ? String(transactionId) : null,
          source: "wix_webhook",
          raw: payload,
        });

    await prisma.webhookEvent.update({
      where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
      data: {
        status: "PROCESSED",
        organizationId: activation.organization?.id || undefined,
        payload: {
          ...lifecycleBasePayload,
          eventKey,
          organizationId: activation.organization?.id || null,
          processedAt: new Date().toISOString(),
        },
        error: null,
      },
    });

    if (checkoutSessionId) {
      await upsertCheckoutSessionEvent(checkoutSessionId, {
        status: "PROCESSED",
        eventType,
        organizationId: activation.organization?.id || null,
        payload: {
          ...lifecycleBasePayload,
          eventKey,
          organizationId: activation.organization?.id || null,
          processedAt: new Date().toISOString(),
        },
      });
    }

    return res.json({ success: true, processed: true, checkoutSessionId });
  } catch (error: any) {
    const message = error?.message || "Webhook processing failed.";
    await prisma.webhookEvent.update({
      where: { provider_eventKey: { provider: WEBHOOK_PROVIDER_WIX, eventKey } },
      data: {
        status: "ERROR",
        error: message,
      },
    });
    if (checkoutSessionId) {
      await upsertCheckoutSessionEvent(checkoutSessionId, {
        status: "ERROR",
        eventType,
        error: message,
        payload: {
          ...lifecycleBasePayload,
          eventKey,
        },
      });
    }
    return res.status(500).json({ error: message });
  }
};

router.post("/api/byok/wix/webhook", handleWixWebhook);
router.post("/api/webhooks/wix", handleWixWebhook);

router.post(
  "/api/byok/bootstrap",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await byokService.ensureByokTrialWorkspace(req.user!.id);
      const status = await byokService.getStatusForSessionUser(result.user.id);
      return res.json({
        success: true,
        profileId: result.user.id,
        created: result.created,
        status,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/byok/link-key",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const falApiKey = typeof req.body?.falApiKey === "string" ? req.body.falApiKey : "";
      if (!falApiKey.trim()) {
        return res.status(400).json({ error: "Fal API key is required." });
      }
      await byokService.linkFalKey(req.user!.id, falApiKey);
      const status = await byokService.getStatusForSessionUser(req.user!.id);
      return res.json({
        success: true,
        message:
          "Welcome to your 14 day trial. Trial includes 5 renders/day. Upgrade anytime for no daily limit.",
        status,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  },
);

router.get("/api/byok/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await byokService.getStatusForSessionUser(req.user!.id);
    return res.json({ success: true, status });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get(
  "/api/superadmin/byok/organizations",
  authenticateToken,
  requireSuperAdmin,
  async (_req, res) => {
    try {
      const orgs = await prisma.organization.findMany({
        where: { provisioningSource: "BYOK" },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
              seatLocked: true,
            },
            orderBy: [{ createdAt: "asc" }],
          },
          entitlement: true,
        },
        orderBy: [{ createdAt: "desc" }],
      });

      return res.json({
        success: true,
        organizations: orgs,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/superadmin/byok/activate",
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const organizationId =
        typeof req.body?.organizationId === "string" ? req.body.organizationId : "";
      const packageCode = typeof req.body?.packageCode === "string" ? req.body.packageCode : "";
      if (
        !organizationId ||
        !packageCode ||
        !BYOK_PACKAGE_ORDER.includes(packageCode as ByokPackageCode)
      ) {
        return res.status(400).json({ error: "Invalid activation payload." });
      }

      const result = await byokService.activatePackageForOrganization(
        organizationId,
        packageCode as ByokPackageCode,
        {
          source: "superadmin_manual",
          raw: { by: "superadmin_manual", packageCode },
        },
      );
      return res.json({ success: true, result });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/superadmin/byok/reset-trial",
  authenticateToken,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const organizationId =
        typeof req.body?.organizationId === "string" ? req.body.organizationId.trim() : "";
      const email =
        typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

      if (!organizationId && !email) {
        return res.status(400).json({ error: "organizationId or email is required." });
      }

      const result = organizationId
        ? await byokService.resetTrialForOrganization(organizationId, {
            by: req.user?.email || "superadmin",
            reason,
          })
        : await byokService.resetTrialForEmail(email, {
            by: req.user?.email || "superadmin",
            reason,
          });

      return res.json({ success: true, result });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to reset trial." });
    }
  },
);

router.post(
  "/api/superadmin/byok/reconcile",
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const organizationId =
        typeof req.body?.organizationId === "string" ? req.body.organizationId.trim() : "";

      if (organizationId) {
        const result = await byokService.reconcileOrganization(organizationId);
        return res.json({ success: true, organizationId, result, count: 1 });
      }

      const orgs = await prisma.organization.findMany({
        where: { provisioningSource: "BYOK" },
        select: { id: true },
        orderBy: [{ createdAt: "desc" }],
      });

      const results: any[] = [];
      for (const org of orgs) {
        try {
          const result = await byokService.reconcileOrganization(org.id);
          results.push(result);
        } catch (error: any) {
          results.push({
            organizationId: org.id,
            repaired: false,
            error: error?.message || "reconcile_failed",
          });
        }
      }

      return res.json({
        success: true,
        count: results.length,
        repaired: results.filter((entry) => entry.repaired === true).length,
        results,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || "Failed to reconcile BYOK organizations.",
      });
    }
  },
);

router.get(
  "/api/superadmin/byok/webhook-events",
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const status =
        typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
      const packageCode =
        typeof req.query.packageCode === "string"
          ? req.query.packageCode.trim().toUpperCase()
          : "";
      const organizationId =
        typeof req.query.organizationId === "string" ? req.query.organizationId.trim() : "";
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
      const limitRaw =
        typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 100;
      const limit = Math.max(
        1,
        Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100),
      );

      const where: any = {
        provider: { in: [WEBHOOK_PROVIDER_WIX, WEBHOOK_PROVIDER_CHECKOUT] },
      };
      if (status) {
        where.status = status;
      }
      if (organizationId) {
        where.organizationId = organizationId;
      }
      if (from || to) {
        where.createdAt = {};
        if (from) {
          const fromDate = new Date(from);
          if (!Number.isNaN(fromDate.getTime())) {
            where.createdAt.gte = fromDate;
          }
        }
        if (to) {
          const toDate = new Date(to);
          if (!Number.isNaN(toDate.getTime())) {
            where.createdAt.lte = toDate;
          }
        }
      }

      const events = await prisma.webhookEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
      });

      const filtered = packageCode
        ? events.filter((event) => {
            const payload = (event.payload || {}) as any;
            const resolved = toByokPlanCode(
              payload.packageCode || payload.requestedPackageCode || payload.plan,
            );
            return resolved === packageCode;
          })
        : events;

      const mapped = filtered.map((event) => {
        const payload = (event.payload || {}) as any;
        const resolvedPackage =
          toByokPlanCode(payload.packageCode || payload.requestedPackageCode || payload.plan) ||
          null;
        return {
          id: event.id,
          provider: event.provider,
          eventKey: event.eventKey,
          eventType: event.eventType,
          status: event.status,
          organizationId: event.organizationId,
          packageCode: resolvedPackage,
          checkoutSessionId: payload.checkoutSessionId || null,
          orderId: payload.orderId || null,
          customerEmail: payload.customerEmail || null,
          error: event.error,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          payload,
        };
      });

      return res.json({
        success: true,
        count: mapped.length,
        events: mapped,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: error?.message || "Failed to fetch webhook events." });
    }
  },
);

router.get(
  "/api/superadmin/byok/ops-health",
  authenticateToken,
  requireSuperAdmin,
  async (_req, res) => {
    try {
      const now = Date.now();
      const lastHour = new Date(now - 60 * 60 * 1000);
      const last24h = new Date(now - 24 * 60 * 60 * 1000);
      const staleCutoff = new Date(now - BYOK_STALE_PENDING_MINUTES * 60 * 1000);

      const [hourEvents, dayEvents, stalePending, orgs] = await Promise.all([
        prisma.webhookEvent.findMany({
          where: {
            provider: { in: [WEBHOOK_PROVIDER_WIX, WEBHOOK_PROVIDER_CHECKOUT] },
            createdAt: { gte: lastHour },
          },
          select: { status: true, error: true, payload: true },
        }),
        prisma.webhookEvent.findMany({
          where: {
            provider: { in: [WEBHOOK_PROVIDER_WIX, WEBHOOK_PROVIDER_CHECKOUT] },
            createdAt: { gte: last24h },
          },
          select: { status: true, error: true, payload: true },
        }),
        prisma.webhookEvent.findMany({
          where: {
            provider: WEBHOOK_PROVIDER_CHECKOUT,
            status: { in: ["PENDING", "RECEIVED", "VERIFIED"] },
            createdAt: { lte: staleCutoff },
          },
          orderBy: [{ createdAt: "asc" }],
          take: 200,
          select: {
            id: true,
            eventKey: true,
            status: true,
            organizationId: true,
            createdAt: true,
            payload: true,
          },
        }),
        prisma.organization.findMany({
          where: { provisioningSource: "BYOK" },
          include: { entitlement: true },
          orderBy: [{ createdAt: "desc" }],
        }),
      ]);

      const summarize = (events: Array<{ status: string; error: string | null; payload: any }>) => {
        const total = events.length;
        const errorCount = events.filter((e) => (e.status || "").toUpperCase() === "ERROR").length;
        const processed = events.filter((e) => (e.status || "").toUpperCase() === "PROCESSED").length;
        const pending = events.filter((e) =>
          ["PENDING", "RECEIVED", "VERIFIED"].includes((e.status || "").toUpperCase()),
        ).length;
        const ignored = events.filter((e) => (e.status || "").toUpperCase() === "IGNORED").length;
        const errorRate = total > 0 ? Number(((errorCount / total) * 100).toFixed(2)) : 0;

        const errorByCode: Record<string, number> = {};
        for (const event of events) {
          if ((event.status || "").toUpperCase() !== "ERROR") continue;
          const payload = (event.payload || {}) as any;
          const signatureReason = payload?.signature?.reason;
          const code = String(signatureReason || event.error || "UNKNOWN_ERROR");
          errorByCode[code] = (errorByCode[code] || 0) + 1;
        }

        return {
          total,
          processed,
          pending,
          ignored,
          errorCount,
          errorRate,
          errorByCode,
        };
      };

      const routingDrift: Array<{
        organizationId: string;
        organizationName: string;
        expectedRoutingDomain: string;
        actualRoutingDomain: string | null;
        expectedPackageCode: string;
      }> = [];
      const entitlementDrift: Array<{
        organizationId: string;
        organizationName: string;
        expectedPackageCode: string;
        organizationEntitlementCode: string | null;
        entitlementPackageCode: string | null;
        entitlementStatus: string | null;
      }> = [];

      for (const org of orgs) {
        const entitlementCode = toByokPlanCode(org.entitlement?.packageCode || null);
        const orgCode = toByokPlanCode(org.entitlementCode || null);
        const expectedPackage = entitlementCode || orgCode || "BYOK_TRIAL";
        const expectedConfig = BYOK_PACKAGE_CONFIG[expectedPackage];

        if ((org.routingDomain || null) !== (expectedConfig.routingDomain || null)) {
          routingDrift.push({
            organizationId: org.id,
            organizationName: org.name,
            expectedRoutingDomain: expectedConfig.routingDomain,
            actualRoutingDomain: org.routingDomain || null,
            expectedPackageCode: expectedPackage,
          });
        }

        const hasEntitlementDrift =
          org.entitlementCode !== expectedPackage ||
          org.entitlement?.packageCode !== expectedPackage ||
          (org.entitlement?.status || "ACTIVE") !== "ACTIVE";

        if (hasEntitlementDrift) {
          entitlementDrift.push({
            organizationId: org.id,
            organizationName: org.name,
            expectedPackageCode: expectedPackage,
            organizationEntitlementCode: org.entitlementCode || null,
            entitlementPackageCode: org.entitlement?.packageCode || null,
            entitlementStatus: org.entitlement?.status || null,
          });
        }
      }

      return res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        stalePendingMinutes: BYOK_STALE_PENDING_MINUTES,
        windows: {
          lastHour: summarize(hourEvents),
          last24Hours: summarize(dayEvents),
        },
        stalePendingActivations: {
          count: stalePending.length,
          events: stalePending.map((event) => {
            const payload = (event.payload || {}) as any;
            return {
              id: event.id,
              checkoutSessionId: event.eventKey,
              status: event.status,
              createdAt: event.createdAt,
              organizationId: event.organizationId || payload.organizationId || null,
              packageCode: payload.packageCode || null,
              customerEmail: payload.customerEmail || null,
              orderId: payload.orderId || null,
            };
          }),
        },
        routingDrift: {
          count: routingDrift.length,
          organizations: routingDrift,
        },
        entitlementDrift: {
          count: entitlementDrift.length,
          organizations: entitlementDrift,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to build ops health summary." });
    }
  },
);

router.get("/api/byok/domain-context", async (req, res) => {
  return res.json({
    success: true,
    host: resolveIncomingHost(req),
  });
});

export default router;
