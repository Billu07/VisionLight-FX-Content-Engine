import { prisma } from "./database";

/**
 * Promo codes for the Try It Free sign-up (client, 2026-10-15).
 *
 * "I plan to setup a Betatester20 code. So it would add 17 to the regular 3." — the admin thinks
 * in TOTALS, which is what the code's name says out loud, so `freeDrifts` on a code IS the total
 * the page ends up with (20), not a top-up (17). The back office says both, so neither reading
 * can be wrong at the point of typing it in.
 *
 * A code never takes drifts away: redeeming sets `Organization.freeDrifts` to the LARGER of what
 * the page already has and what the code gives. A page invited with a hand-set allowance keeps
 * it if the code would be stingier.
 *
 * Expiry, a use limit and an on/off switch are all optional and all independent — "being able to
 * set codes with expiry in the tour backend would be very helpful for marketing".
 */

const NS = "drift-promo";

/** The default every self-serve page starts with (schema: Organization.freeDrifts). */
export const DEFAULT_FREE_DRIFTS = 3;

/** Codes are typed by hand off a flyer or an email, so case and stray spaces cannot matter. */
export const normalizeCode = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, 40);

export type PromoCheck =
  | { ok: true; code: string; freeDrifts: number; extra: number; note: string | null }
  | { ok: false; reason: string };

/** Is this code good right now? The same test the sign-up form and the redemption both run. */
export async function checkPromoCode(raw: unknown, now = new Date()): Promise<PromoCheck> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: "Enter a promo code" };
  const row = await prisma.driftPromoCode.findUnique({ where: { code } });
  if (!row || !row.active) return { ok: false, reason: "That code isn't valid" };
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "That code has expired" };
  if (row.maxUses !== null && row.uses >= row.maxUses) return { ok: false, reason: "That code has been fully used" };
  return {
    ok: true,
    code: row.code,
    freeDrifts: row.freeDrifts,
    extra: Math.max(0, row.freeDrifts - DEFAULT_FREE_DRIFTS),
    note: row.note,
  };
}

/**
 * Apply a code to a page that has just been created. Returns what it gave, or null when the code
 * was not usable — a sign-up is never failed over a promo code: they have their account either
 * way, and losing it over a typo would be the worst possible moment to be strict.
 *
 * Everything that counts happens in ONE transaction, and the use limit is enforced by a
 * conditional update rather than a read-then-write: two people redeeming the last use of a code
 * at the same moment would both pass a check and both write.
 */
export async function redeemPromoCode(
  raw: unknown,
  organizationId: string,
  email?: string | null,
): Promise<{ code: string; freeDrifts: number } | null> {
  const code = normalizeCode(raw);
  if (!code || !organizationId) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.driftPromoCode.findUnique({ where: { code } });
      if (!row || !row.active) return null;
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

      // Claim a use. The condition is the LIMIT, nothing else: Postgres re-evaluates an
      // UPDATE's WHERE after it waits for the row lock, so a racing redemption of the last use
      // sees `uses` already at the limit, updates 0 rows and stands down. Pinning `uses` to the
      // value we read as well would be belt and braces on a limited code and plain wrong on an
      // unlimited one — two people signing up at the same second would collide and one would
      // lose a code that has no limit to run out of (caught by the probe, 2026-10-15).
      const claimed = await tx.driftPromoCode.updateMany({
        where: { id: row.id, ...(row.maxUses !== null ? { uses: { lt: row.maxUses } } : {}) },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;

      await tx.driftPromoRedemption.create({
        data: { codeId: row.id, organizationId, email: email || null, freeDrifts: row.freeDrifts },
      });
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { freeDrifts: true },
      });
      // Never downward: a page with a hand-set allowance keeps it.
      const next = Math.max(org?.freeDrifts ?? DEFAULT_FREE_DRIFTS, row.freeDrifts);
      await tx.organization.update({ where: { id: organizationId }, data: { freeDrifts: next } });
      return { code: row.code, freeDrifts: next };
    });
  } catch (err: any) {
    // A page redeeming the same code twice trips the (codeId, organizationId) unique — that is
    // not an error worth surfacing, they already have it.
    if (err?.code !== "P2002") console.error(`[${NS}] redeem failed:`, err);
    return null;
  }
}

/** The back office's list: every code with how much of it is left and who has used it. */
export async function listPromoCodes() {
  const rows = await prisma.driftPromoCode.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, email: true, createdAt: true, organizationId: true, freeDrifts: true },
      },
    },
  });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    freeDrifts: r.freeDrifts,
    extra: Math.max(0, r.freeDrifts - DEFAULT_FREE_DRIFTS),
    note: r.note,
    expiresAt: r.expiresAt,
    maxUses: r.maxUses,
    uses: r.uses,
    active: r.active,
    expired: !!r.expiresAt && r.expiresAt.getTime() <= now,
    usedUp: r.maxUses !== null && r.uses >= r.maxUses,
    createdAt: r.createdAt,
    redemptions: r.redemptions,
  }));
}
