import { prisma } from "../services/database";

async function main() {
  const apply = process.argv.includes("--apply");

  const candidates = await prisma.user.findMany({
    where: {
      isDemo: false,
      view: "PICDRIFT",
      role: "USER",
      creditSystem: "INTERNAL",
      maxProjects: 1,
      OR: [{ organizationId: null }, { organization: { is: { isDefault: true } } }],
    },
    select: {
      id: true,
      email: true,
      organizationId: true,
    },
  });

  console.log(`Found ${candidates.length} legacy demo candidates.`);
  for (const user of candidates) {
    console.log(`- ${user.email} (${user.id})`);
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist updates.");
    return;
  }

  if (candidates.length === 0) {
    console.log("No users to update.");
    return;
  }

  await prisma.user.updateMany({
    where: {
      id: { in: candidates.map((u) => u.id) },
    },
    data: { isDemo: true },
  });

  console.log(`Updated ${candidates.length} users with isDemo=true.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
