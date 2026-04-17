import express from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";
import { dbService as airtableService, prisma } from "../services/database";
import { ROIService } from "../services/roi";
import { getTenantSettings } from "../lib/app-runtime";

const router = express.Router();

// ==================== AUTH ROUTES ====================
router.get(
  "/api/auth/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await airtableService.findUserById(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const org = user.organization;
      const isDefaultOrg = org?.isDefault;

      let isOrgActive = true;
      let needsActivation = false;

      if (org && !isDefaultOrg) {
        const hasKeys = !!(org.falApiKey || org.kieApiKey || org.openaiApiKey);
        if (!hasKeys) {
          isOrgActive = false;
          needsActivation = true;
        }
      }

      const systemPresets = await prisma.presetPrompt.findMany({
        where: { isActive: true },
        select: { id: true, name: true, prompt: true },
      });

      res.json({
        success: true,
        systemPresets,
        user: {
          ...req.user,
          isOrgActive,
          needsActivation,
          organizationName: org?.name,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ==================== DATA ROUTES ====================
router.post(
  "/api/projects",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Project name required" });

      const project = await airtableService.createProjectWithLimits(
        req.user!.id,
        name,
      );
      res.json({ success: true, project });
    } catch (error: any) {
      if (error?.message === "USER_PROJECT_LIMIT") {
        return res
          .status(403)
          .json({ error: "Maximum project limit reached for this user" });
      }
      if (error?.message === "ORG_PROJECT_LIMIT") {
        return res.status(403).json({ error: "Organization project limit reached" });
      }
      if (error?.message === "USER_NOT_FOUND") {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/projects",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const projects = await airtableService.getUserProjects(req.user!.id);
      res.json({ success: true, projects });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.patch(
  "/api/projects/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { name, editorState } = req.body;
      const project = await airtableService.getProjectById(req.params.id);
      if (!project || project.userId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const updated = await airtableService.updateProject(req.params.id, {
        name,
        editorState,
      });
      res.json({ success: true, project: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.delete(
  "/api/projects/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const project = await airtableService.getProjectById(req.params.id);
      if (!project || project.userId !== req.user!.id) {
        return res.status(403).json({ error: "Denied" });
      }
      await airtableService.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/brand-config",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const config = await airtableService.getBrandConfig(req.user!.id);
      res.json({ success: true, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.put(
  "/api/brand-config",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    const { companyName, primaryColor, secondaryColor, logoUrl } = req.body;
    try {
      const config = await airtableService.upsertBrandConfig({
        userId: req.user!.id,
        companyName,
        primaryColor,
        secondaryColor,
        logoUrl,
      });
      res.json({ success: true, config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/roi-metrics",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = await ROIService.getMetrics(req.user!.id);
      res.json({ success: true, metrics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/api/user-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const [user, settings] = await Promise.all([
        airtableService.findUserById(req.user!.id),
        getTenantSettings(req.user!.id),
      ]);

      if (!user) return res.json({ credits: 0 });

      const u = user as any;
      res.json({
        credits: u.creditBalance,
        creditsPicDrift: u.creditsPicDrift,
        creditsPicDriftPlus: u.creditsPicDriftPlus,
        creditsImageFX: u.creditsImageFX,
        creditsVideoFX1: u.creditsVideoFX1,
        creditsVideoFX2: u.creditsVideoFX2,
        creditsVideoFX3: u.creditsVideoFX3,
        prices: settings,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  },
);

router.post(
  "/api/request-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await airtableService.findUserById(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const existingPending = await prisma.creditRequest.findFirst({
        where: {
          userId: req.user!.id,
          status: "PENDING",
        },
      });

      if (existingPending) {
        return res.json({
          success: true,
          message: "A pending credit request already exists.",
        });
      }

      await airtableService.createCreditRequest(
        req.user!.id,
        user.email,
        user.name || user.email,
        user.organizationId,
      );

      res.json({ success: true, message: "Credit request submitted." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ==================== PROMPT FX ROUTES ====================
router.get(
  "/api/user-prompt-fx",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { promptFx: true },
      });
      res.json({ success: true, promptFx: user?.promptFx || [] });
    } catch (error: any) {
      console.error("PromptFX Get Error:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.put(
  "/api/user-prompt-fx",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { promptFx } = req.body;
      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: { promptFx },
        select: { promptFx: true },
      });
      res.json({ success: true, promptFx: updatedUser.promptFx });
    } catch (error: any) {
      console.error("PromptFX Update Error:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/api/reset-demo-credits",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      await airtableService.adminUpdateUser(req.user!.id, {
        creditsPicDrift: 5,
        creditsPicDriftPlus: 0,
        creditsImageFX: 15,
        creditsVideoFX1: 0,
        creditsVideoFX2: 0,
        creditsVideoFX3: 0,
      });
      res.json({ success: true, message: "Demo credits reset (PicDrift 5, PicFX 15)." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
