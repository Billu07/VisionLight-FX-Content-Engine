import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Syncing Global Settings to Organizations...");

  // 1. Get current Global Settings
  const globalSettings = await prisma.globalSettings.findUnique({
    where: { id: "singleton" },
  });

  if (!globalSettings) {
    console.log("⚠️ No Global Settings found. Skipping sync.");
  } else {
    // 2. Update all existing organizations with these values
    const orgs = await prisma.organization.updateMany({
      data: {
        pricePicDrift_5s: globalSettings.pricePicDrift_5s,
        pricePicDrift_10s: globalSettings.pricePicDrift_10s,
        pricePicDrift_Plus_5s: globalSettings.pricePicDrift_Plus_5s,
        pricePicDrift_Plus_10s: globalSettings.pricePicDrift_Plus_10s,
        pricePicFX_Standard: globalSettings.pricePicFX_Standard,
        pricePicFX_Carousel: globalSettings.pricePicFX_Carousel,
        pricePicFX_Batch: globalSettings.pricePicFX_Batch,
        priceEditor_Pro: globalSettings.priceEditor_Pro,
        priceEditor_Enhance: globalSettings.priceEditor_Enhance,
        priceEditor_Convert: globalSettings.priceEditor_Convert,
        priceVideoFX1_10s: globalSettings.priceVideoFX1_10s,
        priceVideoFX1_15s: globalSettings.priceVideoFX1_15s,
        priceVideoFX2_4s: globalSettings.priceVideoFX2_4s,
        priceVideoFX2_8s: globalSettings.priceVideoFX2_8s,
        priceVideoFX2_12s: globalSettings.priceVideoFX2_12s,
        priceVideoFX3_4s: globalSettings.priceVideoFX3_4s,
        priceVideoFX3_6s: globalSettings.priceVideoFX3_6s,
        priceVideoFX3_8s: globalSettings.priceVideoFX3_8s,
        priceAsset_DriftPath: globalSettings.priceAsset_DriftPath,
      },
    });

    console.log(`✅ Synced settings to ${orgs.count} organizations.`);
  }

  console.log("🎉 Sync Complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });