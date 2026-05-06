import { prisma } from "../services/database";

const MS_DAY = 24 * 60 * 60 * 1000;

async function main() {
  const now = Date.now();
  const orgs = await prisma.organization.findMany({
    where: {
      provisioningSource: "BYOK",
      storageRetentionDays: { not: null },
    },
    select: {
      id: true,
      name: true,
      storageRetentionDays: true,
    },
  });

  let totalPostsDeleted = 0;
  let totalAssetsDeleted = 0;

  for (const org of orgs) {
    const retentionDays = Number(org.storageRetentionDays || 0);
    if (!Number.isFinite(retentionDays) || retentionDays < 1) continue;

    const cutoff = new Date(now - retentionDays * MS_DAY);
    const [postResult, assetResult] = await Promise.all([
      prisma.post.deleteMany({
        where: {
          organizationId: org.id,
          createdAt: { lt: cutoff },
        },
      }),
      prisma.asset.deleteMany({
        where: {
          organizationId: org.id,
          createdAt: { lt: cutoff },
        },
      }),
    ]);

    totalPostsDeleted += postResult.count;
    totalAssetsDeleted += assetResult.count;

    console.log(
      `[byok-retention] ${org.name} (${org.id}) cutoff=${cutoff.toISOString()} posts=${postResult.count} assets=${assetResult.count}`,
    );
  }

  console.log(
    `[byok-retention] completed: organizations=${orgs.length} postsDeleted=${totalPostsDeleted} assetsDeleted=${totalAssetsDeleted}`,
  );
}

main()
  .catch((error) => {
    console.error("[byok-retention] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
