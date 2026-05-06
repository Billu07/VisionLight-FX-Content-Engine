import express, { Request } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";
import { dbService as airtableService, prisma } from "../services/database";
import { AuthService } from "../services/auth";
import { supportHandoffService } from "../services/supportHandoff";
import { ROIService } from "../services/roi";
import { getTenantSettings, isOrganizationExpired } from "../lib/app-runtime";
import { upload } from "../utils/fileUpload";
import {
  copyExternalImageToManagedStorage,
  isManagedStorageUrl,
  uploadManagedBuffer,
} from "../utils/managedStorage";

const router = express.Router();

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

const DOMAIN_ROUTING_ENABLED =
  (process.env.DOMAIN_ROUTING_ENABLED ?? "true").toLowerCase() !== "false";
const PICDRIFT_CANONICAL_DOMAIN =
  sanitizeDomain(process.env.PICDRIFT_CANONICAL_DOMAIN || process.env.PICDRIFT_DOMAIN) ||
  "picdrift.studio";
const VISIONLIGHT_CANONICAL_DOMAIN =
  sanitizeDomain(
    process.env.VISIONLIGHT_CANONICAL_DOMAIN ||
      process.env.VISUALFX_CANONICAL_DOMAIN ||
      process.env.VISUALFX_DOMAIN,
  ) || "visualfx.studio";

const getCanonicalDomainForView = (view: "VISIONLIGHT" | "PICDRIFT") =>
  view === "PICDRIFT" ? PICDRIFT_CANONICAL_DOMAIN : VISIONLIGHT_CANONICAL_DOMAIN;

const getRequestProtocol = (req: Request) => {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const rawProto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  if (typeof rawProto === "string" && rawProto.trim()) {
    const proto = rawProto.split(",")[0]?.trim().toLowerCase();
    if (proto === "http" || proto === "https") return proto;
  }
  return req.protocol === "https" ? "https" : "http";
};

const buildPublicProfileOption = (user: any) => {
  const view = (user?.view === "PICDRIFT" ? "PICDRIFT" : "VISIONLIGHT") as
    | "VISIONLIGHT"
    | "PICDRIFT";
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    view,
    organizationId: user.organizationId,
    organizationName: user.organization?.name || "Personal Workspace",
    organizationIsDefault: user.organization?.isDefault === true,
    isOrgActive: user.organization?.isActive !== false,
    canonicalDomain: getCanonicalDomainForView(view),
  };
};

router.post("/api/auth/resolve-domain", async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    if (typeof rawEmail !== "string" || !rawEmail.trim()) {
      return res.status(400).json({ error: "Email required" });
    }

    const email = rawEmail.trim().toLowerCase();
    const users = await airtableService.findUsersByEmail(email);
    const user = users[0];
    const incomingHost = resolveIncomingHost(req);

    const resolvedView = (user?.view || "VISIONLIGHT") as "VISIONLIGHT" | "PICDRIFT";
    const canonicalFromView = getCanonicalDomainForView(resolvedView);
    const profiles = users.map(buildPublicProfileOption);
    const hasMultipleProfiles = profiles.length > 1;

    // Keep response generic to reduce account-enumeration signal.
    // If user isn't known, stay on current host. If multiple profiles exist,
    // let the client ask the user to choose a workspace before password entry.
    const canonicalDomain =
      !DOMAIN_ROUTING_ENABLED || hasMultipleProfiles
        ? null
        : user
          ? canonicalFromView
          : incomingHost || null;

    const domainRedirectRequired = Boolean(
      canonicalDomain && incomingHost && incomingHost !== canonicalDomain,
    );

    return res.json({
      success: true,
      domainRoutingEnabled: DOMAIN_ROUTING_ENABLED,
      canonicalDomain,
      domainRedirectRequired,
      profiles,
      profileSelectionRequired: hasMultipleProfiles,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post(
  "/api/auth/support-handoff/start",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawTargetUserId = req.body?.targetUserId;
      if (typeof rawTargetUserId !== "string" || !rawTargetUserId.trim()) {
        return res.status(400).json({ error: "targetUserId is required" });
      }

      const targetUserId = rawTargetUserId.trim();
      const requester =
        req.user?.readOnlyImpersonation && req.user?.impersonator?.id
          ? await airtableService.findUserById(req.user.impersonator.id)
          : await airtableService.findUserById(req.user!.id);
      if (!requester) {
        return res.status(401).json({ error: "Requester not found" });
      }

      const requesterIsSuperAdmin =
        requester.role === "SUPERADMIN" ||
        AuthService.isSuperAdminEmail(requester.email);
      if (!requesterIsSuperAdmin) {
        return res
          .status(403)
          .json({ error: "Only superadmins can create support handoff tokens." });
      }

      const target = await airtableService.findUserById(targetUserId);
      if (!target) {
        return res.status(404).json({ error: "Target user not found" });
      }

      const targetView =
        (target.view === "PICDRIFT" ? "PICDRIFT" : "VISIONLIGHT") as
          | "VISIONLIGHT"
          | "PICDRIFT";
      const canonicalDomain = getCanonicalDomainForView(targetView);
      const incomingHost = resolveIncomingHost(req);
      const currentHostMatches = incomingHost === canonicalDomain;
      if (currentHostMatches) {
        return res.json({
          success: true,
          domainSwitchRequired: false,
          canonicalDomain,
        });
      }

      const token = supportHandoffService.issueHandoffToken({
        issuerUserId: requester.id,
        targetUserId,
        audienceDomain: canonicalDomain,
        sourceDomain: incomingHost,
      });
      const protocol = getRequestProtocol(req);
      const handoffUrl = `${protocol}://${canonicalDomain}/support-handoff#token=${encodeURIComponent(token)}`;

      console.log("[support-handoff:start]", {
        issuerUserId: requester.id,
        targetUserId,
        sourceDomain: incomingHost,
        destinationDomain: canonicalDomain,
      });

      return res.json({
        success: true,
        domainSwitchRequired: true,
        canonicalDomain,
        handoffUrl,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },
);

router.post("/api/auth/support-handoff/consume", async (req, res) => {
  try {
    const rawToken = req.body?.token;
    if (typeof rawToken !== "string" || !rawToken.trim()) {
      return res.status(400).json({ error: "token is required" });
    }
    const incomingHost = resolveIncomingHost(req);
    const handoff = supportHandoffService.consumeHandoffToken(
      rawToken.trim(),
      incomingHost,
    );

    const issuer = await airtableService.findUserById(handoff.issuerUserId);
    if (!issuer) {
      return res.status(401).json({ error: "Handoff issuer no longer exists." });
    }
    const issuerIsSuperAdmin =
      issuer.role === "SUPERADMIN" || AuthService.isSuperAdminEmail(issuer.email);
    if (!issuerIsSuperAdmin) {
      return res.status(403).json({
        error: "Handoff issuer is no longer authorized for superadmin support.",
      });
    }

    const target = await airtableService.findUserById(handoff.targetUserId);
    if (!target) {
      return res.status(404).json({ error: "Target user not found." });
    }

    const sessionToken = supportHandoffService.issueSupportSessionToken({
      issuerUserId: handoff.issuerUserId,
      targetUserId: handoff.targetUserId,
      audienceDomain: handoff.audienceDomain,
    });

    console.log("[support-handoff:consume]", {
      issuerUserId: handoff.issuerUserId,
      targetUserId: handoff.targetUserId,
      sourceDomain: handoff.sourceDomain,
      destinationDomain: handoff.audienceDomain,
    });

    return res.json({
      success: true,
      sessionToken,
      target: {
        id: target.id,
        email: target.email,
        name: target.name,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Failed to consume handoff token.";
    return res.status(400).json({ error: message });
  }
});

// ==================== AUTH ROUTES ====================
router.get(
  "/api/auth/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.profileSelectionRequired) {
        return res.json({
          success: true,
          profileSelectionRequired: true,
          profiles: req.user.profiles || [],
          user: null,
        });
      }

      const user = await airtableService.findUserById(req.user!.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const org = user.organization;
      const isDefaultOrg = org?.isDefault;
      const orgViewType = ((user as any).view || req.user?.view || "VISIONLIGHT") as
        | "VISIONLIGHT"
        | "PICDRIFT";
      const isReadOnlyImpersonation = req.user?.readOnlyImpersonation === true;
      const isSuperAdmin =
        req.user?.role === "SUPERADMIN" ||
        req.user?.impersonator?.role === "SUPERADMIN";

      let isOrgActive = true;
      let needsActivation = false;
      let orgLockReason: "DEACTIVATED" | "MISSING_FAL_KEY" | null = null;

      if (org && !isDefaultOrg) {
        const isDeactivated = org.isActive === false || isOrganizationExpired(org);
        if (isOrganizationExpired(org) && org.isActive !== false) {
          void airtableService.updateOrganizationStatus(org.id, false).catch((error: any) =>
            console.warn("[auth/me] Failed to mark expired demo tenant inactive:", error?.message || error),
          );
        }
        const hasFalKey = !!org.falApiKey;
        if (isDeactivated) {
          isOrgActive = false;
          needsActivation = true;
          orgLockReason = "DEACTIVATED";
        } else if (!hasFalKey) {
          isOrgActive = false;
          needsActivation = true;
          orgLockReason = "MISSING_FAL_KEY";
        }
      }

      const systemPresets = await prisma.presetPrompt.findMany({
        where: { isActive: true },
        select: { id: true, name: true, prompt: true },
      });
      const profiles = isReadOnlyImpersonation
        ? [buildPublicProfileOption(user)]
        : (
            await airtableService.findUsersForAuthIdentity(
              (user as any).authUserId || req.user?.authUserId || "",
              user.email,
            )
          ).map(buildPublicProfileOption);

      let videoEditorEnabledForAll = false;
      try {
        const globalSettings = await airtableService.getGlobalSettings();
        videoEditorEnabledForAll =
          globalSettings?.featureVideoEditorForAll === true;
      } catch (settingsError: any) {
        console.warn(
          "[auth/me] Global settings unavailable; defaulting Video Editor rollout to superadmin-only.",
          settingsError?.message || settingsError,
        );
      }

      const canonicalDomain =
        !DOMAIN_ROUTING_ENABLED || isReadOnlyImpersonation
          ? null
          : getCanonicalDomainForView(orgViewType);
      const incomingHost = resolveIncomingHost(req);
      const domainRedirectRequired = Boolean(
        canonicalDomain && incomingHost && incomingHost !== canonicalDomain,
      );

      res.json({
        success: true,
        systemPresets,
        profiles,
        user: {
          ...req.user,
          view: orgViewType,
          orgViewType,
          isSuperAdmin,
          isOrgActive,
          organizationIsDefault: isDefaultOrg === true,
          organizationTenantPlan: org?.tenantPlan || null,
          needsActivation,
          orgLockReason,
          organizationName: org?.name,
          videoEditorEnabledForAll,
          canonicalDomain,
          domainRoutingEnabled: DOMAIN_ROUTING_ENABLED,
          domainRedirectRequired,
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
      let storedLogoUrl =
        typeof logoUrl === "string" ? logoUrl.trim() : logoUrl;
      if (storedLogoUrl && !isManagedStorageUrl(storedLogoUrl)) {
        storedLogoUrl = await copyExternalImageToManagedStorage({
          rawUrl: storedLogoUrl,
          keyPrefix: `visionlight/brand-logos/user_${req.user!.id}`,
        });
      }

      const config = await airtableService.upsertBrandConfig({
        userId: req.user!.id,
        companyName,
        primaryColor,
        secondaryColor,
        logoUrl: storedLogoUrl,
      });
      res.json({ success: true, config });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

router.post(
  "/api/brand-config/logo",
  authenticateToken,
  upload.single("image"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Logo file is required." });
      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "Logo must be an image file." });
      }
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "Logo file is too large. Maximum size is 10MB." });
      }

      const logoUrl = await uploadManagedBuffer({
        buffer: file.buffer,
        contentType: file.mimetype,
        keyPrefix: `visionlight/brand-logos/user_${req.user!.id}`,
        fallbackExtension: "png",
      });
      const existing = await airtableService.getBrandConfig(req.user!.id);
      const config = await airtableService.upsertBrandConfig({
        userId: req.user!.id,
        companyName: existing?.companyName,
        primaryColor: existing?.primaryColor,
        secondaryColor: existing?.secondaryColor,
        logoUrl,
      });

      res.json({ success: true, logoUrl, config });
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
      const user = await airtableService.findUserById(req.user!.id);
      if (!user || (user as any).isDemo !== true) {
        return res.status(403).json({ error: "Demo-only action" });
      }

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
