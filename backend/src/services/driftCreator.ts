import { prisma, dbService } from "./database";
import { uniqueOrgSlug } from "../routes/drift";

// Self-serve creator accounts for the drift.li creator suite (Tour). A creator is
// a personal Organization (productLine "TOUR" — its own product line, like
// ROTATION3D vs DRIFT) plus one ADMIN User (view "TOUR") bound to their Supabase
// identity. Reuses the multi-profile session infra: the same email may also own a
// studio or brand profile — then the creator profile is a second profile that the
// frontend activates via X-Active-User-Id. Nothing here touches studio/brand rows.
//
// (uniqueOrgSlug lives with the drift routes; importing it keeps ONE reserved-slug
// list instead of a drifting copy.)

const NS = "drift-creator";
export const CREATOR_PRODUCT_LINE = "TOUR";
export const CREATOR_VIEW = "TOUR";
const DOMAIN = "drift.li";

export type CreatorIdentity = { authUserId: string; email: string; name?: string | null };

export type CreatorProvisionResult = {
  profileId: string;
  organizationId: string;
  name: string | null;
  /** true when this call created the creator profile */
  created: boolean;
  /** true when an untouched auto-created profile was converted in place */
  converted: boolean;
};

const isCreatorProfile = (p: any) => p?.view === CREATOR_VIEW && !!p?.organizationId;

/** The identity's creator profile, or null. */
export async function findCreatorProfile(authUserId: string, email: string) {
  const profiles: any[] = await dbService.findUsersForAuthIdentity(authUserId, email);
  return profiles.find(isCreatorProfile) || null;
}

/**
 * Idempotent provisioning:
 * 1. an existing creator profile → returned as-is;
 * 2. an untouched auto-created profile (no org, default role/view, no projects) →
 *    converted in place, so a brand-new signup ends with ONE profile and never
 *    sees the workspace chooser;
 * 3. otherwise (an existing studio/brand user) → a second profile in a new
 *    personal org.
 */
export async function provisionCreator(
  identity: CreatorIdentity,
  displayName?: string | null,
): Promise<CreatorProvisionResult> {
  const email = identity.email.trim().toLowerCase();
  const profiles: any[] = await dbService.findUsersForAuthIdentity(identity.authUserId, email);
  const existing = profiles.find(isCreatorProfile);
  if (existing) {
    return {
      profileId: existing.id,
      organizationId: existing.organizationId,
      name: existing.name ?? null,
      created: false,
      converted: false,
    };
  }

  const name =
    String(displayName || identity.name || email.split("@")[0] || "")
      .trim()
      .slice(0, 80) || "Creator";
  const slug = await uniqueOrgSlug(name);
  const org = await prisma.organization.create({
    data: {
      name,
      productLine: CREATOR_PRODUCT_LINE,
      provisioningSource: "SELF_SERVE",
      routingDomain: DOMAIN,
      slug,
      tenantPlan: "PAID", // not DEMO: demo semantics (expiry/locks) are studio-only
    },
    select: { id: true },
  });

  const bare = profiles.find(
    (p) => !p.organizationId && (p.role || "USER") === "USER" && (p.view || "VISIONLIGHT") === "VISIONLIGHT",
  );
  if (bare) {
    const projects = await prisma.project.count({ where: { userId: bare.id } });
    if (projects === 0) {
      const updated = await prisma.user.update({
        where: { id: bare.id },
        data: {
          organizationId: org.id,
          view: CREATOR_VIEW,
          role: "ADMIN",
          name: bare.name || name,
          authUserId: identity.authUserId,
        },
        select: { id: true, name: true },
      });
      console.log(`[${NS}] ${email}: converted profile ${updated.id} → creator org ${org.id} (${slug})`);
      return { profileId: updated.id, organizationId: org.id, name: updated.name ?? null, created: true, converted: true };
    }
  }

  const created = await dbService.createUser({
    authUserId: identity.authUserId,
    email,
    name,
    view: CREATOR_VIEW,
    maxProjects: 3,
    organizationId: org.id,
    role: "ADMIN",
  });
  console.log(`[${NS}] ${email}: new creator profile ${created.id} in org ${org.id} (${slug})`);
  return { profileId: created.id, organizationId: org.id, name: created.name ?? null, created: true, converted: false };
}
