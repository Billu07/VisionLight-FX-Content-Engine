import { prisma } from "../services/database";

async function main() {
  const apply = process.argv.includes("--apply");
  const defaultOrg = await prisma.organization.findFirst({
    where: { isDefault: true },
    select: { id: true, name: true },
  });

  if (!defaultOrg) {
    console.log("No default organization found.");
    return;
  }

  const superadminsToRepair = await prisma.user.findMany({
    where: {
      organizationId: defaultOrg.id,
      role: "SUPERADMIN",
      NOT: { view: "VISIONLIGHT" },
    },
    select: { id: true, email: true, view: true },
  });

  const demoUsersToRepair = await prisma.user.findMany({
    where: {
      organizationId: defaultOrg.id,
      isDemo: true,
      NOT: { view: "PICDRIFT" },
    },
    select: { id: true, email: true, view: true },
  });

  console.log(`Default organization: ${defaultOrg.name} (${defaultOrg.id})`);
  console.log(`Superadmins to restore to VISIONLIGHT: ${superadminsToRepair.length}`);
  for (const user of superadminsToRepair) {
    console.log(`- ${user.email} (${user.id}) ${user.view} -> VISIONLIGHT`);
  }

  console.log(`Demo users to restore to PICDRIFT: ${demoUsersToRepair.length}`);
  for (const user of demoUsersToRepair) {
    console.log(`- ${user.email} (${user.id}) ${user.view} -> PICDRIFT`);
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist updates.");
    return;
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: superadminsToRepair.map((user) => user.id) } },
      data: { view: "VISIONLIGHT" },
    }),
    prisma.user.updateMany({
      where: { id: { in: demoUsersToRepair.map((user) => user.id) } },
      data: { view: "PICDRIFT" },
    }),
  ]);

  console.log("Default organization views repaired.");
}

main()
  .catch((error) => {
    console.error("Repair failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
