import "dotenv/config";
import { prisma } from "../services/database";
import { BYOK_PACKAGE_CONFIG } from "../config/byok";

/**
 * One-off migration: VisualFX Studio storage moved 1GB -> 2GB.
 *
 * Bumps existing BYOK VisualFX Studio orgs that are still on the OLD package
 * default (1024MB) up to the new value. Any org with a custom/hand-tuned storage
 * value is left untouched, and MANUAL (non-BYOK) tenants are never considered.
 *
 * Dry-run by default. Pass --apply to actually write changes.
 *
 *   npm run jobs:sync-studio-storage            # preview
 *   npm run jobs:sync-studio-storage -- --apply # commit
 */
const PACKAGE_CODE = "VFX_STUDIO" as const;
const OLD_DEFAULT_MB = 1024;
const NEW_MB = BYOK_PACKAGE_CONFIG[PACKAGE_CODE].maxStorageMb; // 2048

const run = async () => {
  const apply = process.argv.includes("--apply");

  const orgs = await prisma.organization.findMany({
    where: { provisioningSource: "BYOK" },
    include: { entitlement: true },
    orderBy: [{ createdAt: "desc" }],
  });

  let toChange = 0;
  let alreadyOk = 0;
  let skippedCustom = 0;

  for (const org of orgs) {
    const code = (
      org.entitlementCode ||
      org.entitlement?.packageCode ||
      ""
    ).toUpperCase();
    if (code !== PACKAGE_CODE) continue;

    if (org.maxStorageMb === NEW_MB) {
      alreadyOk++;
      continue;
    }

    if (org.maxStorageMb !== OLD_DEFAULT_MB) {
      skippedCustom++;
      console.log(
        `[skip-custom] ${org.name}: ${org.maxStorageMb}MB ` +
          `(not the old ${OLD_DEFAULT_MB}MB default — left untouched)`,
      );
      continue;
    }

    toChange++;
    console.log(
      `[change]${apply ? "" : " (dry)"} ${org.name}: ${org.maxStorageMb}MB -> ${NEW_MB}MB`,
    );

    if (apply) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { maxStorageMb: NEW_MB },
      });
    }
  }

  console.log("");
  console.log(
    `${PACKAGE_CODE}: ${toChange} org(s) ${apply ? "updated" : "would update"}, ` +
      `${alreadyOk} already at ${NEW_MB}MB, ${skippedCustom} custom value(s) left untouched.`,
  );
  if (!apply && toChange > 0) {
    console.log("Dry run — re-run with --apply to commit.");
  }

  await prisma.$disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
