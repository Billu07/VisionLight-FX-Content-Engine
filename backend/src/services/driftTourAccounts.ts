import crypto from "node:crypto";
import { prisma, dbService } from "./database";
import { uniqueOrgSlug } from "../routes/drift";
import { FlowError, pagePublicPath } from "./driftFlows";
import { sendTourProInviteEmail, sendTourProJoinedEmail } from "./mail";

// drift.li Tour v2 accounts (TOUR_V2_PLAN.md P4). Two layers of page:
// - GENERAL (realtors, brands, venues) — can "Invite a Pro" to manage their page;
// - PRO (photographers / videographers) — can create General pages for clients and
//   manage them.
// Managing a page = holding an ADMIN profile in its org (the multi-profile session
// infra: the workspace switcher and usePageAdmin already understand several
// profiles). A client page records the Pro page that manages it (managedByOrgId).

const NS = "drift-tour-accounts";
const APP_URL = (process.env.DRIFT_APP_URL || "https://drift.li").replace(/\/+$/, "");
const INVITE_TTL_DAYS = 14;

export const TOUR_ACCOUNT_TYPES = ["GENERAL", "PRO"] as const;
export type TourAccountType = (typeof TOUR_ACCOUNT_TYPES)[number];
export const parseAccountType = (v: unknown): TourAccountType | null => {
  const s = String(v ?? "").trim().toUpperCase();
  return (TOUR_ACCOUNT_TYPES as readonly string[]).includes(s) ? (s as TourAccountType) : null;
};

type Identity = { authUserId: string | null; email: string; name?: string | null };

const pageRef = (org: { id: string; name: string; slug: string | null }) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  path: org.slug ? pagePublicPath(org.slug) : null,
});

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** The Pro page that manages this page (null when none). */
export async function pageManager(managedByOrgId: string | null | undefined) {
  if (!managedByOrgId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: managedByOrgId },
    select: { id: true, name: true, slug: true },
  });
  return org ? pageRef(org) : null;
}

/** A Pro creates a General page for a client: a new TOUR org managed by the Pro's page,
 *  plus an ADMIN profile in it for the Pro's own identity. */
export async function createClientPage(args: { proOrgId: string; identity: Identity; name: string }) {
  const name = args.name.trim().slice(0, 80);
  if (!name) throw new FlowError(400, "Give the client's page a name");
  const pro = await prisma.organization.findUnique({
    where: { id: args.proOrgId },
    select: { id: true, productLine: true, tourAccountType: true },
  });
  if (!pro || pro.productLine !== "TOUR") throw new FlowError(404, "This account has no tour page");
  if (pro.tourAccountType !== "PRO") {
    throw new FlowError(403, "Client pages are for Pro accounts (photographers and videographers).", { code: "PRO_ONLY" });
  }
  const slug = await uniqueOrgSlug(name);
  const org = await prisma.organization.create({
    data: {
      name,
      productLine: "TOUR",
      provisioningSource: "SELF_SERVE",
      routingDomain: "drift.li",
      slug,
      tenantPlan: "PAID",
      tourAccountType: "GENERAL",
      managedByOrgId: pro.id,
    },
    select: { id: true, name: true, slug: true },
  });
  const profile = await dbService.createUser({
    authUserId: args.identity.authUserId || undefined,
    email: args.identity.email,
    name: args.identity.name || undefined,
    view: "TOUR",
    maxProjects: 3,
    organizationId: org.id,
    role: "ADMIN",
  });
  console.log(`[${NS}] pro page ${pro.id} created client page ${org.id} (${slug}) — profile ${profile.id}`);
  return { profileId: profile.id, page: pageRef(org) };
}

/** The client pages a Pro page manages. */
export async function listClientPages(proOrgId: string) {
  const orgs = await prisma.organization.findMany({
    where: { managedByOrgId: proOrgId, productLine: "TOUR" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, createdAt: true, _count: { select: { driftFlows: true } } },
  });
  return orgs.map((o) => ({ ...pageRef(o), tours: o._count.driftFlows, createdAt: o.createdAt }));
}

const inviteExpired = (createdAt: Date) => Date.now() - createdAt.getTime() > INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

const serializeInvite = (i: { id: string; email: string; status: string; createdAt: Date; acceptedAt: Date | null }) => ({
  id: i.id,
  email: i.email,
  status: i.status === "PENDING" && inviteExpired(i.createdAt) ? "EXPIRED" : i.status,
  createdAt: i.createdAt,
  acceptedAt: i.acceptedAt,
});

/** "Invite a Pro": email a one-time link that makes its holder an admin of this page. */
export async function createProInvite(args: {
  orgId: string;
  email: string;
  inviter: { id: string | null; email?: string | null; name?: string | null };
}) {
  const email = args.email.trim().toLowerCase();
  if (!isEmail(email)) throw new FlowError(400, "Enter a valid email address");
  const org = await prisma.organization.findUnique({
    where: { id: args.orgId },
    select: { id: true, name: true, slug: true, productLine: true },
  });
  if (!org || org.productLine !== "TOUR") throw new FlowError(404, "This account has no tour page");
  const member = await prisma.user.findFirst({
    where: { organizationId: org.id, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (member) throw new FlowError(409, "That person already manages this page");

  // One live invite per email: a new one replaces the old link.
  await prisma.driftTourInvite.updateMany({
    where: { organizationId: org.id, email, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  const token = crypto.randomBytes(24).toString("base64url");
  const invite = await prisma.driftTourInvite.create({
    data: { organizationId: org.id, email, token, invitedByUserId: args.inviter.id },
  });
  const inviterLabel = args.inviter.name
    ? `${args.inviter.name}${args.inviter.email ? ` (${args.inviter.email})` : ""}`
    : args.inviter.email || org.name;
  void sendTourProInviteEmail({
    to: email,
    pageName: org.name,
    inviterLabel,
    url: `${APP_URL}/tour/invite/${token}`,
  }).catch((err) => console.error(`[${NS}] invite email failed:`, err));
  console.log(`[${NS}] page ${org.id} invited ${email}`);
  return serializeInvite(invite);
}

export async function listProInvites(orgId: string) {
  const rows = await prisma.driftTourInvite.findMany({
    where: { organizationId: orgId, status: { in: ["PENDING", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, email: true, status: true, createdAt: true, acceptedAt: true },
  });
  return rows.map(serializeInvite);
}

export async function revokeProInvite(orgId: string, id: string) {
  const r = await prisma.driftTourInvite.updateMany({
    where: { id, organizationId: orgId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  if (!r.count) throw new FlowError(404, "Invite not found");
}

/** What the invite page shows before anyone signs in. */
export async function describeInvite(token: string) {
  const invite = await prisma.driftTourInvite.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!invite || invite.status === "REVOKED") throw new FlowError(404, "This invite link is no longer valid.");
  return {
    email: invite.email,
    page: pageRef(invite.organization),
    status: invite.status === "PENDING" && inviteExpired(invite.createdAt) ? "EXPIRED" : invite.status,
  };
}

/** Accept: the signed-in identity gets an ADMIN profile on the page. A Pro accepting it
 *  becomes the page's managing Pro (when it has none yet). */
export async function acceptProInvite(token: string, identity: Identity) {
  const invite = await prisma.driftTourInvite.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true, slug: true, productLine: true, managedByOrgId: true } } },
  });
  if (!invite || invite.status === "REVOKED") throw new FlowError(404, "This invite link is no longer valid.");
  const org = invite.organization;
  if (org.productLine !== "TOUR") throw new FlowError(404, "This invite link is no longer valid.");

  const profiles: any[] = await dbService.findUsersForAuthIdentity(identity.authUserId || "", identity.email);
  let profile = profiles.find((p) => p.organizationId === org.id);
  if (!profile) {
    if (invite.status === "ACCEPTED") throw new FlowError(409, "This invite has already been used.");
    if (inviteExpired(invite.createdAt)) throw new FlowError(410, "This invite has expired — ask for a new one.");
    profile = await dbService.createUser({
      authUserId: identity.authUserId || undefined,
      email: identity.email,
      name: identity.name || undefined,
      view: "TOUR",
      maxProjects: 3,
      organizationId: org.id,
      role: "ADMIN",
    });
  }

  if (invite.status === "PENDING") {
    const proPage = profiles.find(
      (p) => p.view === "TOUR" && p.organizationId !== org.id && p.organization?.tourAccountType === "PRO",
    );
    await prisma.driftTourInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: profile.id },
    });
    if (proPage && !org.managedByOrgId) {
      await prisma.organization.update({ where: { id: org.id }, data: { managedByOrgId: proPage.organizationId } });
    }
    const admins = await prisma.user.findMany({
      where: { organizationId: org.id, role: { in: ["ADMIN", "SUPERADMIN"] }, NOT: { id: profile.id } },
      select: { email: true },
    });
    void sendTourProJoinedEmail({
      to: [...new Set(admins.map((a) => a.email).filter(Boolean))],
      proLabel: identity.name ? `${identity.name} (${identity.email})` : identity.email,
      pageName: org.name,
      url: `${APP_URL}${org.slug ? pagePublicPath(org.slug) : "/tour"}`,
    }).catch((err) => console.error(`[${NS}] joined email failed:`, err));
    console.log(`[${NS}] ${identity.email} accepted the invite to page ${org.id} (profile ${profile.id})`);
  }
  return { profileId: profile.id as string, page: pageRef(org) };
}
