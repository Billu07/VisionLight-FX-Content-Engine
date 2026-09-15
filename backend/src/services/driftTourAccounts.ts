import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, dbService } from "./database";
import { uniqueOrgSlug } from "../routes/drift";
import { FlowError, pagePublicPath } from "./driftFlows";
import { sendTourProInviteEmail, sendTourProJoinedEmail } from "./mail";
import { untouchedProfile } from "./driftCreator";

// drift.li Tour v2 accounts (TOUR_V2_PLAN.md P4). Two layers of page:
// - GENERAL (realtors, brands, venues) — can "Invite a Pro" to manage their page;
// - PRO (photographers / videographers) — can create General pages for clients and
//   manage them.
// Being on a page = holding a profile in its org, as an Admin, Editor or Viewer (tourRole; the multi-profile session
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

// Page roles. A member is a User profile in the page's org; tourRole says what they may do
// (profiles from before roles have none and stay admins). User.role mirrors it for the rest
// of the app — ADMIN for admins, USER for editors and viewers — so the brand and tenant
// admin tools stay out of their reach.
export const PAGE_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];
export const PAGE_ROLE_RANK: Record<PageRole, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };
export const parsePageRole = (v: unknown): PageRole | null => {
  const s = String(v ?? "").trim().toUpperCase();
  return (PAGE_ROLES as readonly string[]).includes(s) ? (s as PageRole) : null;
};
export const memberRole = (u: { tourRole?: string | null } | null | undefined): PageRole =>
  parsePageRole(u?.tourRole) ?? "ADMIN";
const appRoleFor = (role: PageRole, current?: string | null) =>
  current === "SUPERADMIN" ? "SUPERADMIN" : role === "ADMIN" ? "ADMIN" : "USER";
const ROLE_COPY: Record<PageRole, { label: string; summary: string }> = {
  ADMIN: { label: "an Admin", summary: "manage the page, its people and its tours" },
  EDITOR: { label: "an Editor", summary: "build and publish its Drift Tours" },
  VIEWER: { label: "a Viewer", summary: "see all of its tours, drafts included" },
};
const sameIdentity = (a: { email: string; authUserId: string | null }, b: { email: string; authUserId: string | null }) =>
  (!!a.authUserId && a.authUserId === b.authUserId) || a.email.trim().toLowerCase() === b.email.trim().toLowerCase();

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
 *  plus an ADMIN profile in it for the Pro's own identity. (A superadmin doing it from
 *  "Manage this page" isn't that Pro — the page goes to the Pro page's admins, and
 *  profileId is null.) */
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
  const actorIsMember = !!(await prisma.user.findFirst({
    where: { organizationId: pro.id, email: { equals: args.identity.email, mode: "insensitive" } },
    select: { id: true },
  }));
  const grantees: Identity[] = [];
  if (actorIsMember) grantees.push(args.identity);
  else {
    const admins = await prisma.user.findMany({
      where: { organizationId: pro.id, role: "ADMIN" },
      select: { authUserId: true, email: true, name: true },
    });
    const seen = new Set<string>();
    for (const a of admins) {
      const key = String(a.email || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      grantees.push({ authUserId: a.authUserId, email: a.email, name: a.name });
    }
  }
  if (!grantees.length) throw new FlowError(409, "This Pro page has no admin to hand the client page to.");

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
      // The free trial is the Pro's own page; client work is paid per drift (a superadmin
      // can still grant free drifts per page in Admin → drift.li → Tour).
      freeDrifts: 0,
    },
    select: { id: true, name: true, slug: true },
  });
  let profileId: string | null = null;
  for (const g of grantees) {
    const profile = await dbService.createUser({
      authUserId: g.authUserId || undefined,
      email: g.email,
      name: g.name || undefined,
      view: "TOUR",
      maxProjects: 3,
      organizationId: org.id,
      role: "ADMIN",
      tourRole: "ADMIN",
    });
    if (actorIsMember) profileId = profile.id as string;
  }
  console.log(
    `[${NS}] pro page ${pro.id} created client page ${org.id} (${slug}) — ${grantees.length} admin profile(s)${actorIsMember ? "" : ", by a superadmin"}`,
  );
  return { profileId, page: pageRef(org) };
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

const serializeInvite = (i: {
  id: string;
  email: string;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  role?: string | null;
}) => ({
  id: i.id,
  email: i.email,
  role: parsePageRole(i.role) ?? "ADMIN",
  status: i.status === "PENDING" && inviteExpired(i.createdAt) ? "EXPIRED" : i.status,
  createdAt: i.createdAt,
  acceptedAt: i.acceptedAt,
});

/** "Invite a Pro": email a one-time link that makes its holder an admin of this page. */
export async function createProInvite(args: {
  orgId: string;
  email: string;
  role?: unknown;
  inviter: { id: string | null; email?: string | null; name?: string | null };
}) {
  const email = args.email.trim().toLowerCase();
  if (!isEmail(email)) throw new FlowError(400, "Enter a valid email address");
  const role = parsePageRole(args.role) ?? "EDITOR";
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
    data: { organizationId: org.id, email, token, invitedByUserId: args.inviter.id, role },
  });
  const inviterLabel = args.inviter.name
    ? `${args.inviter.name}${args.inviter.email ? ` (${args.inviter.email})` : ""}`
    : args.inviter.email || org.name;
  void sendTourProInviteEmail({
    to: email,
    pageName: org.name,
    inviterLabel,
    url: `${APP_URL}/tour/invite/${token}`,
    roleLabel: ROLE_COPY[role].label,
    roleSummary: ROLE_COPY[role].summary,
  }).catch((err) => console.error(`[${NS}] invite email failed:`, err));
  console.log(`[${NS}] page ${org.id} invited ${email} as ${role}`);
  return serializeInvite(invite);
}

export async function listProInvites(orgId: string) {
  const rows = await prisma.driftTourInvite.findMany({
    where: { organizationId: orgId, status: { in: ["PENDING", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, email: true, status: true, createdAt: true, acceptedAt: true, role: true },
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
    role: parsePageRole(invite.role) ?? "ADMIN",
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
  const inviteRole = parsePageRole(invite.role) ?? "ADMIN";

  const profiles: any[] = await dbService.findUsersForAuthIdentity(identity.authUserId || "", identity.email);
  let profile = profiles.find((p) => p.organizationId === org.id);
  const usable = invite.status === "PENDING" && !inviteExpired(invite.createdAt);
  if (!profile && !usable) {
    if (invite.status === "ACCEPTED") throw new FlowError(409, "This invite has already been used.");
    throw new FlowError(410, "This invite has expired — ask for a new one.");
  }

  // Claim the link atomically first, so a forwarded link or a double-submit can't be used
  // twice. Someone who already manages the page just goes there (an expired or used link
  // changes nothing for them).
  let claimed = false;
  if (usable) {
    const r = await prisma.driftTourInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    claimed = r.count === 1;
  }
  if (!profile && !claimed) {
    // Lost the claim — fine if it was this same person's other request that won.
    const again: any[] = await dbService.findUsersForAuthIdentity(identity.authUserId || "", identity.email);
    profile = again.find((p) => p.organizationId === org.id);
    if (!profile) throw new FlowError(409, "This invite has already been used.");
  }
  if (!profile) {
    try {
      // A brand-new login (the bare profile validateSession just made for this sign-up)
      // becomes its profile on this page in place — no stray empty workspace beside it.
      const bare = await untouchedProfile(profiles);
      profile = bare
        ? await prisma.user.update({
            where: { id: bare.id },
            data: {
              organizationId: org.id,
              view: "TOUR",
              role: appRoleFor(inviteRole),
              tourRole: inviteRole,
              name: bare.name || identity.name || undefined,
              authUserId: identity.authUserId || bare.authUserId || undefined,
            },
          })
        : await dbService.createUser({
            authUserId: identity.authUserId || undefined,
            email: identity.email,
            name: identity.name || undefined,
            view: "TOUR",
            maxProjects: 3,
            organizationId: org.id,
            role: appRoleFor(inviteRole),
            tourRole: inviteRole,
          });
    } catch (err) {
      // Give the link back so it still works once whatever failed is fixed.
      await prisma.driftTourInvite
        .updateMany({
          where: { id: invite.id, status: "ACCEPTED", acceptedByUserId: null },
          data: { status: "PENDING", acceptedAt: null },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  if (claimed) {
    const proPage = profiles.find(
      (p) => p.view === "TOUR" && p.organizationId !== org.id && p.organization?.tourAccountType === "PRO",
    );
    await prisma.driftTourInvite.update({ where: { id: invite.id }, data: { acceptedByUserId: profile.id } });
    // A Viewer follows along; a Pro who joins as an Admin or Editor manages the page.
    if (proPage && !org.managedByOrgId && inviteRole !== "VIEWER") {
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
      roleLabel: ROLE_COPY[inviteRole].label,
    }).catch((err) => console.error(`[${NS}] joined email failed:`, err));
    console.log(`[${NS}] ${identity.email} accepted the invite to page ${org.id} as ${inviteRole} (profile ${profile.id})`);
  }
  return { profileId: profile.id as string, page: pageRef(org) };
}

// ───────────────────────── people: members, roles, access ─────────────────────────

const lockPage = (tx: Prisma.TransactionClient, orgId: string) =>
  tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;

const otherAdmins = async (tx: Prisma.TransactionClient, orgId: string, excludeId: string) => {
  const rows = await tx.user.findMany({ where: { organizationId: orgId, NOT: { id: excludeId } }, select: { tourRole: true } });
  return rows.filter((r) => memberRole(r) === "ADMIN").length;
};

/** Everyone who holds a profile on this page — admins first, then editors, then viewers. */
export async function listPageMembers(orgId: string, youId: string | null) {
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, tourRole: true, createdAt: true },
  });
  return users
    .map((u) => ({ id: u.id, email: u.email, name: u.name, role: memberRole(u), you: u.id === youId, joinedAt: u.createdAt }))
    .sort((a, b) => PAGE_ROLE_RANK[b.role] - PAGE_ROLE_RANK[a.role]);
}

/** An admin changes someone's role. A page always keeps at least one admin. */
export async function updatePageMemberRole(args: { orgId: string; memberId: string; role: unknown; actorIsSuper: boolean }) {
  const role = parsePageRole(args.role);
  if (!role) throw new FlowError(400, "Role must be Admin, Editor or Viewer");
  const result = await prisma.$transaction(async (tx) => {
    await lockPage(tx, args.orgId);
    const target = await tx.user.findFirst({
      where: { id: args.memberId, organizationId: args.orgId },
      select: { id: true, email: true, role: true, tourRole: true },
    });
    if (!target) throw new FlowError(404, "That person isn't on this page");
    if (target.role === "SUPERADMIN" && !args.actorIsSuper) throw new FlowError(403, "A drift.li team account can't be changed here.");
    const current = memberRole(target);
    if (current === role) return { id: target.id, email: target.email, role, changed: false };
    if (current === "ADMIN" && (await otherAdmins(tx, args.orgId, target.id)) < 1) {
      throw new FlowError(409, "Every page needs an admin — make someone else an admin first.", { code: "LAST_ADMIN" });
    }
    await tx.user.update({ where: { id: target.id }, data: { tourRole: role, role: appRoleFor(role, target.role) } });
    return { id: target.id, email: target.email, role, changed: true };
  });
  if (result.changed) console.log(`[${NS}] page ${args.orgId}: ${result.email} is now ${result.role}`);
  return { id: result.id, role: result.role };
}

/** Remove someone's access to a page — their profile there; their login and their other
 *  pages stay. An admin removes anyone; a member can remove themselves ("Leave page").
 *  The last admin can't go. A client page stops counting as managed by its Pro page once
 *  nobody from that Pro page is on it. */
export async function removePageMember(args: {
  orgId: string;
  memberId: string;
  actorId: string | null;
  actorIsAdmin: boolean;
  actorIsSuper: boolean;
}) {
  const self = !!args.actorId && args.actorId === args.memberId;
  if (!self && !args.actorIsAdmin) throw new FlowError(403, "Only this page's admins can remove people.", { code: "PAGE_ROLE" });
  const result = await prisma.$transaction(async (tx) => {
    await lockPage(tx, args.orgId);
    const target = await tx.user.findFirst({
      where: { id: args.memberId, organizationId: args.orgId },
      select: { id: true, email: true, role: true, tourRole: true },
    });
    if (!target) throw new FlowError(404, "That person isn't on this page");
    if (target.role === "SUPERADMIN" && !args.actorIsSuper && !self) {
      throw new FlowError(403, "A drift.li team account can't be removed here.");
    }
    if (memberRole(target) === "ADMIN" && (await otherAdmins(tx, args.orgId, target.id)) < 1) {
      throw new FlowError(
        409,
        self ? "You're this page's only admin — make someone else an admin before you leave." : "Every page needs an admin.",
        { code: "LAST_ADMIN" },
      );
    }
    try {
      await tx.user.delete({ where: { id: target.id } });
    } catch (err: any) {
      if (err?.code === "P2003") throw new FlowError(409, "This account has other work attached to it — contact us to remove it.");
      throw err;
    }
    let unlinked = false;
    const org = await tx.organization.findUnique({ where: { id: args.orgId }, select: { managedByOrgId: true } });
    if (org?.managedByOrgId) {
      const remaining = await tx.user.findMany({ where: { organizationId: args.orgId }, select: { email: true, authUserId: true } });
      const pro = await tx.user.findMany({ where: { organizationId: org.managedByOrgId }, select: { email: true, authUserId: true } });
      if (!remaining.some((r) => pro.some((p) => sameIdentity(r, p)))) {
        await tx.organization.update({ where: { id: args.orgId }, data: { managedByOrgId: null } });
        unlinked = true;
      }
    }
    return { email: target.email, unlinked };
  });
  console.log(
    `[${NS}] page ${args.orgId}: ${self ? `${result.email} left` : `removed ${result.email}`}${result.unlinked ? " — no longer managed by a Pro page" : ""}`,
  );
  return { ok: true };
}

/** The profiles among these that joined their page by accepting an invite. */
export async function joinedByInvite(profileIds: string[]) {
  if (!profileIds.length) return new Set<string>();
  const rows = await prisma.driftTourInvite.findMany({
    where: { acceptedByUserId: { in: profileIds } },
    select: { acceptedByUserId: true },
  });
  return new Set(rows.map((r) => r.acceptedByUserId).filter((v): v is string => !!v));
}

/** Every tour page this login can open (one profile each), for the header's page switcher
 *  and the Dashboard. `own` = a page it made itself (not joined by invite, not a Pro's
 *  client page); `home` = its first own page (else the first page it admins, else the
 *  first). Home first, then own pages, pages it joined, then client pages. */
export async function listIdentityPages(identity: { authUserId: string | null; email: string }) {
  const profiles: any[] = await dbService.findUsersForAuthIdentity(identity.authUserId || "", identity.email);
  const tour = profiles.filter((p) => p.view === "TOUR" && p.organization?.productLine === "TOUR");
  const managerIds = [
    ...new Set(tour.map((p) => p.organization.managedByOrgId as string | null).filter((v): v is string => !!v)),
  ];
  const managers = managerIds.length
    ? await prisma.organization.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } })
    : [];
  const managerName = new Map(managers.map((m) => [m.id, m.name]));
  const joined = await joinedByInvite(tour.map((p) => String(p.id)));
  const pages = tour.map((p) => ({
    ...pageRef(p.organization),
    profileId: p.id as string,
    role: memberRole(p),
    accountType: (p.organization.tourAccountType || "GENERAL") as string,
    managedBy: p.organization.managedByOrgId
      ? { id: p.organization.managedByOrgId as string, name: managerName.get(p.organization.managedByOrgId) ?? null }
      : null,
    own: !p.organization.managedByOrgId && !joined.has(p.id),
    home: false,
  }));
  const home =
    pages.find((p) => p.own) ?? pages.find((p) => p.role === "ADMIN" && !p.managedBy) ?? pages.find((p) => p.role === "ADMIN") ?? pages[0];
  if (home) home.home = true;
  const rank = (p: (typeof pages)[number]) => (p.home ? 0 : p.own ? 1 : p.managedBy ? 3 : 2);
  return pages.sort((a, b) => rank(a) - rank(b));
}
