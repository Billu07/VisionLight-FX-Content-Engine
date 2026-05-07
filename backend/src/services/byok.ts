import { prisma } from "./database";
import {
  BYOK_PACKAGE_CONFIG,
  BYOK_PACKAGE_ORDER,
  ByokPackageCode,
  getByokPackageConfig,
} from "../config/byok";
import { encryptionUtils } from "../utils/encryption";

const DAILY_USAGE_DAY_MS = 24 * 60 * 60 * 1000;

const getUtcDayStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const coerceRole = (role: unknown): "SUPERADMIN" | "ADMIN" | "MANAGER" | "USER" => {
  if (role === "SUPERADMIN") return "SUPERADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "MANAGER") return "MANAGER";
  return "USER";
};

const getPrimaryOrgUser = async (organizationId: string) =>
  prisma.user.findFirst({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

const applySeatLockPolicy = async (
  organizationId: string,
  maxUsers: number,
  lockExtraSeats: boolean,
) => {
  const users = await prisma.user.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const keepIds = new Set(users.slice(0, maxUsers).map((u) => u.id));
  await prisma.user.updateMany({
    where: { organizationId },
    data: { seatLocked: false },
  });

  if (lockExtraSeats && users.length > maxUsers) {
    await prisma.user.updateMany({
      where: {
        organizationId,
        id: { notIn: Array.from(keepIds) },
      },
      data: { seatLocked: true },
    });
  }
};

const applyPackageToOrganization = async (
  organizationId: string,
  packageCode: ByokPackageCode,
  options?: {
    keepFalKey?: boolean;
    trialEndsAt?: Date | null;
  },
) => {
  const config = BYOK_PACKAGE_CONFIG[packageCode];
  const owner = await getPrimaryOrgUser(organizationId);
  const ownerMaxProjects = owner
    ? Math.max(1, Math.min(config.ownerMaxProjects, config.maxProjectsTotal))
    : config.ownerMaxProjects;

  const orgData: any = {
    provisioningSource: "BYOK",
    entitlementCode: packageCode,
    routingDomain: config.routingDomain,
    adminPanelLocked: config.adminPanelLocked,
    renderDailyLimit: config.renderDailyLimit,
    storageRetentionDays: config.storageRetentionDays,
    maxUsers: config.maxUsers,
    maxProjectsTotal: config.maxProjectsTotal,
    maxStorageMb: config.maxStorageMb,
    isActive: true,
    provisioningStatus: "READY",
    tenantPlan: packageCode === "BYOK_TRIAL" ? "DEMO" : "PAID",
    trialEndsAt:
      options?.trialEndsAt !== undefined
        ? options.trialEndsAt
        : config.trialDays
          ? new Date(Date.now() + config.trialDays * DAILY_USAGE_DAY_MS)
          : null,
  };

  await prisma.organization.update({
    where: { id: organizationId },
    data: orgData,
  });

  if (owner) {
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        role: "ADMIN",
        view: config.view,
        maxProjects: ownerMaxProjects,
        seatLocked: false,
      },
    });
  }

  await applySeatLockPolicy(organizationId, config.maxUsers, config.lockExtraSeats);
};

const getTrialDates = (org: any) => {
  if (!org?.trialEndsAt) {
    return { trialEndsAt: null, trialActive: false, trialExpired: false };
  }
  const trialEndsAt = new Date(org.trialEndsAt);
  const trialExpired = trialEndsAt.getTime() <= Date.now();
  return { trialEndsAt, trialActive: !trialExpired, trialExpired };
};

const getUsageSnapshot = async (organizationId: string, dailyLimit: number | null) => {
  if (!dailyLimit || dailyLimit < 1) {
    return {
      usageDate: getUtcDayStart(),
      used: 0,
      remaining: null as number | null,
      limit: null as number | null,
    };
  }

  const usageDate = getUtcDayStart();
  const usage = await prisma.byokRenderUsage.findUnique({
    where: {
      organizationId_usageDate: {
        organizationId,
        usageDate,
      },
    },
  });
  const used = usage?.count || 0;
  return {
    usageDate,
    used,
    remaining: Math.max(0, dailyLimit - used),
    limit: dailyLimit,
  };
};

const toByokPackageCode = (raw?: string | null): ByokPackageCode | null => {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  if ((BYOK_PACKAGE_ORDER as string[]).includes(normalized)) {
    return normalized as ByokPackageCode;
  }
  if (normalized === "BYOK_TRIAL") return "BYOK_TRIAL";
  return null;
};

export const byokService = {
  async getPackageCatalog() {
    return BYOK_PACKAGE_ORDER.map((code) => ({
      ...BYOK_PACKAGE_CONFIG[code],
    }));
  },

  async ensureByokTrialWorkspace(sessionUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      include: { organization: true },
    });
    if (!user) {
      throw new Error("User not found.");
    }

    if (user.organization?.provisioningSource === "BYOK") {
      return { user, organization: user.organization, created: false };
    }

    const authUserId = user.authUserId || null;
    const email = user.email.trim().toLowerCase();

    const existingByokProfile = await prisma.user.findFirst({
      where: {
        OR: [
          ...(authUserId ? [{ authUserId }] : []),
          { email: { equals: email, mode: "insensitive" } },
        ],
        organization: {
          provisioningSource: "BYOK",
        },
      },
      include: { organization: true },
      orderBy: [{ createdAt: "asc" }],
    });
    if (existingByokProfile?.organization) {
      return {
        user: existingByokProfile,
        organization: existingByokProfile.organization,
        created: false,
      };
    }

    const trialConfig = BYOK_PACKAGE_CONFIG.BYOK_TRIAL;
    const orgNameBase = email.includes("@") ? email.split("@")[0] : email;
    const organization = await prisma.organization.create({
      data: {
        name: `${orgNameBase} BYOK`,
        provisioningSource: "BYOK",
        entitlementCode: "BYOK_TRIAL",
        routingDomain: trialConfig.routingDomain,
        adminPanelLocked: trialConfig.adminPanelLocked,
        renderDailyLimit: trialConfig.renderDailyLimit,
        storageRetentionDays: trialConfig.storageRetentionDays,
        provisioningStatus: "PENDING",
        tenantPlan: "DEMO",
        trialEndsAt: new Date(Date.now() + (trialConfig.trialDays || 14) * DAILY_USAGE_DAY_MS),
        maxUsers: trialConfig.maxUsers,
        maxProjectsTotal: trialConfig.maxProjectsTotal,
        maxStorageMb: trialConfig.maxStorageMb,
        isDefault: false,
        isActive: true,
      } as any,
    });

    const canConvertCurrent =
      !user.organizationId &&
      coerceRole(user.role) === "USER" &&
      (await prisma.user.count({
        where: {
          OR: [
            ...(authUserId ? [{ authUserId }] : []),
            { email: { equals: email, mode: "insensitive" } },
          ],
        },
      })) === 1;

    let byokUser;
    if (canConvertCurrent) {
      byokUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          organizationId: organization.id,
          role: "ADMIN",
          view: trialConfig.view,
          maxProjects: trialConfig.ownerMaxProjects,
          seatLocked: false,
          isDemo: false,
          creditSystem: "INTERNAL",
        },
        include: { organization: true },
      });
    } else {
      byokUser = await prisma.user.create({
        data: {
          authUserId: authUserId || undefined,
          email,
          name: user.name || orgNameBase,
          role: "ADMIN",
          view: trialConfig.view,
          maxProjects: trialConfig.ownerMaxProjects,
          organizationId: organization.id,
          seatLocked: false,
          isDemo: false,
          creditSystem: "INTERNAL",
          creditsPicDrift: 0,
          creditsPicDriftPlus: 0,
          creditsImageFX: 0,
          creditsVideoFX1: 0,
          creditsVideoFX2: 0,
          creditsVideoFX3: 0,
          creditBalance: 0,
        },
        include: { organization: true },
      });
    }

    await prisma.organizationEntitlement.upsert({
      where: { organizationId: organization.id },
      update: {
        packageCode: "BYOK_TRIAL",
        status: "ACTIVE",
        customerEmail: email,
        activatedAt: new Date(),
        metadata: { source: "bootstrap" },
      },
      create: {
        organizationId: organization.id,
        packageCode: "BYOK_TRIAL",
        status: "ACTIVE",
        customerEmail: email,
        activatedAt: new Date(),
        metadata: { source: "bootstrap" },
      },
    });

    return {
      user: byokUser,
      organization: byokUser.organization!,
      created: true,
    };
  },

  async getByokProfileForSessionUser(sessionUserId: string) {
    const sessionUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
      include: { organization: true },
    });
    if (!sessionUser) return null;

    // Scope BYOK state to the currently selected workspace profile.
    // Never infer BYOK status from sibling profiles that share auth/email.
    if (sessionUser.organization?.provisioningSource !== "BYOK") {
      return null;
    }
    return sessionUser;
  },

  async linkFalKey(sessionUserId: string, falApiKeyRaw: string) {
    const profile = await this.getByokProfileForSessionUser(sessionUserId);
    if (!profile?.organizationId || !profile.organization) {
      throw new Error("BYOK profile not found.");
    }
    const falApiKey = falApiKeyRaw.trim();
    if (!falApiKey) {
      throw new Error("Fal API key is required.");
    }

    const org = await prisma.organization.update({
      where: { id: profile.organizationId },
      data: {
        falApiKey: encryptionUtils.encrypt(falApiKey),
        provisioningStatus: "READY",
        isActive: true,
      },
    });
    return org;
  },

  async getStatusForSessionUser(sessionUserId: string) {
    const profile = await this.getByokProfileForSessionUser(sessionUserId);
    if (!profile?.organizationId || !profile.organization) {
      return { isByok: false };
    }

    const org = profile.organization;
    const entitlement =
      (await prisma.organizationEntitlement.findUnique({
        where: { organizationId: org.id },
      })) ||
      null;
    const packageConfig = getByokPackageConfig(org.entitlementCode);
    const { trialEndsAt, trialActive, trialExpired } = getTrialDates(org);
    const usage = await getUsageSnapshot(org.id, org.renderDailyLimit);

    const upgradeRequired =
      org.entitlementCode === "BYOK_TRIAL" &&
      trialExpired;

    return {
      isByok: true,
      profileId: profile.id,
      email: profile.email,
      organizationId: org.id,
      organizationName: org.name,
      provisioningStatus: org.provisioningStatus,
      entitlementCode: org.entitlementCode,
      packageCode: entitlement?.packageCode || org.entitlementCode || null,
      packageTitle: packageConfig?.title || null,
      routingDomain: org.routingDomain || packageConfig?.routingDomain || null,
      adminPanelLocked: org.adminPanelLocked === true,
      renderDailyLimit: org.renderDailyLimit ?? null,
      dailyUsage: usage,
      trialEndsAt: trialEndsAt?.toISOString() || null,
      trialActive,
      trialExpired,
      upgradeRequired,
      hasFalKey: !!encryptionUtils.decrypt(org.falApiKey),
      maxUsers: org.maxUsers,
      maxProjectsTotal: org.maxProjectsTotal,
      maxStorageMb: org.maxStorageMb,
      storageRetentionDays: org.storageRetentionDays ?? null,
      view: profile.view === "PICDRIFT" ? "PICDRIFT" : "VISIONLIGHT",
      entitlementStatus: entitlement?.status || null,
      entitlementExpiresAt: entitlement?.expiresAt?.toISOString() || null,
    };
  },

  async assertRenderAllowed(sessionUserId: string) {
    const profile = await this.getByokProfileForSessionUser(sessionUserId);
    if (!profile?.organizationId || !profile.organization) {
      return {
        allowed: true,
        shouldCountDailyUsage: false,
      };
    }

    const status = await this.getStatusForSessionUser(sessionUserId);
    if (!status.isByok) {
      return {
        allowed: true,
        shouldCountDailyUsage: false,
      };
    }
    if (status.provisioningStatus !== "READY") {
      return {
        allowed: false,
        code: "BYOK_NOT_READY",
        statusCode: 403,
        message: "Workspace setup is still pending. Please wait a moment and retry.",
      };
    }
    if (!status.hasFalKey) {
      return {
        allowed: false,
        code: "MISSING_FAL_KEY",
        statusCode: 403,
        message: "Fal API key is required. Open BYOK setup and link your key.",
      };
    }
    if (status.upgradeRequired) {
      return {
        allowed: false,
        code: "UPGRADE_REQUIRED",
        statusCode: 402,
        message:
          "Your 14-day BYOK trial ended. Choose a package to continue rendering.",
      };
    }

    if (
      typeof status.renderDailyLimit === "number" &&
      status.renderDailyLimit > 0 &&
      status.dailyUsage.used >= status.renderDailyLimit
    ) {
      return {
        allowed: false,
        code: "DAILY_RENDER_LIMIT",
        statusCode: 429,
        message: `Daily render limit reached (${status.renderDailyLimit}/day).`,
      };
    }

    return {
      allowed: true,
      shouldCountDailyUsage:
        typeof status.renderDailyLimit === "number" && status.renderDailyLimit > 0,
    };
  },

  async consumeDailyRender(sessionUserId: string) {
    const profile = await this.getByokProfileForSessionUser(sessionUserId);
    if (!profile?.organizationId || !profile.organization) return null;
    if (!profile.organization.renderDailyLimit || profile.organization.renderDailyLimit < 1) {
      return null;
    }

    const usageDate = getUtcDayStart();
    await prisma.byokRenderUsage.upsert({
      where: {
        organizationId_usageDate: {
          organizationId: profile.organizationId,
          usageDate,
        },
      },
      update: { count: { increment: 1 } },
      create: {
        organizationId: profile.organizationId,
        usageDate,
        count: 1,
      },
    });
    return true;
  },

  async activatePackageForOrganization(
    organizationId: string,
    packageCode: ByokPackageCode,
    metadata: {
      customerEmail?: string | null;
      wixOrderId?: string | null;
      wixTransactionId?: string | null;
      source?: string;
      raw?: any;
    },
  ) {
    const pkg = BYOK_PACKAGE_CONFIG[packageCode];
    if (!pkg) throw new Error("Unsupported package code.");
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, provisioningSource: true },
    });
    if (!org || org.provisioningSource !== "BYOK") {
      throw new Error("BYOK organization not found.");
    }

    await applyPackageToOrganization(organizationId, packageCode);
    const entitlement = await prisma.organizationEntitlement.upsert({
      where: { organizationId },
      update: {
        packageCode,
        status: "ACTIVE",
        wixOrderId: metadata.wixOrderId || undefined,
        wixTransactionId: metadata.wixTransactionId || undefined,
        customerEmail: metadata.customerEmail || undefined,
        activatedAt: new Date(),
        lastWebhookAt: new Date(),
        metadata: metadata.raw || { source: metadata.source || "manual" },
      },
      create: {
        organizationId,
        packageCode,
        status: "ACTIVE",
        wixOrderId: metadata.wixOrderId || undefined,
        wixTransactionId: metadata.wixTransactionId || undefined,
        customerEmail: metadata.customerEmail || undefined,
        activatedAt: new Date(),
        lastWebhookAt: new Date(),
        metadata: metadata.raw || { source: metadata.source || "manual" },
      },
    });

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    return { entitlement, organization };
  },

  async activatePackageForEmail(
    emailRaw: string,
    packageCode: ByokPackageCode,
    metadata: {
      wixOrderId?: string | null;
      wixTransactionId?: string | null;
      source?: string;
      raw?: any;
    },
  ) {
    const email = emailRaw.trim().toLowerCase();
    if (!email) throw new Error("Customer email is required.");

    const byokProfile = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        organization: { provisioningSource: "BYOK" },
      },
      include: { organization: true },
      orderBy: [{ createdAt: "asc" }],
    });
    if (!byokProfile?.organizationId) {
      throw new Error("BYOK organization not found for email.");
    }

    return this.activatePackageForOrganization(byokProfile.organizationId, packageCode, {
      customerEmail: email,
      wixOrderId: metadata.wixOrderId,
      wixTransactionId: metadata.wixTransactionId,
      source: metadata.source,
      raw: metadata.raw,
    });
  },

  async resetTrialForOrganization(
    organizationId: string,
    metadata?: {
      by?: string;
      reason?: string;
    },
  ) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { users: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    if (!org || org.provisioningSource !== "BYOK") {
      throw new Error("BYOK organization not found.");
    }

    const primaryUser = org.users[0] || null;
    const trialDays = BYOK_PACKAGE_CONFIG.BYOK_TRIAL.trialDays || 14;
    const trialEndsAt = new Date(Date.now() + trialDays * DAILY_USAGE_DAY_MS);
    await applyPackageToOrganization(org.id, "BYOK_TRIAL", { trialEndsAt });

    const entitlement = await prisma.organizationEntitlement.upsert({
      where: { organizationId: org.id },
      update: {
        packageCode: "BYOK_TRIAL",
        status: "ACTIVE",
        customerEmail: primaryUser?.email || undefined,
        activatedAt: new Date(),
        expiresAt: trialEndsAt,
        lastWebhookAt: new Date(),
        metadata: {
          source: "superadmin_reset_trial",
          by: metadata?.by || "superadmin",
          reason: metadata?.reason || "manual_reset",
        },
      },
      create: {
        organizationId: org.id,
        packageCode: "BYOK_TRIAL",
        status: "ACTIVE",
        customerEmail: primaryUser?.email || undefined,
        activatedAt: new Date(),
        expiresAt: trialEndsAt,
        lastWebhookAt: new Date(),
        metadata: {
          source: "superadmin_reset_trial",
          by: metadata?.by || "superadmin",
          reason: metadata?.reason || "manual_reset",
        },
      },
    });

    return {
      organizationId: org.id,
      packageCode: "BYOK_TRIAL" as const,
      trialEndsAt: trialEndsAt.toISOString(),
      entitlementId: entitlement.id,
    };
  },

  async resetTrialForEmail(
    emailRaw: string,
    metadata?: {
      by?: string;
      reason?: string;
    },
  ) {
    const email = emailRaw.trim().toLowerCase();
    if (!email) {
      throw new Error("Email is required.");
    }
    const profile = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        organization: { provisioningSource: "BYOK" },
      },
      orderBy: [{ createdAt: "asc" }],
    });
    if (!profile?.organizationId) {
      throw new Error("BYOK organization not found for email.");
    }
    return this.resetTrialForOrganization(profile.organizationId, metadata);
  },

  async reconcileOrganization(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        entitlement: true,
      },
    });
    if (!org || org.provisioningSource !== "BYOK") {
      throw new Error("BYOK organization not found.");
    }

    const entitlementCode = toByokPackageCode(org.entitlement?.packageCode || null);
    const orgCode = toByokPackageCode(org.entitlementCode || null);
    const expectedPackageCode = entitlementCode || orgCode || "BYOK_TRIAL";
    const config = BYOK_PACKAGE_CONFIG[expectedPackageCode];

    const mismatches: string[] = [];
    if (org.entitlementCode !== expectedPackageCode) mismatches.push("organization.entitlementCode");
    if (org.routingDomain !== config.routingDomain) mismatches.push("organization.routingDomain");
    if (org.adminPanelLocked !== config.adminPanelLocked) mismatches.push("organization.adminPanelLocked");
    if ((org.renderDailyLimit ?? null) !== (config.renderDailyLimit ?? null)) {
      mismatches.push("organization.renderDailyLimit");
    }
    if ((org.storageRetentionDays ?? null) !== (config.storageRetentionDays ?? null)) {
      mismatches.push("organization.storageRetentionDays");
    }
    if (org.maxUsers !== config.maxUsers) mismatches.push("organization.maxUsers");
    if (org.maxProjectsTotal !== config.maxProjectsTotal) mismatches.push("organization.maxProjectsTotal");
    if (org.maxStorageMb !== config.maxStorageMb) mismatches.push("organization.maxStorageMb");
    if ((org.entitlement?.status || "ACTIVE") !== "ACTIVE") mismatches.push("entitlement.status");
    if (org.entitlement?.packageCode !== expectedPackageCode) mismatches.push("entitlement.packageCode");

    if (mismatches.length === 0) {
      return {
        organizationId: org.id,
        packageCode: expectedPackageCode,
        repaired: false,
        mismatches,
      };
    }

    await applyPackageToOrganization(org.id, expectedPackageCode);
    await prisma.organizationEntitlement.upsert({
      where: { organizationId: org.id },
      update: {
        packageCode: expectedPackageCode,
        status: "ACTIVE",
        metadata: {
          source: "superadmin_reconcile",
          reconciledAt: new Date().toISOString(),
        },
      },
      create: {
        organizationId: org.id,
        packageCode: expectedPackageCode,
        status: "ACTIVE",
        metadata: {
          source: "superadmin_reconcile",
          reconciledAt: new Date().toISOString(),
        },
      },
    });

    return {
      organizationId: org.id,
      packageCode: expectedPackageCode,
      repaired: true,
      mismatches,
    };
  },
};
