import express from "express";
import { prisma } from "../services/database";

// Public, read-only demo content endpoint.
//
// Anyone (no auth) can request the curated demo content for a given view. The
// content is sourced from the demo content owner's studios (keith@picdrift.com)
// and is hard-projected to display-only fields. This router performs READ-ONLY
// queries only and never touches credits/keys/PII, so it is safe to expose
// publicly.

const router = express.Router();

// The demo gallery is always sourced from this account's studios, regardless of
// which superadmin curates it from the panel.
export const DEMO_CONTENT_OWNER_EMAIL = "keith@picdrift.com";

type DemoView = "PICDRIFT" | "VISIONLIGHT";

// One email can own several studios (profiles). Resolve every user id under the
// demo owner's email so content from all of their studios is available.
export async function getDemoOwnerUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      email: { equals: DEMO_CONTENT_OWNER_EMAIL, mode: "insensitive" },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

const DEMO_PROJECT_NAMES: Record<DemoView, string> = {
  PICDRIFT: process.env.DEMO_PROJECT_PICDRIFT || "PicDrift Demo",
  VISIONLIGHT: process.env.DEMO_PROJECT_VISIONLIGHT || "Visionlight Demo",
};

const forceHttps = (value?: string | null): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  return trimmed.startsWith("http://") ? `https://${trimmed.slice(7)}` : trimmed;
};

type DemoPayload = { posts: any[]; assets: any[] };

// Lightweight in-memory cache: this is public traffic against rarely-changing
// content, so a short TTL avoids hammering the database.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<DemoView, { at: number; data: DemoPayload }>();

type ViewSelection = { postIds: string[]; assetIds: string[] };

function readSelection(demoConfig: unknown, view: DemoView): ViewSelection {
  const cfg = (demoConfig as any)?.[view];
  const postIds = Array.isArray(cfg?.postIds)
    ? cfg.postIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const assetIds = Array.isArray(cfg?.assetIds)
    ? cfg.assetIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  return { postIds, assetIds };
}

router.get("/api/demo/content", async (req, res) => {
  const view: DemoView =
    String(req.query.view || "").toUpperCase() === "PICDRIFT"
      ? "PICDRIFT"
      : "VISIONLIGHT";

  try {
    const cached = cache.get(view);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return res.json({ success: true, view, ...cached.data });
    }

    const ownerIds = await getDemoOwnerUserIds();
    if (ownerIds.length === 0) {
      return res.json({ success: true, view, posts: [], assets: [] });
    }

    // 1) Preferred source: superadmin-curated selection (Demo Preview manager).
    const settings = await prisma.globalSettings.findUnique({
      where: { id: "singleton" },
      select: { demoConfig: true },
    });
    const selection = readSelection(settings?.demoConfig, view);

    if (selection.postIds.length > 0 || selection.assetIds.length > 0) {
      const [postRows, assetRows] = await Promise.all([
        selection.postIds.length
          ? prisma.post.findMany({
              where: {
                id: { in: selection.postIds },
                status: "READY",
                mediaUrl: { not: null },
                userId: { in: ownerIds },
              },
              select: {
                id: true,
                title: true,
                mediaUrl: true,
                mediaType: true,
                mediaProvider: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
        selection.assetIds.length
          ? prisma.asset.findMany({
              where: {
                id: { in: selection.assetIds },
                userId: { in: ownerIds },
              },
              select: {
                id: true,
                url: true,
                type: true,
                aspectRatio: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
      ]);

      // Preserve the superadmin's chosen ordering.
      const orderedPosts = selection.postIds
        .map((id) => postRows.find((p) => p.id === id))
        .filter(Boolean) as typeof postRows;
      const orderedAssets = selection.assetIds
        .map((id) => assetRows.find((a) => a.id === id))
        .filter(Boolean) as typeof assetRows;

      const data: DemoPayload = {
        posts: orderedPosts.map((p) => ({
          id: p.id,
          title: p.title || "",
          mediaUrl: forceHttps(p.mediaUrl),
          mediaType: p.mediaType || "IMAGE",
          mediaProvider: p.mediaProvider || null,
          createdAt: p.createdAt,
        })),
        assets: orderedAssets.map((a) => ({
          id: a.id,
          url: forceHttps(a.url),
          type: a.type || "IMAGE",
          aspectRatio: a.aspectRatio || "original",
          createdAt: a.createdAt,
        })),
      };
      cache.set(view, { at: Date.now(), data });
      return res.json({ success: true, view, ...data });
    }

    // 2) Fallback: the demo owner's per-view demo project (name convention).
    const project = await prisma.project.findFirst({
      where: {
        userId: { in: ownerIds },
        name: { equals: DEMO_PROJECT_NAMES[view], mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!project) {
      const empty: DemoPayload = { posts: [], assets: [] };
      cache.set(view, { at: Date.now(), data: empty });
      return res.json({ success: true, view, ...empty });
    }

    const [postRows, assetRows] = await Promise.all([
      prisma.post.findMany({
        where: {
          userId: { in: ownerIds },
          projectId: project.id,
          status: "READY",
          mediaUrl: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          title: true,
          mediaUrl: true,
          mediaType: true,
          mediaProvider: true,
          createdAt: true,
        },
      }),
      prisma.asset.findMany({
        where: { userId: { in: ownerIds }, projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          url: true,
          type: true,
          aspectRatio: true,
          createdAt: true,
        },
      }),
    ]);

    const data: DemoPayload = {
      posts: postRows.map((p) => ({
        id: p.id,
        title: p.title || "",
        mediaUrl: forceHttps(p.mediaUrl),
        mediaType: p.mediaType || "IMAGE",
        mediaProvider: p.mediaProvider || null,
        createdAt: p.createdAt,
      })),
      assets: assetRows.map((a) => ({
        id: a.id,
        url: forceHttps(a.url),
        type: a.type || "IMAGE",
        aspectRatio: a.aspectRatio || "original",
        createdAt: a.createdAt,
      })),
    };

    cache.set(view, { at: Date.now(), data });
    return res.json({ success: true, view, ...data });
  } catch (error: any) {
    console.error("[Demo] content error:", error?.message || error);
    // Never leak internals; degrade to an empty demo.
    return res.json({ success: true, view, posts: [], assets: [] });
  }
});

export default router;
