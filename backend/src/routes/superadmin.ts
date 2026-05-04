import express from "express";
import { dbService, prisma } from "../services/database";
import { AuthService } from "../services/auth";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from "../middleware/auth";
import { encryptionUtils } from "../utils/encryption";
import { upload } from "../utils/fileUpload";
import { uploadManagedBuffer } from "../utils/managedStorage";
import { PRICE_KEYS } from "../config/pricing";

const router = express.Router();

const toNonNegativeInt = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
};

const toPositiveInt = (value: any) => {
  const n = toNonNegativeInt(value);
  if (n === null || n < 1) return null;
  return n;
};

const getAllocatedProjectQuota = async (orgId: string, excludeUserId?: string) => {
  const allocation = await prisma.user.aggregate({
    where: {
      organizationId: orgId,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    _sum: { maxProjects: true },
  });
  return allocation._sum.maxProjects || 0;
};

const parseBoolean = (value: any) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
};

const sanitizePricingUpdate = (payload: any) => {
  const updates: Record<string, number | boolean | string> = {};
  for (const key of PRICE_KEYS) {
    if (payload?.[key] === undefined) continue;
    const parsed = toNonNegativeInt(payload[key]);
    if (parsed === null) {
      throw new Error(`INVALID_PRICING_VALUE:${key}`);
    }
    updates[key] = parsed;
  }

  if (payload?.featureVideoEditorForAll !== undefined) {
    const enabled = parseBoolean(payload.featureVideoEditorForAll);
    if (enabled === null) {
      throw new Error("INVALID_PRICING_VALUE:featureVideoEditorForAll");
    }
    updates.featureVideoEditorForAll = enabled;
  }

  if (payload?.welcomeVideoUrl !== undefined) {
    if (payload.welcomeVideoUrl === null || payload.welcomeVideoUrl === "") {
      updates.welcomeVideoUrl = "";
    } else if (typeof payload.welcomeVideoUrl === "string") {
      const trimmed = payload.welcomeVideoUrl.trim();
      if (trimmed && !/^https?:\/\//i.test(trimmed)) {
        throw new Error("INVALID_PRICING_VALUE:welcomeVideoUrl");
      }
      updates.welcomeVideoUrl = trimmed;
    } else {
      throw new Error("INVALID_PRICING_VALUE:welcomeVideoUrl");
    }
  }

  return updates;
};

// Debug Logger
router.use((req, res, next) => {
  console.log(`SuperAdmin Router Hit: ${req.method} ${req.url}`);
  next();
});

// Apply middleware to all routes in this router
router.use(authenticateToken);
router.use(requireSuperAdmin);

// === TENANT MANAGEMENT ===

// Get all organizations
router.get("/organizations", async (req: AuthenticatedRequest, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, organizations: orgs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new Tenant (Organization + Admin User)
router.post("/organizations/tenant", async (req: AuthenticatedRequest, res) => {
  const {
    orgName,
    adminEmail,
    adminPassword,
    adminName,
    maxUsers,
    maxProjectsTotal,
    maxStorageMb,
    view,
    tenantPlan,
    trialDays,
  } = req.body;

  if (!orgName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const userView = view === "PICDRIFT" ? "PICDRIFT" : "VISIONLIGHT";

  try {
    const parsedMaxUsers =
      maxUsers !== undefined ? toPositiveInt(maxUsers) : undefined;
    const parsedMaxProjectsTotal =
      maxProjectsTotal !== undefined ? toPositiveInt(maxProjectsTotal) : undefined;
    const parsedMaxStorageMb = toNonNegativeInt(maxStorageMb);
    const parsedTrialDays = trialDays !== undefined ? toPositiveInt(trialDays) : 14;
    const normalizedTenantPlan = tenantPlan === "DEMO" ? "DEMO" : "PAID";

    if (
      (maxUsers !== undefined && parsedMaxUsers === null) ||
      (maxProjectsTotal !== undefined && parsedMaxProjectsTotal === null) ||
      (maxStorageMb !== undefined && parsedMaxStorageMb === null) ||
      (trialDays !== undefined && parsedTrialDays === null)
    ) {
      return res.status(400).json({ error: "Invalid tenant limits." });
    }

    // 1. Create Organization
    const org = await dbService.createOrganization({
      name: orgName,
      maxUsers: parsedMaxUsers ?? 5,
      maxProjectsTotal: parsedMaxProjectsTotal ?? 20,
      maxStorageMb: parsedMaxStorageMb ?? 500,
      tenantPlan: normalizedTenantPlan,
      trialEndsAt:
        normalizedTenantPlan === "DEMO"
          ? new Date(Date.now() + (parsedTrialDays ?? 14) * 24 * 60 * 60 * 1000)
          : null,
      isDefault: false
    });
    const initialAdminMaxProjects = Math.max(1, Math.min(3, org.maxProjectsTotal));
    const existingProfiles = await dbService.findUsersByEmail(adminEmail);
    if (
      AuthService.isSuperAdminEmail(adminEmail) ||
      existingProfiles.some((profile: any) => profile.role === "SUPERADMIN")
    ) {
      throw new Error("Cannot create a tenant profile for a System SuperAdmin email.");
    }

    // Existing emails now get a new internal profile for this tenant. Their
    // previous projects/assets stay attached to their original profile.
    const adminUser = await AuthService.createSystemUser(
      adminEmail,
      adminPassword,
      adminName || `${orgName} Admin`,
      userView,
      initialAdminMaxProjects,
      org.id,
      "ADMIN"
    );

    await dbService.adminUpdateUser(adminUser.id, {
      creditsPicDrift: 0,
      creditsPicDriftPlus: 0,
      creditsImageFX: 0,
      creditsVideoFX1: 0,
      creditsVideoFX2: 0,
      creditsVideoFX3: 0,
      creditSystem: "INTERNAL",
      isDemo: false,
    });
    res.json({ success: true, organization: org, adminUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test route to verify mounting
router.get("/test", (req, res) => res.json({ success: true, message: "SuperAdmin Router Active" }));

// Delete Organization
router.delete("/organizations/:id", async (req: AuthenticatedRequest, res) => {
  try {
    console.log(`Deep delete request for organization: ${req.params.id}`);
    
    // 1. Check if it's the default org (cannot delete)
    const org = await dbService.getOrganization(req.params.id);
    if (org?.isDefault) {
      return res.status(400).json({ error: "Cannot delete the default system organization." });
    }

    // 2. Fetch all users in this org to wipe them from Supabase
    const usersInOrg = await prisma.user.findMany({ where: { organizationId: req.params.id } });
    
    for (const u of usersInOrg) {
      try {
        const deletedAuthUser = await AuthService.deleteSupabaseUserByEmail(u.email, {
          deletingOrganizationId: req.params.id,
        });
        console.log(
          deletedAuthUser
            ? `Wiped ${u.email} from Supabase Auth`
            : `Kept Supabase Auth for ${u.email}; another profile still exists`,
        );
      } catch (e) {
        console.error(`Failed to wipe ${u.email} from Supabase:`, e);
      }
    }

    // 3. Delete all local records
    await prisma.user.deleteMany({ where: { organizationId: req.params.id } });
    await prisma.organization.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: "Organization and all associated users fully purged." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Organization Status (Active/Inactive)
router.put("/organizations/:id/status", async (req: AuthenticatedRequest, res) => {
  const { isActive } = req.body;
  try {
    const org = await dbService.updateOrganizationStatus(req.params.id, !!isActive);
    res.json({ success: true, organization: org });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Organization Config/Limits
router.put("/organizations/:id/limits", async (req: AuthenticatedRequest, res) => {
  const { maxUsers, maxProjectsTotal, maxStorageMb, name, view } = req.body;
  try {
    const parsedMaxUsers = maxUsers !== undefined ? toPositiveInt(maxUsers) : undefined;
    const parsedMaxProjectsTotal = maxProjectsTotal !== undefined ? toPositiveInt(maxProjectsTotal) : undefined;
    const parsedMaxStorageMb = maxStorageMb !== undefined ? toNonNegativeInt(maxStorageMb) : undefined;

    if (
      (maxUsers !== undefined && parsedMaxUsers === null) ||
      (maxProjectsTotal !== undefined && parsedMaxProjectsTotal === null) ||
      (maxStorageMb !== undefined && parsedMaxStorageMb === null)
    ) {
      return res.status(400).json({ error: "Invalid organization limit values." });
    }

    if (parsedMaxUsers !== undefined && parsedMaxUsers !== null) {
      const userCount = await prisma.user.count({ where: { organizationId: req.params.id } });
      if (parsedMaxUsers < userCount) {
        return res.status(400).json({
          error: `Cannot set maxUsers below current user count (${userCount}).`,
        });
      }
    }

    if (parsedMaxProjectsTotal !== undefined && parsedMaxProjectsTotal !== null) {
      const allocated = await getAllocatedProjectQuota(req.params.id);
      if (parsedMaxProjectsTotal < allocated) {
        return res.status(400).json({
          error: `Cannot set maxProjectsTotal below current allocated quota (${allocated}).`,
        });
      }
    }

    const orgUpdates: any = {
      maxUsers: parsedMaxUsers,
      maxProjectsTotal: parsedMaxProjectsTotal,
      maxStorageMb: parsedMaxStorageMb,
    };
    if (name) orgUpdates.name = name;

    const org = await dbService.updateOrganization(req.params.id, orgUpdates);

    if (view) {
      await prisma.user.updateMany({
        where: { organizationId: req.params.id },
        data: { view }
      });
    }

    res.json({ success: true, organization: org });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === USER PROVISIONING ===

// Get all users (SuperAdmin sees everyone)
router.get("/users", async (req: AuthenticatedRequest, res) => {
  try {
    const users = await dbService.getAllUsers();
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update User (Basic Info / Role / View)
router.put("/users/:userId", async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  const { name, role, view, maxProjects, password } = req.body;

  try {
    const parsedMaxProjects =
      maxProjects !== undefined ? toPositiveInt(maxProjects) : undefined;
    if (maxProjects !== undefined && parsedMaxProjects === null) {
      return res.status(400).json({ error: "Invalid maxProjects value." });
    }

    const targetUser = await dbService.findUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    if (
      parsedMaxProjects !== undefined &&
      parsedMaxProjects !== null &&
      targetUser.organizationId
    ) {
      const org = await dbService.getOrganization(targetUser.organizationId);
      if (org) {
        const allocatedWithoutTarget = await getAllocatedProjectQuota(org.id, targetUser.id);
        const remaining = Math.max(0, org.maxProjectsTotal - allocatedWithoutTarget);
        if (parsedMaxProjects > remaining) {
          return res.status(400).json({
            error: `Project quota exceeded for organization. Remaining allocatable projects: ${remaining}.`,
          });
        }
      }
    }

    const updates: any = {};
    if (name) updates.name = name;
    if (role) updates.role = role;
    if (view) updates.view = view;
    if (parsedMaxProjects !== undefined) updates.maxProjects = parsedMaxProjects;

    if (password !== undefined) {
      if (typeof password !== "string" || password.trim().length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      await AuthService.updateSupabaseUserPassword(targetUser.email, password.trim());
    }

    const updatedUser = await dbService.adminUpdateUser(userId, updates);
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a Demo User (locked to Picdrift view and Default Org)
router.post("/users/demo", async (req: AuthenticatedRequest, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const defaultOrg = await dbService.getDefaultOrganization();
    
    // Create in Supabase and DB
    const user = await AuthService.createSystemUser(
      email,
      password,
      name || "Demo User",
      "PICDRIFT",
      1, // Demo users get 1 project
      defaultOrg?.id, // Assign to default org if exists
      "USER",
      true
    );

    // Explicitly set demo credits (as per vision: 5 Picdrift, 15 PicFX)
    await dbService.adminUpdateUser(user.id, {
      creditsPicDrift: 5,
      creditsPicDriftPlus: 0,
      creditsImageFX: 15,
      creditsVideoFX1: 0,
      creditsVideoFX2: 0,
      creditsVideoFX3: 0,
      creditSystem: "INTERNAL"
    });

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create/Promote another SuperAdmin
router.post("/users/superadmin", async (req: AuthenticatedRequest, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const defaultOrg = await dbService.getDefaultOrganization();
    
    const user = await AuthService.createSystemUser(
      email,
      password,
      name || "System Administrator",
      "VISIONLIGHT",
      10, 
      defaultOrg?.id,
      "SUPERADMIN"
    );

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === CREDIT REQUESTS (GLOBAL INBOX) ===
router.get("/requests", async (req: AuthenticatedRequest, res) => {
  try {
    const requests = await dbService.getPendingCreditRequests();
    res.json({ success: true, requests });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/requests/:id/resolve", async (req: AuthenticatedRequest, res) => {
  try {
    const request = await dbService.resolveCreditRequest(req.params.id);
    res.json({ success: true, request });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === GLOBAL CONTROLS ===

// Preset Prompts CRUD
router.get("/presets", async (req, res) => {
  try {
    const presets = await prisma.presetPrompt.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, presets });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/presets", async (req, res) => {
  const { name, prompt, isActive } = req.body;
  if (!name || !prompt) {
    return res.status(400).json({ error: "Name and Prompt are required." });
  }
  try {
    const preset = await prisma.presetPrompt.create({
      data: { name, prompt, isActive: isActive !== undefined ? !!isActive : true },
    });
    res.json({ success: true, preset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/presets/:id", async (req, res) => {
  const { name, prompt, isActive } = req.body;
  try {
    const preset = await prisma.presetPrompt.update({
      where: { id: req.params.id },
      data: { 
        name, 
        prompt, 
        isActive: isActive !== undefined ? !!isActive : undefined 
      },
    });
    res.json({ success: true, preset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/presets/:id", async (req, res) => {
  try {
    await prisma.presetPrompt.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Global Pricing Template
router.get("/settings/global", async (req, res) => {
  try {
    const settings = await dbService.getGlobalSettings();
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Global Pricing Template
router.put("/settings/global", async (req, res) => {
  try {
    const updates = sanitizePricingUpdate(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid pricing keys provided." });
    }

    const settings = await dbService.updateGlobalSettings(updates);
    res.json({ success: true, settings });
  } catch (error: any) {
    if (typeof error?.message === "string" && error.message.startsWith("INVALID_PRICING_VALUE:")) {
      const key = error.message.split(":")[1] || "unknown";
      return res.status(400).json({ error: `Invalid pricing value for ${key}` });
    }
    res.status(500).json({ error: error.message });
  }
});

router.post("/settings/welcome-video/upload", upload.single("video"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Welcome video file is required." });
    if (!file.mimetype.startsWith("video/")) {
      return res.status(400).json({ error: "Welcome media must be a video file." });
    }

    const welcomeVideoUrl = await uploadManagedBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      keyPrefix: "visionlight/system/welcome-videos",
      fallbackExtension: "mp4",
    });
    const settings = await dbService.updateGlobalSettings({ welcomeVideoUrl });
    res.json({ success: true, welcomeVideoUrl, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
