import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Request, Response } from "express";
import Stripe from "stripe";
import { prisma } from "./database";
import { uploadManagedBuffer } from "../utils/managedStorage";
import { processClip } from "../routes/drift";
import { FlowError, flowPublicPath } from "./driftFlows";
import { sendTourOrderPaidEmails } from "./mail";

// drift.li Tour v2 billing (TOUR_V2_PLAN.md P3): pay per drift. A page's first
// `Organization.freeDrifts` drifts are free; every drift after that is uploaded, kept
// (the clip is stored), and only converted once a Stripe Checkout for it is paid.
// Superadmins are COMP. Fulfilment is idempotent and runs from the webhook AND from
// the return page (whichever lands first), so a slow or missing webhook never strands
// a paid drift.
//
// Env (server only):
//   STRIPE_SECRET_KEY=sk_live_…          ← required to take payments
//   STRIPE_WEBHOOK_SECRET=whsec_…        ← required for the webhook (checkout.session.completed)
//   TOUR_DRIFT_PRICE_CENTS=650           ← optional (default $6.50)
//   TOUR_CURRENCY=usd                    ← optional
//   DRIFT_APP_URL=https://drift.li       ← where Checkout returns to

const NS = "drift-billing";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
export const DRIFT_PRICE_CENTS = Math.max(50, Math.round(Number(process.env.TOUR_DRIFT_PRICE_CENTS) || 650));
export const DRIFT_CURRENCY = (process.env.TOUR_CURRENCY || "usd").trim().toLowerCase();
export const HOSTING_DAYS = 365;
const APP_URL = (process.env.DRIFT_APP_URL || "https://drift.li").replace(/\/+$/, "");

export const stripeConfigured = () => !!STRIPE_SECRET_KEY;
export const stripeWebhookConfigured = () => !!STRIPE_WEBHOOK_SECRET;

let client: Stripe | null = null;
const stripe = (): Stripe => {
  if (!client) client = new Stripe(STRIPE_SECRET_KEY);
  return client;
};

export const formatMoney = (cents: number, currency = DRIFT_CURRENCY) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
};

const longDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** What the builder shows: free drifts left, the price, whether checkout is on. */
export async function billingSummary(orgId: string, unlimited: boolean) {
  const [org, usedFreeDrifts] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { freeDrifts: true } }),
    prisma.driftProduct.count({ where: { organizationId: orgId, billingStatus: "FREE", flowStep: { isNot: null } } }),
  ]);
  const freeDrifts = org?.freeDrifts ?? 3;
  return {
    unlimited,
    freeDrifts,
    usedFreeDrifts,
    freeLeft: unlimited ? null : Math.max(0, freeDrifts - usedFreeDrifts),
    priceCents: DRIFT_PRICE_CENTS,
    currency: DRIFT_CURRENCY,
    price: formatMoney(DRIFT_PRICE_CENTS),
    hostingDays: HOSTING_DAYS,
    paymentsEnabled: stripeConfigured(),
  };
}

/** Keep an unpaid drift's clip until checkout (nothing is converted before payment).
 *  false → the drift was paid meanwhile; it keeps (and builds) the clip it was paid with. */
export async function storePendingClip(args: {
  productId: string;
  orgId: string;
  file: { path: string; mimetype?: string };
  frameCount: number;
}) {
  const buffer = await fs.readFile(args.file.path);
  const url = await uploadManagedBuffer({
    buffer,
    contentType: args.file.mimetype || "video/mp4",
    keyPrefix: `drift/org_${args.orgId}/pending/product_${args.productId}`,
    fallbackExtension: "mp4",
  });
  const { count } = await prisma.driftProduct.updateMany({
    where: { id: args.productId, billingStatus: "AWAITING_PAYMENT" },
    data: { pendingVideoUrl: url, pendingFrameCount: args.frameCount },
  });
  if (!count) {
    console.warn(`[${NS}] product ${args.productId} was paid while a new clip uploaded — kept the paid clip`);
    return false;
  }
  console.log(`[${NS}] product ${args.productId} clip stored, waiting for checkout`);
  return true;
}

// Checkout returns to the site it was opened from when that's drift.li (or a local
// dev server); anything else goes back to DRIFT_APP_URL.
const returnOrigin = (origin: unknown): string => {
  const o = typeof origin === "string" ? origin.trim().replace(/\/+$/, "") : "";
  if (/^https:\/\/(www\.)?drift\.li$/i.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)) return o;
  return APP_URL;
};

type CheckoutArgs = {
  orgId: string;
  flowId: string;
  userId: string | null;
  email: string | null;
  origin?: unknown;
};

// One checkout at a time per tour in this process, so a double-click can't open two
// sessions for the same drifts (the paid-session check below covers the rest).
const checkoutQueues = new Map<string, Promise<unknown>>();

/** Open a Stripe Checkout for every drift of a flow that's waiting for payment. */
export async function createFlowCheckout(args: CheckoutArgs) {
  const prev = checkoutQueues.get(args.flowId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => openFlowCheckout(args));
  const tail = run.catch(() => undefined);
  checkoutQueues.set(args.flowId, tail);
  try {
    return await run;
  } finally {
    if (checkoutQueues.get(args.flowId) === tail) checkoutQueues.delete(args.flowId);
  }
}

async function openFlowCheckout(args: CheckoutArgs) {
  if (!stripeConfigured()) {
    throw new FlowError(503, "Checkout isn't switched on yet — contact us and we'll activate paid drifts for you.", {
      code: "PAYMENTS_OFF",
    });
  }
  const owned = await prisma.driftFlow.findFirst({
    where: { id: args.flowId, organizationId: args.orgId },
    select: { id: true },
  });
  if (!owned) throw new FlowError(404, "Tour not found");

  // One open checkout per tour, so nobody pays twice for the same drifts. A session that
  // can't be expired is looked up: paid → settle it now (its drifts stop being due);
  // still clearing → stop here instead of opening a second one.
  let settled = false;
  const open = await prisma.driftTourOrder.findMany({
    where: { flowId: owned.id, organizationId: args.orgId, status: "PENDING", stripeSessionId: { not: null } },
    select: { id: true, stripeSessionId: true },
  });
  for (const o of open) {
    const sessionId = o.stripeSessionId as string;
    try {
      await stripe().checkout.sessions.expire(sessionId);
      await prisma.driftTourOrder.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
    } catch {
      const s = await stripe().checkout.sessions.retrieve(sessionId).catch(() => null);
      if (s?.status === "expired") {
        await prisma.driftTourOrder.updateMany({ where: { id: o.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      } else if (s?.status === "complete" && s.payment_status === "paid") {
        await fulfillSession(s);
        settled = true;
      } else if (s?.status === "complete") {
        throw new FlowError(409, "A payment for this tour is still going through — give it a minute, then refresh.", {
          code: "CHECKOUT_IN_PROGRESS",
        });
      } else {
        throw new FlowError(502, "We couldn't open checkout just now. Please try again in a moment.");
      }
    }
  }

  const flow = await prisma.driftFlow.findFirst({
    where: { id: args.flowId, organizationId: args.orgId },
    select: {
      id: true,
      kind: true,
      slug: true,
      name: true,
      organization: { select: { slug: true } },
      steps: {
        orderBy: { order: "asc" },
        select: { product: { select: { id: true, billingStatus: true, pendingVideoUrl: true } } },
      },
    },
  });
  if (!flow) throw new FlowError(404, "Tour not found");
  const due = flow.steps
    .map((s) => s.product)
    .filter((p): p is NonNullable<typeof p> => !!p && p.billingStatus === "AWAITING_PAYMENT" && !!p.pendingVideoUrl);
  if (!due.length) {
    throw settled
      ? new FlowError(409, "Your earlier payment went through — those drifts are converting now.", { code: "ALREADY_PAID" })
      : new FlowError(409, "Nothing to check out — every drift in this tour is already paid for.");
  }

  const quantity = due.length;
  const order = await prisma.driftTourOrder.create({
    data: {
      organizationId: args.orgId,
      userId: args.userId,
      flowId: flow.id,
      quantity,
      unitAmountCents: DRIFT_PRICE_CENTS,
      amountCents: DRIFT_PRICE_CENTS * quantity,
      currency: DRIFT_CURRENCY,
      status: "PENDING",
      productIds: due.map((p) => p.id),
    },
  });

  const back = `${returnOrigin(args.origin)}${flowPublicPath(flow.kind, flow.organization?.slug, flow.slug)}`;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity,
          price_data: {
            currency: DRIFT_CURRENCY,
            unit_amount: DRIFT_PRICE_CENTS,
            product_data: {
              name: "Drift — conversion + 1 year of hosting",
              description: `${flow.name} · ${quantity} drift${quantity === 1 ? "" : "s"}`,
            },
          },
        },
      ],
      success_url: `${back}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}?checkout=cancel`,
      customer_email: args.email || undefined,
      client_reference_id: order.id,
      metadata: { orderId: order.id, organizationId: args.orgId, flowId: flow.id },
      payment_intent_data: { metadata: { orderId: order.id, flowId: flow.id } },
    });
  } catch (err: any) {
    await prisma.driftTourOrder.update({ where: { id: order.id }, data: { status: "CANCELED" } }).catch(() => undefined);
    console.error(`[${NS}] checkout session failed for flow ${flow.id}:`, err?.message || err);
    throw new FlowError(502, "We couldn't open checkout just now. Please try again in a moment.");
  }
  await prisma.driftTourOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
  console.log(`[${NS}] order ${order.id}: checkout for ${quantity} drift(s) on flow ${flow.id}`);
  return {
    url: session.url,
    orderId: order.id,
    quantity,
    amountCents: order.amountCents,
    amount: formatMoney(order.amountCents),
    currency: DRIFT_CURRENCY,
  };
}

// A paid clip is fetched back from storage — a network blip shouldn't fail a paid drift.
async function downloadClip(url: string, attempts = 3): Promise<Buffer> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`clip download ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      last = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw last;
}

/** Convert a paid drift from its stored clip (fetch → temp file → the normal pipeline). */
async function startPaidProcessing(p: {
  id: string;
  organizationId: string;
  pendingVideoUrl: string | null;
  pendingFrameCount: number | null;
  createdByUserId: string | null;
}) {
  try {
    if (!p.pendingVideoUrl) throw new Error("no stored clip");
    const buffer = await downloadClip(p.pendingVideoUrl);
    const tmp = path.join(os.tmpdir(), `drift-paid-${crypto.randomUUID()}.mp4`);
    await fs.writeFile(tmp, buffer);
    processClip({
      clip: "A",
      productId: p.id,
      orgId: p.organizationId,
      videoPath: tmp,
      mimetype: /\.mov($|\?)/i.test(p.pendingVideoUrl) ? "video/quicktime" : "video/mp4",
      uploaderId: p.createdByUserId,
      frameCount: p.pendingFrameCount || 180,
      removal: "none",
    });
  } catch (err) {
    console.error(`[${NS}] product ${p.id} is paid but couldn't start converting:`, err);
    await prisma.driftProduct.update({ where: { id: p.id }, data: { status: "FAILED" } }).catch(() => undefined);
  }
}

/** Boot: a paid drift whose conversion was cut off (deploy / restart) goes back through
 *  the pipeline from its stored clip instead of being left FAILED. Matches the drifts
 *  recoverOrphanedDriftJobs (routes/drift.ts) leaves alone. */
export async function resumePaidDrifts() {
  const stuck = await prisma.driftProduct.findMany({
    where: { status: "PROCESSING", billingStatus: "PAID", pendingVideoUrl: { not: null }, spin: { is: null } },
    select: { id: true, organizationId: true, pendingVideoUrl: true, pendingFrameCount: true, createdByUserId: true },
  });
  for (const p of stuck) void startPaidProcessing(p);
  if (stuck.length) console.log(`[${NS}] boot: resumed converting ${stuck.length} paid drift(s)`);
}

/** Mark a paid session's order + drifts paid (once) and start converting them. */
async function fulfillSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId || session.client_reference_id || null;
  if (!orderId) return { status: "unknown" as const, orderId: null, started: 0 };
  if (session.payment_status !== "paid") return { status: "unpaid" as const, orderId, started: 0 };

  const now = new Date();
  const expires = new Date(now.getTime() + HOSTING_DAYS * 24 * 60 * 60 * 1000);
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DriftTourOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.driftTourOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status === "PAID") return null;
    const ids = Array.isArray(order.productIds) ? (order.productIds as unknown[]).map(String) : [];
    await tx.driftTourOrder.update({
      where: { id: orderId },
      data: { status: "PAID", paidAt: now, stripeSessionId: session.id, stripePaymentIntentId: paymentIntent },
    });
    const products = await tx.driftProduct.findMany({
      where: { id: { in: ids }, billingStatus: "AWAITING_PAYMENT" },
      select: { id: true, organizationId: true, pendingVideoUrl: true, pendingFrameCount: true, createdByUserId: true },
    });
    if (products.length) {
      await tx.driftProduct.updateMany({
        where: { id: { in: products.map((p) => p.id) } },
        data: { billingStatus: "PAID", paidAt: now, hostingExpiresAt: expires, orderId, status: "PROCESSING" },
      });
    }
    if (ids.length && products.length < ids.length) {
      // Paid for drifts that were deleted (or already paid) in the meantime — money to hand back.
      console.error(
        `[${NS}] order ${orderId}: ${ids.length - products.length} of ${ids.length} drift(s) were removed or already paid before payment — review for a refund`,
      );
    }
    return { order, products };
  });
  if (!result) return { status: "paid" as const, orderId, started: 0 };

  for (const p of result.products) void startPaidProcessing(p);
  console.log(`[${NS}] order ${orderId} PAID — converting ${result.products.length} drift(s)`);
  void notifyPaid(result.order, result.products.length, expires).catch((err) =>
    console.error(`[${NS}] paid emails failed for ${orderId}:`, err),
  );
  return { status: "paid" as const, orderId, started: result.products.length };
}

async function notifyPaid(order: { userId: string | null; flowId: string | null; amountCents: number; currency: string }, quantity: number, expires: Date) {
  const [user, flow] = await Promise.all([
    order.userId ? prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, name: true } }) : null,
    order.flowId
      ? prisma.driftFlow.findUnique({
          where: { id: order.flowId },
          select: { kind: true, slug: true, name: true, organization: { select: { slug: true } } },
        })
      : null,
  ]);
  await sendTourOrderPaidEmails({
    buyerEmail: user?.email ?? null,
    buyerName: user?.name ?? null,
    flowName: flow?.name || "your tour",
    quantity,
    amount: formatMoney(order.amountCents, order.currency),
    url: flow ? `${APP_URL}${flowPublicPath(flow.kind, flow.organization?.slug, flow.slug)}` : APP_URL,
    hostedUntil: longDate(expires),
  });
}

/** The return page: confirm a session straight away (idempotent with the webhook). */
export async function confirmCheckoutSession(sessionId: string, orgId: string) {
  if (!stripeConfigured()) throw new FlowError(503, "Checkout isn't switched on yet.", { code: "PAYMENTS_OFF" });
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new FlowError(400, "That checkout link isn't valid.");
  const order = await prisma.driftTourOrder.findFirst({
    where: { stripeSessionId: sessionId, organizationId: orgId },
    select: { id: true, status: true },
  });
  if (!order) throw new FlowError(404, "Checkout not found");
  if (order.status === "PAID") return { status: "paid" as const, orderId: order.id, started: 0 };
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return fulfillSession(session);
}

/** POST /api/drift/billing/webhook — mounted with express.raw() BEFORE express.json(). */
export async function handleStripeWebhook(req: Request, res: Response) {
  if (!stripeConfigured() || !stripeWebhookConfigured()) {
    res.status(503).send("Stripe isn't configured");
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(req.body as Buffer, String(req.headers["stripe-signature"] || ""), STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.warn(`[${NS}] webhook signature check failed: ${err?.message || err}`);
    res.status(400).send("Invalid signature");
    return;
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfillSession(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      await prisma.driftTourOrder.updateMany({ where: { stripeSessionId: s.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[${NS}] webhook ${event.type} failed:`, err);
    res.status(500).send("Webhook handler failed");
  }
}
