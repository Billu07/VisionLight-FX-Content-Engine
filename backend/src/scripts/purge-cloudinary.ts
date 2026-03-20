import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function purgeCloudinary() {
  console.log("🧹 Starting Cloudinary purge...");

  try {
    // 1. Assets
    const assetsCount = await prisma.asset.count({
      where: {
        url: { contains: "cloudinary.com" },
      },
    });
    console.log(`🔍 Found ${assetsCount} Assets with Cloudinary URLs.`);

    // 2. Posts (checking multiple fields)
    const postsCount = await prisma.post.count({
      where: {
        OR: [
          { mediaUrl: { contains: "cloudinary.com" } },
          { imageReference: { contains: "cloudinary.com" } },
          { generatedEndFrame: { contains: "cloudinary.com" } },
        ],
      },
    });
    console.log(`🔍 Found ${postsCount} Posts with Cloudinary URLs.`);

    if (assetsCount === 0 && postsCount === 0) {
      console.log("✅ No Cloudinary contents found. Database is already clean.");
      return;
    }

    // Perform deletion
    console.log("🗑️ Deleting records...");

    const deletedAssets = await prisma.asset.deleteMany({
      where: {
        url: { contains: "cloudinary.com" },
      },
    });

    const deletedPosts = await prisma.post.deleteMany({
      where: {
        OR: [
          { mediaUrl: { contains: "cloudinary.com" } },
          { imageReference: { contains: "cloudinary.com" } },
          { generatedEndFrame: { contains: "cloudinary.com" } },
        ],
      },
    });

    console.log(`✅ Successfully deleted ${deletedAssets.count} Assets.`);
    console.log(`✅ Successfully deleted ${deletedPosts.count} Posts.`);
    console.log("✨ Database is now clear of Cloudinary contents.");

  } catch (error) {
    console.error("❌ Error during purge:", error);
  } finally {
    await prisma.$disconnect();
  }
}

purgeCloudinary();
