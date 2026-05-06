import express, { Request } from "express";
import crypto from "node:crypto";
import { authenticateToken, AuthenticatedRequest, requireSuperAdmin } from "../middleware/auth";
import { byokService } from "../services/byok";
import { prisma } from "../services/database";
import { BYOK_PACKAGE_ORDER, BYOK_PACKAGE_CONFIG, ByokPackageCode } from "../config/byok";

const router = express.Router();

const BYOK_WEBHOOK_SECRET = process.env.BYOK_WIX_WEBHOOK_SECRET || "";

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

const isWebhookAuthorized = (req: Request) => {
  if (!BYOK_WEBHOOK_SECRET) {
    return false;
  }
  const headerSecret =
    (req.headers["x-byok-webhook-secret"] as string) ||
    (req.headers["x-webhook-secret"] as string) ||
    "";
  if (headerSecret && headerSecret === BYOK_WEBHOOK_SECRET) {
    return true;
  }
  const authHeader = (req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    return token === BYOK_WEBHOOK_SECRET;
  }
  if (typeof req.query.secret === "string" && req.query.secret === BYOK_WEBHOOK_SECRET) {
    return true;
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

router.post("/api/byok/wix/webhook", async (req, res) => {
  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized webhook." });
  }

  const payload = parseWebhookPayload(req.body);
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid webhook payload." });
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
});

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
