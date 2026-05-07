import express, { Request, Response } from "express";
import crypto from "node:crypto";
import { authenticateToken, AuthenticatedRequest, requireSuperAdmin } from "../middleware/auth";
import { byokService } from "../services/byok";
import { prisma } from "../services/database";
import { BYOK_PACKAGE_ORDER, BYOK_PACKAGE_CONFIG, ByokPackageCode } from "../config/byok";

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
  Number.parseInt(process.env.BYOK_WIX_SIGNATURE_MAX_AGE_SECONDS || "300", 10) || 300,
);
const BYOK_WIX_SIGNATURE_MAX_FUTURE_SKEW_SECONDS = Math.max(
  0,
  Number.parseInt(process.env.BYOK_WIX_SIGNATURE_MAX_FUTURE_SKEW_SECONDS || "90", 10) || 90,
);

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

const resolveIncomingHost = (req: Request): string | null => {
  const forwarded = req.headers["x-forwarded-host"];
  const forwardedHost = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = forwardedHost || req.headers.host || "";
  const firstHost = candidate.toString().split(",")[0];
  return sanitizeDomain(firstHost);
};

const parseWebhookPayload = (body: any) => {
  if (!body) return null;
  if (typeof body === "object") return body;
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      const jwtParts = trimmed.split(".");
      if (jwtParts.length === 3) {
        try {
          const payload = JSON.parse(
            Buffer.from(jwtParts[1], "base64url").toString("utf8"),
          );
          return payload;
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
    normalizeProvidedSignature(
      typeof req.query.sig === "string" ? req.query.sig : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.signature === "string" ? payload.signature : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.webhookSignature === "string" ? payload.webhookSignature : "",
    ) ||
    normalizeProvidedSignature(
      typeof payload?.webhook_signature === "string" ? payload.webhook_signature : "",
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
    const querySecret = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
    if (querySecret && secureEqual(querySecret, BYOK_WEBHOOK_SECRET)) {
      return true;
    }
  }
  return false;
};

router.get("/api/byok/packages", async (_req, res) => {
  const packages = await byokService.getPackageCatalog();
  res.json({
    success: true,
    packages: packages.filter((pkg) => pkg.code !== "BYOK_TRIAL"),
    trial: BYOK_PACKAGE_CONFIG.BYOK_TRIAL,
  });
});

const handleWixWebhook = async (req: Request, res: Response) => {
  const payload = parseWebhookPayload(req.body);
  if (!isWebhookAuthorized(req, payload)) {
    return res.status(401).json({ error: "Unauthorized webhook." });
  }

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid webhook payload." });
  }

  const signatureCheck = evaluateWebhookSignature(req, payload);
  if (BYOK_WIX_REQUIRE_SIGNATURE) {
    if (!signatureCheck.configured) {
      return res.status(503).json({ error: "Webhook signature validation misconfigured." });
    }
    if (!signatureCheck.valid) {
      return res.status(401).json({
        error: "Invalid webhook signature.",
        code: signatureCheck.reason,
      });
    }
  } else if (signatureCheck.configured && signatureCheck.present && !signatureCheck.valid) {
    return res.status(401).json({
      error: "Invalid webhook signature.",
      code: signatureCheck.reason,
    });
  }

  const packageCode = resolvePackageCodeFromPayload(payload);
  const customerEmail = resolveCustomerEmail(payload);
  const eventKey = resolveEventKey(payload);
  const eventType = String(payload?.eventType || payload?.event_type || "wix_event");
  const orderId =
    payload?.orderId || payload?.order_id || payload?.order?.id || null;
  const transactionId =
    payload?.transactionId ||
    payload?.transaction_id ||
    payload?.payment?.id ||
    null;

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { provider_eventKey: { provider: "WIX", eventKey } },
    select: { status: true },
  });
  if (existingEvent?.status === "PROCESSED") {
    return res.json({ success: true, processed: true, duplicate: true });
  }

  if (!packageCode) {
    await prisma.webhookEvent.upsert({
      where: { provider_eventKey: { provider: "WIX", eventKey } },
      update: {
        eventType,
        payload,
        status: "IGNORED",
        error: "Unsupported or missing package code.",
      },
      create: {
        provider: "WIX",
        eventKey,
        eventType,
        payload,
        status: "IGNORED",
        error: "Unsupported or missing package code.",
      },
    });
    return res.json({ success: true, ignored: true });
  }

  if (!customerEmail) {
    await prisma.webhookEvent.upsert({
      where: { provider_eventKey: { provider: "WIX", eventKey } },
      update: {
        eventType,
        payload,
        status: "ERROR",
        error: "Customer email missing.",
      },
      create: {
        provider: "WIX",
        eventKey,
        eventType,
        payload,
        status: "ERROR",
        error: "Customer email missing.",
      },
    });
    return res.status(400).json({ error: "Customer email missing." });
  }

  try {
    await byokService.activatePackageForEmail(customerEmail, packageCode, {
      wixOrderId: orderId ? String(orderId) : null,
      wixTransactionId: transactionId ? String(transactionId) : null,
      source: "wix_webhook",
      raw: payload,
    });

    await prisma.webhookEvent.upsert({
      where: { provider_eventKey: { provider: "WIX", eventKey } },
      update: {
        eventType,
        payload,
        status: "PROCESSED",
        error: null,
      },
      create: {
        provider: "WIX",
        eventKey,
        eventType,
        payload,
        status: "PROCESSED",
      },
    });

    return res.json({ success: true, processed: true });
  } catch (error: any) {
    await prisma.webhookEvent.upsert({
      where: { provider_eventKey: { provider: "WIX", eventKey } },
      update: {
        eventType,
        payload,
        status: "ERROR",
        error: error?.message || "Webhook processing failed.",
      },
      create: {
        provider: "WIX",
        eventKey,
        eventType,
        payload,
        status: "ERROR",
        error: error?.message || "Webhook processing failed.",
      },
    });
    return res.status(500).json({ error: error?.message || "Webhook processing failed." });
  }
};

router.post("/api/byok/wix/webhook", handleWixWebhook);
router.post("/api/webhooks/wix", handleWixWebhook);

router.post("/api/byok/bootstrap", authenticateToken, async (req: AuthenticatedRequest, res) => {
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
});

router.post("/api/byok/link-key", authenticateToken, async (req: AuthenticatedRequest, res) => {
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
});

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
      const organizationId = typeof req.body?.organizationId === "string" ? req.body.organizationId : "";
      const packageCode = typeof req.body?.packageCode === "string" ? req.body.packageCode : "";
      if (!organizationId || !packageCode || !BYOK_PACKAGE_ORDER.includes(packageCode as ByokPackageCode)) {
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

router.get("/api/byok/domain-context", async (req, res) => {
  return res.json({
    success: true,
    host: resolveIncomingHost(req),
  });
});

export default router;
