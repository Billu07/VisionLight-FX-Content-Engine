import { Router, Response } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { findCreatorProfile, provisionCreator } from "../services/driftCreator";

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
router.post("/api/drift/creator/signup", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const id = identityOf(req);
  if (!id.email || !id.authUserId) return res.status(400).json({ error: "No signed-in identity" });
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
  try {
    const result = await provisionCreator(id, name || null);
    res.status(result.created ? 201 : 200).json(result);
  } catch (err: any) {
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

export default router;
