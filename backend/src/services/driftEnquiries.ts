import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./database";
import { FlowError, pagePublicPath } from "./driftFlows";
import { sendTourEnquiryEmail } from "./mail";
import { enquirySettingsOf } from "./tourEnquirySettings";

/**
 * Tour enquiries and personal links (TOUR_V2_PLAN.md, phase "Enquiries + personal links").
 * - Enquiries: a page's enquiry button sends { name, email, phone?, message? } with the
 *   tour / drift / personal link it came from. Stored as a DriftLead (formId null,
 *   source.kind "TOUR_ENQUIRY") and emailed to the page's Admins and Editors (reply-to =
 *   the visitor).
 * - Personal links: one link per person for a tour (…?to={token}). Opening it counts an
 *   open; the player tags that visit's drift views with the token (DriftEvent meta.link),
 *   so the team sees how much the person explored; their enquiries carry the link.
 */

const NS = "drift-enquiries";
const APP_URL = (process.env.DRIFT_APP_URL || "https://drift.li").replace(/\/+$/, "");
const ENQUIRY_KIND = "TOUR_ENQUIRY";

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

// ── rate limit: a few enquiries per visitor per page, in memory (single box) ──
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
function allow(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return true;
}

/** Who hears about an enquiry: the page's Admins and Editors (not Viewers). */
async function teamEmails(orgId: string) {
  const users = await prisma.user.findMany({ where: { organizationId: orgId }, select: { email: true, tourRole: true } });
  return [...new Set(users.filter((u) => (u.tourRole || "ADMIN") !== "VIEWER").map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
}

export async function submitEnquiry(
  org: { id: string; name: string; slug: string | null; tourSettings: unknown },
  input: { body: unknown; ip: string; referrer: string | null; ua: string | null },
) {
  const settings = enquirySettingsOf(org.tourSettings);
  if (!settings.enabled) throw new FlowError(404, "This page isn't taking enquiries right now");
  const b = (input.body && typeof input.body === "object" ? input.body : {}) as Record<string, unknown>;
  // A filled honeypot is a bot: pretend it worked, store nothing.
  if (text(b.website, 200)) return { ok: true as const };
  if (!allow(`${input.ip}|${org.id}`)) throw new FlowError(429, "That's a lot of messages — please try again in a few minutes.");

  const name = text(b.name, 80);
  const email = text(b.email, 160).toLowerCase();
  const phone = text(b.phone, 40);
  const message = text(b.message, 2000);
  if (!name) throw new FlowError(400, "Please add your name");
  if (!isEmail(email)) throw new FlowError(400, "Please add a valid email address");

  // Where it came from — each has to belong to this page.
  const flowId = text(b.flowId, 60);
  const productId = text(b.productId, 60);
  const token = text(b.link, 40).toLowerCase();
  const [flow, product, link] = await Promise.all([
    flowId ? prisma.driftFlow.findFirst({ where: { id: flowId, organizationId: org.id }, select: { id: true, name: true, title: true } }) : null,
    productId ? prisma.driftProduct.findFirst({ where: { id: productId, organizationId: org.id }, select: { id: true, name: true } }) : null,
    token ? prisma.driftShareLink.findFirst({ where: { token, organizationId: org.id }, select: { id: true, label: true } }) : null,
  ]);

  const data = { name, email, ...(phone ? { phone } : {}), ...(message ? { message } : {}) };
  // Sent from the page's contact button (no link of its own) rather than its enquiry button.
  const button = b.via === "contact" ? `Contact ${org.name}` : settings.label;
  const tour = flow ? flow.title || flow.name : null;
  const source = {
    kind: ENQUIRY_KIND,
    button,
    flowId: flow?.id ?? null,
    tour,
    drift: product?.name ?? null,
    linkId: link?.id ?? null,
    via: link?.label ?? null,
    referrer: input.referrer,
    ua: input.ua,
  };
  const lead = await prisma.driftLead.create({
    data: { organizationId: org.id, formId: null, productId: product?.id ?? null, data, source },
  });
  console.log(`[${NS}] page ${org.id}: enquiry ${lead.id}${link ? ` via link ${link.id}` : ""}`);

  void (async () => {
    await sendTourEnquiryEmail({
      to: await teamEmails(org.id),
      pageName: org.name,
      button,
      name,
      email,
      phone: phone || null,
      message: message || null,
      tour,
      drift: product?.name ?? null,
      via: link?.label ?? null,
      url: `${APP_URL}${org.slug ? pagePublicPath(org.slug) : "/tour"}?enquiries=1`,
    });
  })().catch((err) => console.error(`[${NS}] enquiry email failed for ${lead.id}:`, err));
  return { ok: true as const };
}

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function listEnquiries(orgId: string) {
  const rows = await prisma.driftLead.findMany({
    where: { organizationId: orgId, formId: null, source: { path: ["kind"], equals: ENQUIRY_KIND } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((l) => {
    const d = obj(l.data);
    const s = obj(l.source);
    return {
      id: l.id,
      name: str(d.name),
      email: str(d.email),
      phone: str(d.phone) || null,
      message: str(d.message) || null,
      button: str(s.button) || null,
      tour: str(s.tour) || null,
      drift: str(s.drift) || null,
      via: str(s.via) || null,
      createdAt: l.createdAt,
    };
  });
}

export async function deleteEnquiry(orgId: string, id: string) {
  const r = await prisma.driftLead.deleteMany({
    where: { id, organizationId: orgId, formId: null, source: { path: ["kind"], equals: ENQUIRY_KIND } },
  });
  if (!r.count) throw new FlowError(404, "Enquiry not found");
}

// ───────────────────────────── personal links ─────────────────────────────

const TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no l / 0 / 1: easy to read aloud
const TOKEN_LENGTH = 10;
const MAX_LINKS_PER_FLOW = 200;
const newToken = () => Array.from(crypto.randomBytes(TOKEN_LENGTH), (x) => TOKEN_ALPHABET[x % TOKEN_ALPHABET.length]).join("");
const isToken = (t: string) => /^[a-z0-9]{6,20}$/.test(t);

export async function createShareLink(args: { orgId: string; flowId: string; label: unknown; userId: string | null }) {
  const label = text(args.label, 60);
  if (!label) throw new FlowError(400, "Who is this link for?");
  const flow = await prisma.driftFlow.findFirst({ where: { id: args.flowId, organizationId: args.orgId }, select: { id: true } });
  if (!flow) throw new FlowError(404, "Flow not found");
  if ((await prisma.driftShareLink.count({ where: { flowId: flow.id } })) >= MAX_LINKS_PER_FLOW) {
    throw new FlowError(409, "This tour has as many personal links as it can hold — remove a few first.");
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.driftShareLink.create({
        data: { organizationId: args.orgId, flowId: flow.id, token: newToken(), label, createdByUserId: args.userId },
        select: { id: true, label: true, token: true },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }
  throw new FlowError(500, "We couldn't create that link — please try again.");
}

export async function listShareLinks(orgId: string, flowId: string) {
  const flow = await prisma.driftFlow.findFirst({
    where: { id: flowId, organizationId: orgId },
    select: { id: true, steps: { select: { product: { select: { status: true } } } } },
  });
  if (!flow) throw new FlowError(404, "Flow not found");
  const links = await prisma.driftShareLink.findMany({ where: { flowId: flow.id }, orderBy: { createdAt: "desc" } });
  const drifts = flow.steps.filter((s) => s.product && (s.product.status === "READY" || s.product.status === "PUBLISHED")).length;
  const seen = new Map<string, number>();
  const enquiries = new Map<string, number>();
  if (links.length) {
    const viewRows = await prisma.$queryRaw<{ token: string; drifts: bigint }[]>`
      SELECT meta->>'link' AS token, COUNT(DISTINCT "productId") AS drifts
      FROM "DriftEvent"
      WHERE "organizationId" = ${orgId} AND type = 'VIEW' AND meta->>'link' IN (${Prisma.join(links.map((l) => l.token))})
      GROUP BY 1`;
    for (const r of viewRows) seen.set(r.token, Number(r.drifts));
    const leadRows = await prisma.$queryRaw<{ linkId: string; n: bigint }[]>`
      SELECT source->>'linkId' AS "linkId", COUNT(*) AS n
      FROM "DriftLead"
      WHERE "organizationId" = ${orgId} AND source->>'linkId' IN (${Prisma.join(links.map((l) => l.id))})
      GROUP BY 1`;
    for (const r of leadRows) enquiries.set(r.linkId, Number(r.n));
  }
  return links.map((l) => ({
    id: l.id,
    label: l.label,
    token: l.token,
    opens: l.opens,
    firstOpenedAt: l.firstOpenedAt,
    lastOpenedAt: l.lastOpenedAt,
    driftsSeen: Math.min(drifts, seen.get(l.token) || 0),
    drifts,
    enquiries: enquiries.get(l.id) || 0,
    createdAt: l.createdAt,
  }));
}

export async function deleteShareLink(orgId: string, flowId: string, linkId: string) {
  const r = await prisma.driftShareLink.deleteMany({ where: { id: linkId, flowId, organizationId: orgId } });
  if (!r.count) throw new FlowError(404, "Link not found");
}

/** A visit through a personal link: count the open (the player sends it once per visit).
 *  null for an unknown link — the tour still opens as a normal link. */
export async function openShareLink(rawToken: string) {
  const token = text(rawToken, 40).toLowerCase();
  if (!isToken(token)) return null;
  const link = await prisma.driftShareLink.findUnique({ where: { token }, select: { id: true, flowId: true, firstOpenedAt: true } });
  if (!link) return null;
  const now = new Date();
  await prisma.driftShareLink.update({
    where: { id: link.id },
    data: { opens: { increment: 1 }, lastOpenedAt: now, ...(link.firstOpenedAt ? {} : { firstOpenedAt: now }) },
  });
  return { flowId: link.flowId };
}
