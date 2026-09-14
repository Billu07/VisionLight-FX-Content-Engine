import { Router, Response } from "express";
import { prisma } from "../services/database";
import { authenticateToken, requireSuperAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { flowInclude, flowPublicPath, pagePublicPath, serializeFlow } from "../services/driftFlows";
import { DRIFT_PRICE_CENTS, formatMoney, stripeConfigured, stripeWebhookConfigured } from "../services/driftBilling";
import { parseAccountType } from "../services/driftTourAccounts";
import { sendWaitlistNoticeEmail } from "../services/mail";

// drift.li Tour v2 back office (TOUR_V2_PLAN.md P5): the superadmin's view of every
// tour page — owners, General / Pro, managing Pro, tours, drifts, payments — plus
// per-page limits, the public demo tour, checkout orders and the View / Memory / Path
// wait list (whose public "join" route lives here too, P6). Opening a page itself is
// the dashboard: a superadmin gets "Manage this page" there (X-Drift-Org).

const router = Router();
const NS = "drift-tour-admin";
const WAITLIST_PRODUCTS = ["VIEW", "MEMORY", "PATH"] as const;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const guard = [authenticateToken, requireSuperAdmin];

router.get("/api/drift/admin/tour/status", ...guard, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ payments: stripeConfigured(), webhook: stripeWebhookConfigured(), price: formatMoney(DRIFT_PRICE_CENTS) });
});

// Every tour page (search by name, link or an admin's email).
router.get("/api/drift/admin/tour/pages", ...guard, async (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || "").trim();
  const orgs = await prisma.organization.findMany({
    where: {
      productLine: "TOUR",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { users: { some: { email: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      slug: true,
      tourAccountType: true,
      managedByOrgId: true,
      freeDrifts: true,
      maxClipSeconds: true,
      createdAt: true,
      users: { select: { email: true }, orderBy: { createdAt: "asc" }, take: 3 },
      _count: { select: { driftFlows: true, driftProducts: true } },
    },
  });
  const ids = orgs.map((o) => o.id);
  const paid = ids.length
    ? await prisma.driftTourOrder.groupBy({
        by: ["organizationId"],
        where: { status: "PAID", organizationId: { in: ids } },
        _sum: { amountCents: true },
      })
    : [];
  const paidBy = new Map(paid.map((p) => [p.organizationId, p._sum.amountCents || 0]));
  const managerIds = [...new Set(orgs.map((o) => o.managedByOrgId).filter((v): v is string => !!v))];
  const managers = managerIds.length
    ? await prisma.organization.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } })
    : [];
  const managerName = new Map(managers.map((m) => [m.id, m.name]));
  res.json({
    pages: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      path: o.slug ? pagePublicPath(o.slug) : null,
      accountType: o.tourAccountType || "GENERAL",
      managedBy: o.managedByOrgId ? { id: o.managedByOrgId, name: managerName.get(o.managedByOrgId) || null } : null,
      freeDrifts: o.freeDrifts,
      maxClipSeconds: o.maxClipSeconds,
      createdAt: o.createdAt,
      admins: o.users.map((u) => u.email),
      tours: o._count.driftFlows,
      drifts: o._count.driftProducts,
      paid: formatMoney(paidBy.get(o.id) || 0),
    })),
  });
});

async function pageDetail(id: string) {
  const org = await prisma.organization.findFirst({
    where: { id, productLine: "TOUR" },
    select: {
      id: true,
      name: true,
      slug: true,
      tourAccountType: true,
      managedByOrgId: true,
      freeDrifts: true,
      maxClipSeconds: true,
      createdAt: true,
      users: { select: { id: true, email: true, name: true, role: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!org) return null;
  const [flows, orders, clientPages, manager, paid] = await Promise.all([
    prisma.driftFlow.findMany({
      where: { organizationId: org.id },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: flowInclude,
    }),
    prisma.driftTourOrder.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.organization.findMany({ where: { managedByOrgId: org.id }, select: { id: true, name: true, slug: true } }),
    org.managedByOrgId
      ? prisma.organization.findUnique({ where: { id: org.managedByOrgId }, select: { id: true, name: true, slug: true } })
      : null,
    prisma.driftTourOrder.aggregate({ where: { organizationId: org.id, status: "PAID" }, _sum: { amountCents: true } }),
  ]);
  const flowName = new Map(flows.map((f) => [f.id, f.name]));
  return {
    page: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      path: org.slug ? pagePublicPath(org.slug) : null,
      accountType: org.tourAccountType || "GENERAL",
      managedBy: manager ? { id: manager.id, name: manager.name, path: manager.slug ? pagePublicPath(manager.slug) : null } : null,
      freeDrifts: org.freeDrifts,
      maxClipSeconds: org.maxClipSeconds,
      createdAt: org.createdAt,
      paid: formatMoney(paid._sum.amountCents || 0),
    },
    users: org.users,
    flows: flows.map(serializeFlow).map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      isDemo: f.isDemo,
      hidden: f.hidden,
      publicPath: f.publicPath,
      thumb: f.thumb,
      counts: f.counts,
      updatedAt: f.updatedAt,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      quantity: o.quantity,
      amount: formatMoney(o.amountCents, o.currency),
      tour: o.flowId ? flowName.get(o.flowId) || null : null,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
    })),
    clientPages: clientPages.map((c) => ({ id: c.id, name: c.name, path: c.slug ? pagePublicPath(c.slug) : null })),
  };
}

router.get("/api/drift/admin/tour/pages/:id", ...guard, async (req: AuthenticatedRequest, res: Response) => {
  const detail = await pageDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Page not found" });
  res.json(detail);
});

// Limits + type: { freeDrifts?, maxClipSeconds?, accountType? }.
router.patch("/api/drift/admin/tour/pages/:id", ...guard, async (req: AuthenticatedRequest, res: Response) => {
  const org = await prisma.organization.findFirst({ where: { id: req.params.id, productLine: "TOUR" }, select: { id: true } });
  if (!org) return res.status(404).json({ error: "Page not found" });
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  if ("freeDrifts" in body) {
    const n = Math.floor(Number(body.freeDrifts));
    if (!Number.isFinite(n) || n < 0 || n > 1000) return res.status(400).json({ error: "Free drifts must be between 0 and 1000" });
    data.freeDrifts = n;
  }
  if ("maxClipSeconds" in body) {
    const n = Math.floor(Number(body.maxClipSeconds));
    if (!Number.isFinite(n) || n < 1 || n > 600) return res.status(400).json({ error: "Longest clip must be between 1 and 600 seconds" });
    data.maxClipSeconds = n;
  }
  if ("accountType" in body) {
    const t = parseAccountType(body.accountType);
    if (!t) return res.status(400).json({ error: "Account type must be General or Pro" });
    data.tourAccountType = t;
  }
  if (Object.keys(data).length) {
    await prisma.organization.update({ where: { id: org.id }, data });
    console.log(`[${NS}] ${req.user?.email} updated page ${org.id}: ${JSON.stringify(data)}`);
  }
  res.json(await pageDetail(org.id));
});

// The public demo tour: "Take a Tour" and every page's default "View Demo".
router.get("/api/drift/admin/tour/demo", ...guard, async (_req: AuthenticatedRequest, res: Response) => {
  const flows = await prisma.driftFlow.findMany({
    where: { kind: "TOUR", status: "PUBLISHED" },
    orderBy: [{ isDemo: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      slug: true,
      isDemo: true,
      updatedAt: true,
      organization: { select: { name: true, slug: true } },
      _count: { select: { steps: true } },
    },
  });
  res.json({
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      isDemo: f.isDemo,
      page: f.organization?.name || null,
      publicPath: flowPublicPath("TOUR", f.organization?.slug, f.slug),
      drifts: f._count.steps,
      updatedAt: f.updatedAt,
    })),
  });
});

// Exactly one demo (or none): { flowId | null }.
router.put("/api/drift/admin/tour/demo", ...guard, async (req: AuthenticatedRequest, res: Response) => {
  const flowId = req.body?.flowId ? String(req.body.flowId) : null;
  if (flowId) {
    const f = await prisma.driftFlow.findFirst({ where: { id: flowId, kind: "TOUR" }, select: { id: true } });
    if (!f) return res.status(404).json({ error: "Tour not found" });
  }
  await prisma.$transaction(async (tx) => {
    await tx.driftFlow.updateMany({
      where: { kind: "TOUR", isDemo: true, ...(flowId ? { NOT: { id: flowId } } : {}) },
      data: { isDemo: false },
    });
    if (flowId) await tx.driftFlow.update({ where: { id: flowId }, data: { isDemo: true } });
  });
  console.log(`[${NS}] ${req.user?.email} set the demo tour to ${flowId || "none"}`);
  res.json({ ok: true, flowId });
});

// Checkout orders, newest first.
router.get("/api/drift/admin/tour/orders", ...guard, async (_req: AuthenticatedRequest, res: Response) => {
  const orders = await prisma.driftTourOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { organization: { select: { name: true, slug: true } } },
  });
  const flowIds = [...new Set(orders.map((o) => o.flowId).filter((v): v is string => !!v))];
  const flows = flowIds.length
    ? await prisma.driftFlow.findMany({
        where: { id: { in: flowIds } },
        select: { id: true, name: true, slug: true, kind: true, organization: { select: { slug: true } } },
      })
    : [];
  const flowById = new Map(flows.map((f) => [f.id, f]));
  res.json({
    orders: orders.map((o) => {
      const f = o.flowId ? flowById.get(o.flowId) : undefined;
      return {
        id: o.id,
        status: o.status,
        quantity: o.quantity,
        amount: formatMoney(o.amountCents, o.currency),
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        page: o.organization?.name || null,
        pagePath: o.organization?.slug ? pagePublicPath(o.organization.slug) : null,
        tour: f?.name || null,
        tourPath: f ? flowPublicPath(f.kind, f.organization?.slug, f.slug) : null,
      };
    }),
  });
});

// The View / Memory / Path wait list.
router.get("/api/drift/admin/waitlist", ...guard, async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await prisma.driftWaitlist.findMany({ orderBy: { createdAt: "desc" }, take: 2000 });
  const counts: Record<string, number> = { VIEW: 0, MEMORY: 0, PATH: 0 };
  for (const r of rows) counts[r.product] = (counts[r.product] || 0) + 1;
  res.json({ entries: rows, counts });
});

// Public: "Join Wait List" on the drift.li home.
router.post("/api/drift/public/waitlist", async (req: AuthenticatedRequest, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 254);
  const product = String(req.body?.product || "").trim().toUpperCase();
  if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (!(WAITLIST_PRODUCTS as readonly string[]).includes(product)) return res.status(400).json({ error: "Unknown wait list" });
  const source = String(req.body?.source || "").trim().slice(0, 60) || null;
  const existing = await prisma.driftWaitlist.findUnique({ where: { email_product: { email, product } }, select: { id: true } });
  if (!existing) {
    try {
      await prisma.driftWaitlist.create({ data: { email, product, source } });
    } catch (err: any) {
      // A double-submit beat us to the (email, product) row — they're on the list.
      if (err?.code === "P2002") return res.json({ ok: true, already: true });
      throw err;
    }
    void sendWaitlistNoticeEmail({ email, product }).catch((err) => console.error(`[${NS}] wait list notice failed:`, err));
  }
  res.json({ ok: true, already: !!existing });
});

export default router;
