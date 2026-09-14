import { Router, Response } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import {
  CreatorConfirmationRequired,
  findCreatorProfile,
  provisionCreator,
} from "../services/driftCreator";
import { FlowError } from "../services/driftFlows";
import { acceptProInvite, describeInvite, parseAccountType } from "../services/driftTourAccounts";

// Creator-account routes for the drift.li creator suite. These operate on the
// signed-in IDENTITY (not a chosen workspace), so the auth middleware lets them
// through even when a multi-profile email still has to pick a workspace.

const router = Router();
const NS = "drift-creator";

const identityOf = (req: AuthenticatedRequest) => {
  const u = req.user || {};
  const email = String(u.email || "").trim().toLowerCase();
  // A resolved session user carries authUserId; the "pick a workspace" shape
  // carries it too. Older rows without one are attached during validateSession.
  const authUserId = String(u.authUserId || "").trim();
  return { email, authUserId, name: typeof u.name === "string" ? u.name : null };
};

// Provision (or fetch) the caller's creator profile. Idempotent. Returns the
// profile to activate (X-Active-User-Id) when the identity has several.
// Body { name?, confirm? } — `confirm: true` is required to add a creator profile
// next to an EXISTING studio/brand workspace (otherwise 409 CREATOR_CONFIRM), so
// a brand admin who merely logs in never gets a creator org silently.
router.post("/api/drift/creator/signup", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const id = identityOf(req);
  if (!id.email || !id.authUserId) return res.status(400).json({ error: "No signed-in identity" });
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
  const confirm = req.body?.confirm === true;
  const accountType = parseAccountType(req.body?.accountType);
  try {
    const result = await provisionCreator(id, name || null, { allowSecondProfile: confirm, accountType });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err: any) {
    if (err instanceof CreatorConfirmationRequired) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        needsConfirmation: true,
        details: { email: err.email, profiles: err.profiles },
      });
    }
    console.error(`[${NS}] signup failed for ${id.email}:`, err);
    res.status(500).json({ error: "We couldn't set up your creator space. Please try again." });
  }
});

// Does the caller already have a creator profile? (Used by the route guard.)
router.get("/api/drift/creator/profile", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const id = identityOf(req);
  if (!id.email || !id.authUserId) return res.json({ profile: null });
  const p = await findCreatorProfile(id.authUserId, id.email);
  res.json({
    profile: p ? { id: p.id, organizationId: p.organizationId, name: p.name ?? null } : null,
  });
});

// "Invite a Pro": what the invite link shows before anyone signs in.
router.get("/api/drift/public/tour-invites/:token", async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ invite: await describeInvite(String(req.params.token || "")) });
  } catch (err) {
    if (err instanceof FlowError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// Accept an invite as the signed-in identity (works before a workspace is picked).
router.post("/api/drift/creator/invites/:token/accept", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const id = identityOf(req);
  if (!id.email) return res.status(400).json({ error: "No signed-in identity" });
  try {
    const result = await acceptProInvite(String(req.params.token || ""), {
      authUserId: id.authUserId || null,
      email: id.email,
      name: id.name,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof FlowError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    console.error(`[${NS}] invite accept failed for ${id.email}:`, err);
    res.status(500).json({ error: "We couldn't accept this invite. Please try again." });
  }
});

export default router;
