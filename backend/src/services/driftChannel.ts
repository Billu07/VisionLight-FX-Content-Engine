import { prisma } from "./database";
import {
  FlowError,
  driftPublicPath,
  flowInclude,
  flowPublicPath,
  pagePublicPath,
  uniqueFlowSlug,
  type TourCredit,
} from "./driftFlows";

/**
 * The Drift channel (drift.li/tour/drift): drift.li's own tour page, where the team shows demos
 * and features tours made by creators. A superadmin saves a creator's tour to the channel's
 * library, which lands in Hidden Tours; featuring it = unhiding it, and the page's Featured
 * Tours can be put in order. Every entry remembers who made it (`settings.credit`) and its
 * pathway credits them ("Captured by …", top right).
 *
 * An entry POINTS at the creator's tour (`settings.featureOf`) rather than copying it, so an
 * edit to the original shows on the channel the moment it is made — copies went stale and
 * nothing could tell you (client, 2026-09-25). A feature is presented by MERGING the two rows:
 * the source's content wearing the channel's identity. The merged object is flow-shaped, and
 * `serializeFlow` builds every path from the flow's own org and slug, so the existing
 * serializers produce channel addresses over live content without knowing any of this.
 *
 * Entries saved BEFORE this are ordinary flows with a credit and no `featureOf`; they keep
 * working as they are. No schema change either way: the channel is the TOUR page with the
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

/** The tour a channel entry points at, or null when it is a copy made before this. */
export const featureSourceId = (settings: unknown): string | null => {
  const id = settings && typeof settings === "object" ? (settings as any).featureOf : null;
  return typeof id === "string" && id ? id : null;
};

/**
 * A feature as the channel should present it: the SOURCE's content — name, cover, description,
 * drifts, always current — wearing the CHANNEL's identity. Which row wins each field is the
 * whole design, so it is spelled out rather than spread blindly.
 */
export const mergeFeature = (entry: any, source: any) => ({
  ...source,
  // the channel's own: who it belongs to, where it lives, how it is ordered and credited
  id: entry.id,
  organizationId: entry.organizationId,
  organization: entry.organization,
  slug: entry.slug,
  order: entry.order,
  hidden: entry.hidden,
  isDemo: entry.isDemo,
  status: entry.status,
  settings: entry.settings,
  createdAt: entry.createdAt,
  createdByUserId: entry.createdByUserId,
  // as fresh as the tour it shows
  updatedAt: source.updatedAt,
});

/**
 * Resolve one flow for public display. A plain flow (or a pre-existing copy) comes back as it
 * is. A feature comes back merged — or null when the tour behind it is gone or no longer
 * published, which is how a feature disappears cleanly instead of erroring.
 */
export async function resolveFeature<T extends { settings?: unknown }>(entry: T | null): Promise<any | null> {
  if (!entry) return null;
  const sourceId = featureSourceId((entry as any).settings);
  if (!sourceId) return entry;
  const source = await prisma.driftFlow.findUnique({ where: { id: sourceId }, include: flowInclude });
  if (!source || source.status !== "PUBLISHED") return null;
  return mergeFeature(entry, source);
}

/** The same for a public list: features are merged, and any whose tour has gone is left out. */
export async function resolveFeatures(entries: any[]): Promise<any[]> {
  const out = await Promise.all(entries.map((e) => resolveFeature(e)));
  return out.filter(Boolean);
}

/**
 * The same for the channel's OWN tools. A broken feature — the tour behind it deleted or
 * unpublished — comes back as the bare entry rather than disappearing: it is gone from the
 * public page either way, and whoever runs the channel still needs to see the row to remove it.
 */
export async function resolveOwnFeature(entry: any): Promise<{ flow: any; missing: boolean }> {
  const resolved = await resolveFeature(entry);
  if (resolved) return { flow: resolved, missing: false };
  return { flow: entry, missing: !!featureSourceId(entry?.settings) };
}

export async function resolveOwnFeatures(entries: any[]): Promise<any[]> {
  return Promise.all(entries.map(async (e) => (await resolveFeature(e)) ?? e));
}

/**
 * One drift of a featured tour, presented at the CHANNEL's address.
 *
 * The drift itself is the creator's — same frames, same pins, same captions. What changes is
 * where the player will GO next: without this, a visitor who opened /tour/drift/{tour} would
 * be handed over to the creator's own page at the first Next and never come back.
 *
 * The creator's audience tools do NOT come along: their Meta pixel must not fire on drift.li's
 * channel, their stored CTAs point at their own pathway, and their enquiry button would post a
 * lead to whichever page the URL names — the channel. Someone who wants to reach them has the
 * "Captured by …" credit on the pathway, which links to their page.
 */
export const presentOnChannel = (
  payload: any,
  at: { flowId: string; flowSlug: string; pageSlug: string; pageName: string },
) => {
  const f = payload?.flow;
  if (!f) return payload;
  const kind = String(f.kind || "TOUR");
  const stops = (f.stops || []).map((s: any) => ({
    ...s,
    playerPath: s.slug ? driftPublicPath(kind, at.pageSlug, at.flowSlug, s.slug) : s.playerPath,
  }));
  return {
    ...payload,
    metaPixelId: null,
    ctaPrimary: null,
    ctaSecondary: null,
    forms: [],
    brandName: at.pageName,
    logoUrl: null,
    flow: {
      ...f,
      id: at.flowId,
      slug: at.flowSlug,
      pageSlug: at.pageSlug,
      pageName: at.pageName,
      pagePath: pagePublicPath(at.pageSlug, kind),
      publicPath: flowPublicPath(kind, at.pageSlug, at.flowSlug),
      entryPath: stops[0]?.playerPath ?? null,
      enquiry: null,
      stops,
    },
  };
};

/**
 * Put a tour in the channel's library (Hidden Tours) by pointing at it. Nothing is duplicated —
 * no second flow's worth of drifts, no second set of rows — so the channel shows whatever the
 * creator's tour says today. Saving the same tour again returns the entry already there.
 */
export async function saveToChannel(flowId: string, userId: string | null) {
  const src = await prisma.driftFlow.findUnique({
    where: { id: flowId },
    select: {
      id: true,
      kind: true,
      name: true,
      organizationId: true,
      organization: { select: { id: true, name: true, slug: true } },
      steps: { select: { product: { select: { status: true, spin: { select: { id: true } } } } } },
    },
  });
  if (!src) throw new FlowError(404, "Tour not found");
  if (src.kind !== "TOUR") throw new FlowError(400, "Only tours can be saved to the channel");
  const channel = await ensureChannel();
  if (src.organizationId === channel.id) throw new FlowError(409, "This tour is already on the Drift channel");

  // One entry per tour, whether it was pointed at or copied in the old way.
  const already = await prisma.driftFlow.findFirst({
    where: { organizationId: channel.id, settings: { path: ["credit", "flowId"], equals: src.id } },
    select: { id: true, slug: true, name: true, hidden: true },
  });
  if (already) return { flow: { ...already, publicPath: flowPublicPath("TOUR", CHANNEL_SLUG, already.slug) }, existing: true };

  const viewable = src.steps.filter((s) => s.product?.spin && (s.product.status === "READY" || s.product.status === "PUBLISHED"));
  if (!viewable.length) throw new FlowError(409, "This tour has no finished drifts to save yet");

  // The entry carries no steps of its own: it points, and the channel reads through it. The
  // name is kept only so the back office has something to list it by before it resolves.
  const slug = await uniqueFlowSlug("TOUR", src.name);
  const entry = await prisma.driftFlow.create({
    data: {
      organizationId: channel.id,
      kind: "TOUR",
      slug,
      name: src.name,
      status: "PUBLISHED",
      hidden: true, // the library; unhide to feature it
      settings: {
        featureOf: src.id,
        credit: {
          flowId: src.id,
          pageId: src.organization.id,
          pageName: src.organization.name,
          pageSlug: src.organization.slug,
          savedAt: new Date().toISOString(),
        } satisfies TourCredit,
      },
      createdByUserId: userId,
      publishedAt: new Date(),
    },
    select: { id: true, slug: true, name: true, hidden: true },
  });
  console.log(`[${NS}] featured tour ${src.id} ("${src.name}", ${src.organization.name}) as channel entry ${entry.id}`);
  return { flow: { ...entry, publicPath: flowPublicPath("TOUR", CHANNEL_SLUG, entry.slug) }, existing: false };
}
