import { PrismaClient } from "@prisma/client";
import { DEFAULT_FAL_PRICING } from "../config/pricing";

const prisma = new PrismaClient();

async function main() {
  console.log("Applying render credit defaults to global settings...");

  const globalSettings = await prisma.globalSettings.upsert({
    where: { id: "singleton" },
    update: {
      ...DEFAULT_FAL_PRICING,
    },
    create: {
      id: "singleton",
      ...DEFAULT_FAL_PRICING,
    },
  });

  console.log(
    `Global settings updated (id=${globalSettings.id}). Syncing organizations...`,
  );

  const orgSync = await prisma.organization.updateMany({
    data: {
      ...DEFAULT_FAL_PRICING,
    },
  });

  console.log(`Updated pricing defaults for ${orgSync.count} organizations.`);
  console.log("Render credit defaults applied successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to apply render credit defaults:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
