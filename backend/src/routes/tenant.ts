import express from "express";
import { dbService, prisma } from "../services/database";
import { AuthService } from "../services/auth";
import { authenticateToken, requireAdmin, AuthenticatedRequest } from "../middleware/auth";
import { encryptionUtils } from "../utils/encryption";

const router = express.Router();

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

    // 1. Enforce maxUsers limit
    const userCount = await prisma.user.count({ where: { organizationId: org.id } });
    if (userCount >= org.maxUsers) {
      return res.status(403).json({ error: `User limit reached (${org.maxUsers}). Please contact support to upgrade.` });
    }

    // 2. Create User
    // Security: Tenants can only create USER or MANAGER roles.
    const finalRole = (role === "MANAGER") ? "MANAGER" : "USER";
    
    const newUser = await AuthService.createSystemUser(
      email,
      password,
      name || "Team Member",
      view || "VISIONLIGHT", // Allow view selection, default to VISIONLIGHT
      maxProjects !== undefined ? Number(maxProjects) : 3,
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
    if (maxProjects !== undefined) updates.maxProjects = Number(maxProjects);
    if (role === "USER" || role === "MANAGER") updates.role = role;

    // Handle credits
    if (addCredits !== undefined && creditType) {
      updates.addCredits = addCredits;
      updates.creditType = creditType;
    }

    const updatedUser = await dbService.adminUpdateUser(userId, updates);
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
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
          pricePicFX_Standard: org.pricePicFX_Standard,
          // ... include other pricing fields if needed in the UI
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Organization Config (API Keys)
router.put("/config", async (req: AuthenticatedRequest, res) => {
  const { falApiKey, kieApiKey, openaiApiKey, name } = req.body;
  try {
    const orgId = req.user!.organizationId!;
    
    const updated = await dbService.updateOrganization(orgId, {
      name: name || undefined,
      falApiKey: falApiKey ? encryptionUtils.encrypt(falApiKey) : undefined,
      kieApiKey: kieApiKey ? encryptionUtils.encrypt(kieApiKey) : undefined,
      openaiApiKey: openaiApiKey ? encryptionUtils.encrypt(openaiApiKey) : undefined,
    });

    res.json({ success: true, message: "Configuration updated." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
