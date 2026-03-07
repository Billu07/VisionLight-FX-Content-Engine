import express from "express";
import { dbService, prisma } from "../services/database";
import { AuthService } from "../services/auth";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from "../middleware/auth";
import { encryptionUtils } from "../utils/encryption";

const router = express.Router();

// Debug Logger
router.use((req, res, next) => {
  console.log(`📡 SuperAdmin Router Hit: ${req.method} ${req.url}`);
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
  const { orgName, adminEmail, adminPassword, adminName, maxUsers, maxProjectsTotal } = req.body;
  
  if (!orgName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. Create Organization
    const org = await dbService.createOrganization({
      name: orgName,
      maxUsers: Number(maxUsers) || 5,
      maxProjectsTotal: Number(maxProjectsTotal) || 20,
      isDefault: false
    });

    // 2. Check if User already exists
    const existingUser = await dbService.findUserByEmail(adminEmail);
    let adminUser;

    if (existingUser) {
      // Security check: Don't move other SuperAdmins
      if (existingUser.role === "SUPERADMIN") {
        throw new Error("Cannot move a System SuperAdmin to a Tenant organization.");
      }

      // 3a. Update Existing User (Migrate to new Org)
      adminUser = await dbService.adminUpdateUser(existingUser.id, {
        organizationId: org.id,
        role: "ADMIN",
        view: "VISIONLIGHT",
        name: adminName || existingUser.name
      });
      console.log(`✅ Migrated existing user ${adminEmail} to new Tenant Org: ${orgName}`);
    } else {
      // 3b. Create Brand New Admin User
      adminUser = await AuthService.createSystemUser(
        adminEmail,
        adminPassword,
        adminName || `${orgName} Admin`,
        "VISIONLIGHT",
        3,
        org.id,
        "ADMIN"
      );
    }

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
    console.log(`🗑️ DELETE Request for Organization: ${req.params.id}`);
    // 1. Check if it's the default org (cannot delete)
    const org = await dbService.getOrganization(req.params.id);
    if (org?.isDefault) {
      return res.status(400).json({ error: "Cannot delete the default system organization." });
    }

    // 2. Delete all users associated with this org
    await prisma.user.deleteMany({ where: { organizationId: req.params.id } });

    // 3. Delete the org
    await prisma.organization.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: "Organization and all associated users deleted." });
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

// Update Organization Limits
router.put("/organizations/:id/limits", async (req: AuthenticatedRequest, res) => {
  const { maxUsers, maxProjectsTotal } = req.body;
  try {
    const org = await dbService.updateOrganization(req.params.id, {
      maxUsers: maxUsers !== undefined ? Number(maxUsers) : undefined,
      maxProjectsTotal: maxProjectsTotal !== undefined ? Number(maxProjectsTotal) : undefined,
    });
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
  const { name, role, view, maxProjects } = req.body;

  try {
    const updates: any = {};
    if (name) updates.name = name;
    if (role) updates.role = role;
    if (view) updates.view = view;
    if (maxProjects !== undefined) updates.maxProjects = Number(maxProjects);

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
      "USER"
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

// === GLOBAL CONTROLS ===

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
    const settings = await dbService.updateGlobalSettings(req.body);
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
