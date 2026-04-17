import express from "express";
import { dbService, prisma } from "../services/database";
import { AuthService } from "../services/auth";
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

// Apply middleware
router.use(authenticateToken);
router.use(requireAdmin);

// Helper to get current org and check permissions
const getOrg = async (req: AuthenticatedRequest) => {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new Error("No organization associated with this account.");
  const org = await dbService.getOrganization(orgId);
  if (!org) throw new Error("Organization not found.");
  return org;
};

// === TEAM MANAGEMENT ===

// Get all team members
router.get("/team", async (req: AuthenticatedRequest, res) => {
  try {
    const orgId = req.user!.organizationId;
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add a team member
router.post("/team/user", async (req: AuthenticatedRequest, res) => {
  const { email, password, name, role, maxProjects, view } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const org = await getOrg(req);
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

    // 2. Create User
    // Security: Tenants can only create USER or MANAGER roles.
    const finalRole = (role === "MANAGER") ? "MANAGER" : "USER";

    // Enforce View Inheritance
    const requestingUser = await dbService.findUserById(req.user!.id);
    const finalView = (requestingUser?.view === "PICDRIFT") ? "PICDRIFT" : (view || "VISIONLIGHT");

    const newUser = await AuthService.createSystemUser(
      email,
      password,
      name || "Team Member",
      finalView,
      Math.max(1, parsedMaxProjects),
      org.id,
      finalRole
    );
    res.json({ success: true, user: newUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update team member (Credits, Role, Limits)
router.put("/team/user/:userId", async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;
  const { addCredits, creditType, role, maxProjects, name } = req.body;

  try {
    const orgId = req.user!.organizationId;
    
    // Ensure the target user belongs to the same org
    const targetUser = await dbService.findUserById(userId);
    if (!targetUser || targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: "Access denied: User belongs to another organization." });
    }

    // Prepare updates
    const updates: any = {};
    if (name) updates.name = name;
    if (maxProjects !== undefined) {
      const parsedMaxProjects = toNonNegativeInt(maxProjects);
      if (parsedMaxProjects === null) {
        return res.status(400).json({ error: "Invalid maxProjects value." });
      }
      updates.maxProjects = Math.max(1, parsedMaxProjects);
    }
    if (role === "USER" || role === "MANAGER") updates.role = role;

    // Handle credits
    if (addCredits !== undefined && creditType) {
      updates.addCredits = addCredits;
      updates.creditType = creditType;
    }

    const updatedUser = await dbService.adminUpdateUser(userId, updates);
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
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

    await AuthService.deleteSupabaseUserByEmail(targetUser.email);
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
    
    // Decrypt keys for the admin to see/edit
    res.json({
      success: true,
      config: {
        id: org.id,
        name: org.name,
        isActive: org.isActive,
        falApiKey: encryptionUtils.decrypt(org.falApiKey),
        kieApiKey: encryptionUtils.decrypt(org.kieApiKey),
        openaiApiKey: encryptionUtils.decrypt(org.openaiApiKey),
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
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Organization Config (API Keys & Pricing Overrides)
router.put("/config", async (req: AuthenticatedRequest, res) => {
  const { falApiKey, kieApiKey, openaiApiKey, name, pricing } = req.body;
  try {
    const orgId = req.user!.organizationId!;
    
    const updates: any = {
      name: name || undefined,
      falApiKey: falApiKey ? encryptionUtils.encrypt(falApiKey) : undefined,
      kieApiKey: kieApiKey ? encryptionUtils.encrypt(kieApiKey) : undefined,
      openaiApiKey: openaiApiKey ? encryptionUtils.encrypt(openaiApiKey) : undefined,
    };

    // Apply pricing overrides if provided
    if (pricing) {
      Object.assign(updates, sanitizePricingUpdate(pricing));
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




