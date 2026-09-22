import crypto from "node:crypto";
import { prisma } from "./database";
import { FlowError, flowPublicPath, pagePublicPath, relinkFlow, uniqueFlowSlug, type TourCredit } from "./driftFlows";
import { slugify } from "../routes/drift";

/**
 * The Drift channel (drift.li/tour/drift): drift.li's own tour page, where the team shows demos
 * and features tours made by creators. A superadmin saves a creator's tour to the channel's
 * library — a COPY (its own tour, drifts, pins and cover, reusing the same stored frames, so
 * nothing is re-built and the creator can edit or delete theirs freely) that lands in the
 * channel's Hidden Tours. Featuring it = unhiding it; the page's Featured Tours can be put in
 * order. Every saved tour remembers who made it (`settings.credit`), and its pathway credits
 * them ("Tour by …", top right). No schema change: the channel is the TOUR page with the
 * reserved slug "drift" (no one can sign up with it), created once from Admin → Tour.
 */

export const CHANNEL_SLUG = "drift";
export const CHANNEL_NAME = "Drift";
const NS = "drift-channel";

export const findChannel = () =>
  prisma.organization.findFirst({ where: { slug: CHANNEL_SLUG, productLine: "TOUR" }, select: { id: true, name: true, slug: true } });

/** The channel page, made the first time (its slug is reserved, so only this can take it). */
export async function ensureChannel() {
  const existing = await findChannel();
  if (existing) return existing;
  const taken = await prisma.organization.findFirst({ where: { slug: CHANNEL_SLUG }, select: { id: true, productLine: true } });
  if (taken) throw new FlowError(409, `The link "${CHANNEL_SLUG}" belongs to a ${taken.productLine || "non-tour"} account — free it before setting up the channel.`);
  const org = await prisma.organization.create({
    data: {
      name: CHANNEL_NAME,
      productLine: "TOUR",
      provisioningSource: "SELF_SERVE",
      routingDomain: "drift.li",
      slug: CHANNEL_SLUG,
      tenantPlan: "PAID",
      tourAccountType: "GENERAL",
      freeDrifts: 0,
    },
    select: { id: true, name: true, slug: true },
  });
  console.log(`[${NS}] channel page created (${org.id})`);
  return org;
}

/** The channel and what's on it, for the back office. */
export async function channelStatus() {
  const channel = await findChannel();
  if (!channel) return { channel: null, featured: 0, library: 0 };
  const [featured, library] = await Promise.all([
    prisma.driftFlow.count({ where: { organizationId: channel.id, kind: "TOUR", hidden: false } }),
    prisma.driftFlow.count({ where: { organizationId: channel.id, kind: "TOUR", hidden: true } }),
  ]);
  return { channel: { ...channel, path: pagePublicPath(CHANNEL_SLUG) }, featured, library };
}

/** Drop nulls, so Prisma's create takes the column defaults (and Json columns don't need JsonNull). */
const defined = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

/** Settings that belong to the original tour (its reels, unbranded link, owner report). */
const ORIGINAL_ONLY = ["reel", "reelFull", "reelLandscape", "unbrandedCode", "reportCode", "credit"];

/**
 * Copy a tour into the channel's library (Hidden Tours). Only finished drifts come along. Saving
 * the same tour again returns the copy already there.
 */
export async function saveToChannel(flowId: string, userId: string | null) {
  const src = await prisma.driftFlow.findUnique({
    where: { id: flowId },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      steps: { orderBy: { order: "asc" }, include: { product: { include: { spin: true, pins: true } } } },
    },
  });
  if (!src) throw new FlowError(404, "Tour not found");
  if (src.kind !== "TOUR") throw new FlowError(400, "Only tours can be saved to the channel");
  const channel = await ensureChannel();
  if (src.organizationId === channel.id) throw new FlowError(409, "This tour is already on the Drift channel");

  const already = await prisma.driftFlow.findFirst({
    where: { organizationId: channel.id, settings: { path: ["credit", "flowId"], equals: src.id } },
    select: { id: true, slug: true, name: true, hidden: true },
  });
  if (already) return { flow: { ...already, publicPath: flowPublicPath("TOUR", CHANNEL_SLUG, already.slug) }, existing: true };

  const viewable = src.steps.filter((s) => s.product && s.product.spin && (s.product.status === "READY" || s.product.status === "PUBLISHED"));
  if (!viewable.length) throw new FlowError(409, "This tour has no finished drifts to save yet");

  const slug = await uniqueFlowSlug("TOUR", src.name);
  // Drift links are unique per page: pick them up front (two drifts can share a name).
  const taken = new Set(
    (await prisma.driftProduct.findMany({ where: { organizationId: channel.id }, select: { slug: true } })).map((p) => p.slug),
  );
  const productSlug = (name: string) => {
    const base = slugify(name);
    let s = base;
    while (taken.has(s) || ["tour", "view", "memory", "path"].includes(s)) s = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    taken.add(s);
    return s;
  };

  const srcSettings = src.settings && typeof src.settings === "object" ? (src.settings as Record<string, unknown>) : {};
  const settings = {
    ...Object.fromEntries(Object.entries(srcSettings).filter(([k]) => !ORIGINAL_ONLY.includes(k))),
    credit: {
      flowId: src.id,
      pageId: src.organization.id,
      pageName: src.organization.name,
      pageSlug: src.organization.slug,
      savedAt: new Date().toISOString(),
    } satisfies TourCredit,
  };

  const copy = await prisma.$transaction(async (tx) => {
    const flow = await tx.driftFlow.create({
      data: {
        organizationId: channel.id,
        kind: "TOUR",
        slug,
        name: src.name,
        title: src.title,
        description: src.description,
        status: "PUBLISHED",
        hidden: true, // the library; unhide to feature it
        coverUrl: src.coverUrl,
        ...(src.endCta ? { endCta: src.endCta } : {}),
        settings,
        createdByUserId: userId,
        publishedAt: new Date(),
      },
      select: { id: true, slug: true, name: true, hidden: true },
    });
    let order = 0;
    for (const step of viewable) {
      const p = step.product!;
      const {
        id: _id,
        organizationId: _org,
        slug: _slug,
        createdAt: _c,
        updatedAt: _u,
        spin,
        pins,
        // the creator's own: pixel, billing and showcase flags stay with the original
        metaPixelId: _pixel,
        billingStatus: _billing,
        pendingVideoUrl: _pv,
        pendingFrameCount: _pf,
        orderId: _order,
        paidAt: _paid,
        hostingExpiresAt: _host,
        featured: _f,
        heroFeatured: _hf,
        featuredRank: _fr,
        createdByUserId: _by,
        ...rest
      } = p;
      const product = await tx.driftProduct.create({
        data: {
          ...defined(rest),
          organizationId: channel.id,
          slug: productSlug(p.name),
          billingStatus: "COMP",
          createdByUserId: userId,
          spin: {
            create: defined({
              frameCount: spin!.frameCount,
              manifest: spin!.manifest as any,
              secondFrameCount: spin!.secondFrameCount,
              secondManifest: spin!.secondManifest as any,
              status: spin!.status,
            }) as any,
          },
          pins: {
            create: pins.map(({ id: _pid, productId: _pp, createdAt: _pc, updatedAt: _pu, ...pin }) => defined(pin) as any),
          },
        } as any,
        select: { id: true },
      });
      await tx.driftFlowStep.create({
        data: { flowId: flow.id, stepType: "DRIFT", order: order++, productId: product.id, ...(step.customCta ? { customCta: step.customCta } : {}) },
      });
    }
    return flow;
  });
  // Home + the next drift's name, pointing at the channel's copy.
  await relinkFlow(prisma, copy.id);
  console.log(`[${NS}] saved tour ${src.id} ("${src.name}", ${src.organization.name}) → channel tour ${copy.id} (${viewable.length} drifts)`);
  return { flow: { ...copy, publicPath: flowPublicPath("TOUR", CHANNEL_SLUG, copy.slug) }, existing: false };
}
