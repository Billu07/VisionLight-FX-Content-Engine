import "dotenv/config";
import { prisma } from "../services/database";

/**
 * Read-only diagnostic. Lists every organization with its provisioning source,
 * resolved package code, and storage limit, plus a summary count per
 * (source, package code). Writes nothing.
 *
 *   npm run jobs:list-byok-orgs
 */
const run = async () => {
  const orgs = await prisma.organization.findMany({
    include: { entitlement: true },
    orderBy: [{ createdAt: "desc" }],
  });

  console.log(`Total organizations: ${orgs.length}\n`);

  const summary = new Map<string, number>();

  for (const org of orgs) {
    const orgCode = org.entitlementCode || "-";
    const entCode = org.entitlement?.packageCode || "-";
    const key = `${org.provisioningSource}  |  entitlementCode=${orgCode}  |  entitlement.packageCode=${entCode}`;
    summary.set(key, (summary.get(key) || 0) + 1);

    console.log(
      [
        org.provisioningSource.padEnd(7),
        `code=${orgCode}`.padEnd(24),
        `ent=${entCode}`.padEnd(24),
        `storage=${org.maxStorageMb}MB`.padEnd(16),
        org.name,
      ].join("  "),
    );
  }

  console.log("\n--- Summary (count per source / package code) ---");
  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`${count}x  ${key}`);
  }

  await prisma.$disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
