import express from "express";
import axios from "axios";
import { dbService, prisma } from "../services/database";
import { AuthService } from "../services/auth";
import { storageQuotaService } from "../services/storageQuota";
import { authenticateToken, requireAdmin, AuthenticatedRequest } from "../middleware/auth";
import { encryptionUtils } from "../utils/encryption";
import { PRICE_KEYS } from "../config/pricing";

const router = express.Router();

const toNonNegativeInt = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
};

const sanitizePricingUpdate = (pricing: any) => {
  const updates: Record<string, number> = {};
  for (const key of PRICE_KEYS) {
    if (pricing?.[key] === undefined) continue;
    const parsed = toNonNegativeInt(pricing[key]);
    if (parsed === null) {
      throw new Error(`INVALID_PRICING_VALUE:${key}`);
    }
    updates[key] = parsed;
  }
  return updates;
};

const VIDEO_FX_PRICE_KEYS = new Set([
  "priceVideoFX1_10s",
  "priceVideoFX1_15s",
  "priceVideoFX2_4s",
  "priceVideoFX2_8s",
  "priceVideoFX2_12s",
  "priceVideoFX3_4s",
  "priceVideoFX3_6s",
  "priceVideoFX3_8s",
]);

const PICDRIFT_PRICING_DISALLOWED_KEYS = new Set([
  "pricePicDrift_Plus_5s",
  "pricePicDrift_Plus_10s",
  ...Array.from(VIDEO_FX_PRICE_KEYS),
]);

const PICDRIFT_ALLOWED_CREDIT_POOLS = new Set([
  "creditsPicDrift",
  "creditsImageFX",
]);

const USER_STORAGE_FIELDS = [
  "maxStorageMb",
  "maxStorageGb",
  "storageLimitMb",
  "storageLimitGb",
  "storageMb",
  "storageGb",
];

const hasUserStoragePayload = (payload: any) =>
  USER_STORAGE_FIELDS.some((field) => payload?.[field] !== undefined);

const normalizeView = (raw: unknown): "PICDRIFT" | "VISIONLIGHT" =>
  raw === "PICDRIFT" ? "PICDRIFT" : "VISIONLIGHT";

const mapProviderCosts = (settings: any) => ({
  picdrift_5s: Number(settings?.costPicDrift_5s || 0),
  picdrift_10s: Number(settings?.costPicDrift_10s || 0),
  picdrift_plus_5s: Number(settings?.costPicDrift_Plus_5s || 0),
  picdrift_plus_10s: Number(settings?.costPicDrift_Plus_10s || 0),
  picfx_standard: Number(settings?.costPicFX_Standard || 0),
  picfx_carousel: Number(settings?.costPicFX_Carousel || 0),
  picfx_batch: Number(settings?.costPicFX_Batch || 0),
  editor_pro: Number(settings?.costEditor_Pro || 0),
  editor_enhance: Number(settings?.costEditor_Enhance || 0),
  editor_convert: Number(settings?.costEditor_Convert || 0),
  asset_drift_path: Number(settings?.costAsset_DriftPath || 0),
  topaz_upscale_2x: Number(settings?.costVideoFX1_10s || 0),
  topaz_upscale_4x: Number(settings?.costVideoFX1_15s || 0),
  seedance_fal_4s: Number(settings?.costVideoFX2_4s || 0),
  seedance_fal_8s: Number(settings?.costVideoFX2_8s || 0),
  seedance_fal_12s: Number(settings?.costVideoFX2_12s || 0),
  veo3_4s: Number(settings?.costVideoFX3_4s || 0),
  veo3_6s: Number(settings?.costVideoFX3_6s || 0),
  veo3_8s: Number(settings?.costVideoFX3_8s || 0),
});

type ProviderBalanceStatus =
  | "ok"
  | "missing_key"
  | "insufficient_scope"
  | "not_applicable"
  | "error";

const getErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error ||
  error?.response?.data?.msg ||
  error?.message ||
  fallback;

const fetchFalBalance = async (falApiKey: string | null) => {
  if (!falApiKey) {
    return {
      status: "missing_key" as ProviderBalanceStatus,
      message: "Fal key is not configured.",
    };
  }

  try {
    const response = await axios.get("https://api.fal.ai/v1/account/billing", {
      headers: { Authorization: `Key ${falApiKey}` },
      params: { expand: "credits" },
      timeout: 15000,
    });
    const balance = Number(response.data?.credits?.current_balance);
    const currency = response.data?.credits?.currency || "USD";
    if (!Number.isFinite(balance)) {
      return {
        status: "error" as ProviderBalanceStatus,
        message: "Unexpected Fal billing response.",
      };
    }
    return {
      status: "ok" as ProviderBalanceStatus,
      balance,
      currency,
    };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return {
        status: "insufficient_scope" as ProviderBalanceStatus,
        message:
          "Fal balance unavailable for this key scope. Use an admin/billing-capable key.",
      };
    }
    return {
      status: "error" as ProviderBalanceStatus,
      message: getErrorMessage(error, "Failed to fetch Fal balance."),
    };
  }
};

const fetchKieBalance = async (kieApiKey: string | null) => {
  if (!kieApiKey) {
    return {
      status: "not_applicable" as ProviderBalanceStatus,
      message: "KIE is not required for dashboard activation.",
    };
  }

  try {
    const response = await axios.get("https://api.kie.ai/api/v1/chat/credit", {
      headers: { Authorization: `Bearer ${kieApiKey}` },
      timeout: 15000,
    });
    const code = Number(response.data?.code);
    const credits = Number(response.data?.data);
    if (code === 200 && Number.isFinite(credits)) {
      return {
        status: "ok" as ProviderBalanceStatus,
        credits,
      };
    }
    return {
      status: "error" as ProviderBalanceStatus,
      message:
        response.data?.msg || "Unexpected KIE credit response.",
    };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return {
        status: "error" as ProviderBalanceStatus,
        message: "KIE key is invalid or unauthorized.",
      };
    }
    if (status === 402) {
      return {
        status: "ok" as ProviderBalanceStatus,
        credits: 0,
      };
    }
    return {
      status: "error" as ProviderBalanceStatus,
      message: getErrorMessage(error, "Failed to fetch KIE balance."),
    };
  }
};

// Apply middleware
router.use(authenticateToken);
router.use(requireAdmin);
router.use(async (req: AuthenticatedRequest, res, next) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next();
    const org = await dbService.getOrganization(orgId);
    if (org?.adminPanelLocked === true) {
      return res.status(403).json({
        error: "Admin panel is locked for this package.",
        code: "ADMIN_PANEL_LOCKED",
      });
    }
    return next();
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "Failed to validate tenant access.",
    });
  }
});

// Helper to get current org and check permissions
const getOrg = async (req: AuthenticatedRequest) => {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new Error("No organization associated with this account.");
  const org = await dbService.getOrganization(orgId);
  if (!org) throw new Error("Organization not found.");
  return org;
};

const getAllocatedProjectQuota = async (orgId: string, excludeUserId?: string) => {
  const allocation = await prisma.user.aggregate({
    where: {
      organizationId: orgId,
      // SuperAdmins have unlimited projects, so their per-user maxProjects must
      // not consume the org's allocatable pool. Tenant orgs have no SUPERADMIN,
      // so this only affects the default org.
      role: { not: "SUPERADMIN" },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    _sum: { maxProjects: true },
  });
  return allocation._sum.maxProjects || 0;
};

const ensureProjectQuotaAllocation = async (
  orgId: string,
  orgMaxProjectsTotal: number,
  requestedUserMaxProjects: number,
  excludeUserId?: string,
) => {
  const allocatedWithoutTarget = await getAllocatedProjectQuota(orgId, excludeUserId);
  const remaining = Math.max(0, orgMaxProjectsTotal - allocatedWithoutTarget);
  if (requestedUserMaxProjects > remaining) {
    throw new Error(`ORG_PROJECT_ALLOCATION_EXCEEDED:${remaining}`);
  }
};

const countOrganizationAdmins = async (orgId: string, excludeUserId?: string) => {
  return prisma.user.count({
    where: {
      organizationId: orgId,
      role: { in: ["ADMIN", "SUPERADMIN"] },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
};

const ADMIN_ROLES = new Set(["ADMIN", "SUPERADMIN"]);

// === TEAM MANAGEMENT ===

// Get all team members
router.get("/team", async (req: AuthenticatedRequest, res) => {
  try {
    const orgId = req.user!.organizationId;
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    const ownerUser = orgId
      ? await dbService.getOrganizationOwnerUser(orgId)
      : null;
    const ownerUserId = ownerUser?.id || null;
    const usersWithProtection = users.map((user) => {
      const isSuperAdmin = user.role === "SUPERADMIN";
      const isTenantOwner = ownerUserId === user.id;
      const protectionReason = isSuperAdmin
        ? "SUPERADMIN"
        : isTenantOwner
          ? "TENANT_OWNER"
          : null;
      return {
        ...user,
        isProtectedFromRemoval: !!protectionReason,
        protectionReason,
      };
    });

    res.json({
      success: true,
      users: usersWithProtection,
      ownerUserId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/team/email-status", async (req: AuthenticatedRequest, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const org = await getOrg(req);
    const status = await AuthService.getProvisioningEmailStatus(email, org.id);
    res.json({ success: true, ...status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add a team member
router.post("/team/user", async (req: AuthenticatedRequest, res) => {
  const { email, password, name, role, maxProjects, view } = req.body;
  
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    if (hasUserStoragePayload(req.body)) {
      return res.status(400).json({
        error:
          "Storage quota is organization-wide. Update tenant storage from platform limits, not per user.",
      });
    }

    const org = await getOrg(req);
    const emailStatus = await AuthService.getProvisioningEmailStatus(email, org.id);
    if (emailStatus.existingProfileInOrganization) {
      return res.status(409).json({
        error: "This email is already a member of your organization.",
      });
    }
    if (!emailStatus.authExists) {
      if (typeof password !== "string" || password.trim().length < 6) {
        return res.status(400).json({
          error: "Password must be at least 6 characters for a new login.",
        });
      }
    }

    const parsedMaxProjects =
      maxProjects !== undefined ? toNonNegativeInt(maxProjects) : 3;
    if (parsedMaxProjects === null) {
      return res.status(400).json({ error: "Invalid maxProjects value." });
    }

    // 1. Enforce maxUsers limit
    const userCount = await prisma.user.count({ where: { organizationId: org.id } });
    if (userCount >= org.maxUsers) {
      return res.status(403).json({ error: `User limit reached (${org.maxUsers}). Please contact support to upgrade.` });
    }

    const requestedMaxProjects = Math.max(1, parsedMaxProjects);
    await ensureProjectQuotaAllocation(
      org.id,
      org.maxProjectsTotal,
      requestedMaxProjects,
    );

    // 2. Create User
    // Security: Tenants can only create USER or MANAGER roles.
    const finalRole = (role === "MANAGER") ? "MANAGER" : "USER";

    // Enforce strict tenant-view inheritance for tenant admins.
    // Superadmins (while operating inside their org) can choose either view.
    const requestingUser = await dbService.findUserById(req.user!.id);
    const isSuperAdminRequester = requestingUser?.role === "SUPERADMIN";
    const canChooseMemberView = isSuperAdminRequester || org.isDefault === true;
    const finalView = canChooseMemberView
      ? normalizeView(view)
      : normalizeView(requestingUser?.view);

    const newUser = await AuthService.createSystemUser(
      email,
      emailStatus.authExists ? "" : password,
      name || "Team Member",
      finalView,
      requestedMaxProjects,
      org.id,
      finalRole
    );
    res.json({ success: true, user: newUser });
  } catch (error: any) {
    if (
      typeof error?.message === "string" &&
      error.message.startsWith("ORG_PROJECT_ALLOCATION_EXCEEDED:")
    ) {
      const remainingRaw = Number(error.message.split(":")[1]);
      const remaining = Number.isFinite(remainingRaw) ? remainingRaw : 0;
      return res.status(403).json({
        error: `Project quota exceeded. Remaining allocatable projects in your organization: ${remaining}.`,
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update team member (Credits, Role, Limits)
router.put("/team/user/:userId", async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  const { addCredits, creditType, role, maxProjects, name, password, view } = req.body;

  try {
    if (hasUserStoragePayload(req.body)) {
      return res.status(400).json({
        error:
          "Storage quota is organization-wide. Update tenant storage from platform limits, not per user.",
      });
    }

    if (password !== undefined) {
      return res.status(400).json({
        error:
          "Admins cannot reset user passwords. Users must reset their own password from the login page.",
      });
    }

    const org = await getOrg(req);
    const orgId = org.id;
    
    // Ensure the target user belongs to the same org
    const targetUser = await dbService.findUserById(userId);
    if (!targetUser || targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: "Access denied: User belongs to another organization." });
    }
    const ownerUser = await dbService.getOrganizationOwnerUser(orgId);
    const isTargetOwner = ownerUser?.id === targetUser.id;

    // Prepare updates
    const updates: any = {};
    if (name) updates.name = name;
    if (maxProjects !== undefined) {
      const parsedMaxProjects = toNonNegativeInt(maxProjects);
      if (parsedMaxProjects === null) {
        return res.status(400).json({ error: "Invalid maxProjects value." });
      }
      const requestedMaxProjects = Math.max(1, parsedMaxProjects);
      await ensureProjectQuotaAllocation(
        org.id,
        org.maxProjectsTotal,
        requestedMaxProjects,
        targetUser.id,
      );
      updates.maxProjects = requestedMaxProjects;
    }
    if (role !== undefined) {
      const nextRole = String(role).toUpperCase();
      if (targetUser.role === "SUPERADMIN" && nextRole !== "SUPERADMIN") {
        return res.status(400).json({
          error: "SuperAdmin accounts are protected and cannot be downgraded.",
        });
      }
      if (isTargetOwner && !ADMIN_ROLES.has(nextRole)) {
        return res.status(400).json({
          error:
            "This tenant owner account is protected and cannot be downgraded.",
        });
      }
    }

    if (role === "USER" || role === "MANAGER") {
      const isTargetAdmin =
        targetUser.role === "ADMIN" || targetUser.role === "SUPERADMIN";
      if (isTargetAdmin) {
        const remainingAdminCount = await countOrganizationAdmins(orgId, targetUser.id);
        if (remainingAdminCount < 1) {
          return res.status(400).json({
            error:
              "You cannot remove the last admin from this organization. Add another admin first.",
          });
        }
      }
      updates.role = role;
    }
    if (org.isDefault === true && view !== undefined) {
      updates.view = normalizeView(view);
    }

    // Handle credits
    if (addCredits !== undefined && creditType) {
      const requestingUser = await dbService.findUserById(req.user!.id);
      const requesterView = normalizeView(requestingUser?.view);
      const isSuperAdminRequester = requestingUser?.role === "SUPERADMIN";
      const isPicdriftTenantRequester =
        !isSuperAdminRequester &&
        org.isDefault !== true &&
        requesterView === "PICDRIFT";
      const creditPool = String(creditType);

      if (
        isPicdriftTenantRequester &&
        !PICDRIFT_ALLOWED_CREDIT_POOLS.has(creditPool)
      ) {
        return res.status(403).json({
          error:
            "Credit pool is not available for PICDRIFT organizations.",
        });
      }

      updates.addCredits = addCredits;
      updates.creditType = creditPool;
    }

    const updatedUser = await dbService.adminUpdateUser(userId, updates);
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    if (
      typeof error?.message === "string" &&
      error.message.startsWith("ORG_PROJECT_ALLOCATION_EXCEEDED:")
    ) {
      const remainingRaw = Number(error.message.split(":")[1]);
      const remaining = Number.isFinite(remainingRaw) ? remainingRaw : 0;
      return res.status(403).json({
        error: `Project quota exceeded. Remaining allocatable projects in your organization: ${remaining}.`,
      });
    }
    if (error?.message === "INVALID_CREDIT_POOL" || error?.message === "INVALID_CREDIT_AMOUNT") {
      return res.status(400).json({ error: "Invalid credit update payload." });
    }
    if (error?.message === "CREDIT_UNDERFLOW") {
      return res.status(400).json({ error: "Credit amount cannot reduce balance below zero." });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete team member
router.delete("/team/user/:userId", async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  try {
    const orgId = req.user!.organizationId;
    const targetUser = await dbService.findUserById(userId);
    
    if (!targetUser || targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Cannot delete yourself
    if (targetUser.id === req.user!.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    if (targetUser.role === "SUPERADMIN") {
      return res.status(400).json({
        error: "SuperAdmin accounts are protected and cannot be removed.",
      });
    }

    const ownerUser = await dbService.getOrganizationOwnerUser(orgId!);
    if (ownerUser?.id === targetUser.id) {
      return res.status(400).json({
        error:
          "This tenant owner account is protected and cannot be removed.",
      });
    }

    const isTargetAdmin =
      targetUser.role === "ADMIN" || targetUser.role === "SUPERADMIN";
    if (isTargetAdmin) {
      const remainingAdminCount = await countOrganizationAdmins(orgId!, targetUser.id);
      if (remainingAdminCount < 1) {
        return res.status(400).json({
          error:
            "You cannot remove the last admin from this organization. Add another admin first.",
        });
      }
    }

    await AuthService.deleteSupabaseUserByEmail(targetUser.email, {
      deletingUserId: userId,
    });
    await dbService.deleteUser(userId);

    res.json({ success: true, message: "User removed from team." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === CREDIT REQUESTS (ORG INBOX) ===
router.get("/requests", async (req: AuthenticatedRequest, res) => {
  try {
    const org = await getOrg(req);
    const requests = await dbService.getPendingCreditRequestsByOrganization(org.id);
    res.json({ success: true, requests });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get live provider balances for this organization's configured keys
router.get("/provider-balances", async (req: AuthenticatedRequest, res) => {
  try {
    const org = await getOrg(req);
    const requestingUser = await dbService.findUserById(req.user!.id);
    const requesterView = normalizeView(requestingUser?.view);
    const isSuperAdminRequester = requestingUser?.role === "SUPERADMIN";
    const isPicdriftTenantRequester =
      !isSuperAdminRequester &&
      org.isDefault !== true &&
      requesterView === "PICDRIFT";
    const falApiKey = encryptionUtils.decrypt(org.falApiKey);
    const kieApiKey = isPicdriftTenantRequester
      ? null
      : encryptionUtils.decrypt(org.kieApiKey);

    const [fal, kie] = await Promise.all([
      fetchFalBalance(falApiKey),
      isPicdriftTenantRequester
        ? Promise.resolve({
            status: "not_applicable" as ProviderBalanceStatus,
            message: "KIE is not used for PICDRIFT organizations.",
          })
        : fetchKieBalance(kieApiKey),
    ]);

    res.json({
      success: true,
      checkedAt: new Date().toISOString(),
      balances: { fal, kie },
    });
  } catch (error: any) {
    if (error?.message === "No organization associated with this account.") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to fetch provider balances." });
  }
});

router.put("/requests/:id/resolve", async (req: AuthenticatedRequest, res) => {
  try {
    const org = await getOrg(req);
    const resolved = await dbService.resolveCreditRequestForOrganization(
      req.params.id,
      org.id,
    );

    if (!resolved) {
      return res.status(404).json({ error: "Credit request not found" });
    }

    res.json({ success: true, request: resolved });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === CONFIGURATION ===

// Get Organization Config (Keys & Pricing)
router.get("/config", async (req: AuthenticatedRequest, res) => {
  try {
    const org = await getOrg(req);
    const globalSettings = await dbService.getGlobalSettings();
    const requestingUser = await dbService.findUserById(req.user!.id);
    const storageSummary = await storageQuotaService.getOrganizationStorageSummary(
      org.id,
    );
    const requesterView = normalizeView(requestingUser?.view);
    const isSuperAdminRequester = requestingUser?.role === "SUPERADMIN";
    const canReadKieApiKey =
      isSuperAdminRequester || org.isDefault === true || requesterView !== "PICDRIFT";
    
    // Decrypt keys for the admin to see/edit
    res.json({
      success: true,
      config: {
        id: org.id,
        name: org.name,
        isActive: org.isActive,
        falApiKey: encryptionUtils.decrypt(org.falApiKey) || "",
        kieApiKey: canReadKieApiKey
          ? encryptionUtils.decrypt(org.kieApiKey) || ""
          : "",
        pricing: {
          pricePicDrift_5s: org.pricePicDrift_5s,
          pricePicDrift_10s: org.pricePicDrift_10s,
          pricePicDrift_Plus_5s: org.pricePicDrift_Plus_5s,
          pricePicDrift_Plus_10s: org.pricePicDrift_Plus_10s,
          pricePicFX_Standard: org.pricePicFX_Standard,
          pricePicFX_Carousel: org.pricePicFX_Carousel,
          pricePicFX_Batch: org.pricePicFX_Batch,
          priceEditor_Pro: org.priceEditor_Pro,
          priceEditor_Enhance: org.priceEditor_Enhance,
          priceEditor_Convert: org.priceEditor_Convert,
          priceAsset_DriftPath: org.priceAsset_DriftPath,
          priceVideoFX1_10s: org.priceVideoFX1_10s,
          priceVideoFX1_15s: org.priceVideoFX1_15s,
          priceVideoFX2_4s: org.priceVideoFX2_4s,
          priceVideoFX2_8s: org.priceVideoFX2_8s,
          priceVideoFX2_12s: org.priceVideoFX2_12s,
          priceVideoFX3_4s: org.priceVideoFX3_4s,
          priceVideoFX3_6s: org.priceVideoFX3_6s,
          priceVideoFX3_8s: org.priceVideoFX3_8s,
        },
        providerCosts: mapProviderCosts(globalSettings),
        storage: storageSummary,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Organization Config (API Keys & Pricing Overrides)
router.put("/config", async (req: AuthenticatedRequest, res) => {
  const { falApiKey, kieApiKey, name, pricing } = req.body;
  try {
    const org = await getOrg(req);
    const orgId = org.id;
    const requestingUser = await dbService.findUserById(req.user!.id);
    const requesterView = normalizeView(requestingUser?.view);
    const isSuperAdminRequester = requestingUser?.role === "SUPERADMIN";
    const isPicdriftTenantRequester =
      !isSuperAdminRequester &&
      org.isDefault !== true &&
      requesterView === "PICDRIFT";

    if (
      falApiKey !== undefined &&
      falApiKey !== null &&
      typeof falApiKey !== "string"
    ) {
      return res.status(400).json({ error: "Invalid Fal API key value." });
    }
    if (
      !isPicdriftTenantRequester &&
      kieApiKey !== undefined &&
      kieApiKey !== null &&
      typeof kieApiKey !== "string"
    ) {
      return res.status(400).json({ error: "Invalid KIE API key value." });
    }

    const updates: any = {
      name: name || undefined,
    };

    // Explicit key clearing support:
    // undefined => leave unchanged, ""/null => clear, non-empty string => encrypt and save.
    if (falApiKey !== undefined) {
      const trimmed = typeof falApiKey === "string" ? falApiKey.trim() : "";
      updates.falApiKey = trimmed ? encryptionUtils.encrypt(trimmed) : null;
    }
    if (!isPicdriftTenantRequester && kieApiKey !== undefined) {
      const trimmed = typeof kieApiKey === "string" ? kieApiKey.trim() : "";
      updates.kieApiKey = trimmed ? encryptionUtils.encrypt(trimmed) : null;
    }

    // Pricing is globally controlled by SuperAdmin. Tenant admins can edit keys/profile only.
    if (pricing && isSuperAdminRequester) {
      const sanitizedPricing = sanitizePricingUpdate(pricing);
      if (isPicdriftTenantRequester) {
        for (const key of PICDRIFT_PRICING_DISALLOWED_KEYS) {
          if (key in sanitizedPricing) {
            delete sanitizedPricing[key];
          }
        }
      }
      Object.assign(updates, sanitizedPricing);
    }

    await dbService.updateOrganization(orgId, updates);

    res.json({ success: true, message: "Configuration updated." });
  } catch (error: any) {
    if (typeof error?.message === "string" && error.message.startsWith("INVALID_PRICING_VALUE:")) {
      const key = error.message.split(":")[1] || "unknown";
      return res.status(400).json({ error: `Invalid pricing value for ${key}` });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;




