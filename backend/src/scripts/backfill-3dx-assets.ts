import { prisma } from "../services/database";

// Backfill: get existing 3DX (drift) renders into the "3DX Paths" library tab.
//
// The "3DX Paths" tab shows assets with type === "VIDEO" && aspectRatio === "VIDEO".
// Drift renders made before the finalize fix either have NO library asset (the
// save failed silently) or have one saved with the visual ratio (16:9/...), which
// matches no tab. This script, per completed DRIFT_EDITOR post:
//   - creates the missing VIDEO/VIDEO asset, or
//   - fixes an existing asset (same url) to VIDEO/VIDEO.
//
// Idempotent. Dry-run by default; pass --apply to write.

const cleanUrl = (raw?: string | null): string => {
  if (!raw) return "";
  const t = String(raw).trim();
  if (t.startsWith("[") && t.includes("]")) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch {
      /* fall through */
    }
  }
  return t;
};

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "MODE: APPLY (writing changes)"
      : "MODE: DRY RUN (no changes) — pass --apply to write",
  );

  // Completed video renders that might be drift (3DX) videos.
  const posts = await prisma.post.findMany({
    where: { status: "READY", mediaType: "VIDEO", mediaUrl: { not: null } },
    select: {
      id: true,
      userId: true,
      projectId: true,
      mediaUrl: true,
      generationParams: true,
    },
  });

  const driftPosts = posts.filter((p) => {
    const gp = p.generationParams as any;
    return gp && typeof gp === "object" && gp.source === "DRIFT_EDITOR";
  });
  console.log(`Drift (3DX) READY posts found: ${driftPosts.length}`);

  const orgByUser = new Map<string, string | null>();
  const getOrgId = async (userId: string): Promise<string | null> => {
    if (orgByUser.has(userId)) return orgByUser.get(userId)!;
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    const org = u?.organizationId ?? null;
    orgByUser.set(userId, org);
    return org;
  };

  const toCreate: { userId: string; projectId: string | null; url: string }[] = [];
  const toFix: { id: string; from: string }[] = [];
  let alreadyOk = 0;
  let noUrl = 0;

  for (const p of driftPosts) {
    const url = cleanUrl(p.mediaUrl);
    if (!url) {
      noUrl++;
      continue;
    }
    const existing = await prisma.asset.findFirst({
      where: { userId: p.userId, url },
      select: { id: true, type: true, aspectRatio: true },
    });
    if (!existing) {
      toCreate.push({ userId: p.userId, projectId: p.projectId ?? null, url });
    } else if (existing.type !== "VIDEO" || existing.aspectRatio !== "VIDEO") {
      toFix.push({ id: existing.id, from: `${existing.type}/${existing.aspectRatio}` });
    } else {
      alreadyOk++;
    }
  }

  console.log(`- already in 3DX Paths (VIDEO/VIDEO): ${alreadyOk}`);
  console.log(`- existing asset to fix -> VIDEO/VIDEO: ${toFix.length}`);
  console.log(`- missing asset to create: ${toCreate.length}`);
  if (noUrl) console.log(`- skipped (no usable url): ${noUrl}`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to write these changes.");
    return;
  }

  for (const f of toFix) {
    await prisma.asset.update({
      where: { id: f.id },
      data: { type: "VIDEO", aspectRatio: "VIDEO" },
    });
  }

  let created = 0;
  for (const c of toCreate) {
    const organizationId = await getOrgId(c.userId);
    await prisma.asset.create({
      data: {
        userId: c.userId,
        url: c.url,
        aspectRatio: "VIDEO",
        type: "VIDEO",
        projectId: c.projectId || undefined,
        organizationId: organizationId || undefined,
        sizeBytes: null,
      },
    });
    created++;
  }

  console.log(`\nApplied: fixed ${toFix.length}, created ${created}. Done.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
