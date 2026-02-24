import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting legacy content migration...");

  // Get all users
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users.`);

  let usersMigrated = 0;
  let postsUpdated = 0;
  let assetsUpdated = 0;

  for (const user of users) {
    // Check if user has any unassigned posts or assets
    const unassignedPostsCount = await prisma.post.count({
      where: { userId: user.id, projectId: null },
    });

    const unassignedAssetsCount = await prisma.asset.count({
      where: { userId: user.id, projectId: null },
    });

    if (unassignedPostsCount > 0 || unassignedAssetsCount > 0) {
      console.log(`
Migrating user: ${user.email}`);
      console.log(`- Unassigned Posts: ${unassignedPostsCount}`);
      console.log(`- Unassigned Assets: ${unassignedAssetsCount}`);
      console.log(`- Creating 'Default Project'...`);

      // Create a default project for the user
      const defaultProject = await prisma.project.create({
        data: {
          userId: user.id,
          name: "Default Project",
        },
      });

      // Update posts
      if (unassignedPostsCount > 0) {
        const updatePostsResult = await prisma.post.updateMany({
          where: { userId: user.id, projectId: null },
          data: { projectId: defaultProject.id },
        });
        postsUpdated += updatePostsResult.count;
      }

      // Update assets
      if (unassignedAssetsCount > 0) {
        const updateAssetsResult = await prisma.asset.updateMany({
          where: { userId: user.id, projectId: null },
          data: { projectId: defaultProject.id },
        });
        assetsUpdated += updateAssetsResult.count;
      }

      usersMigrated++;
    }
  }

  console.log("\n✅ Migration completed successfully!");
  console.log(`📊 Summary:`);
  console.log(`- Users migrated: ${usersMigrated}`);
  console.log(`- Total Posts updated: ${postsUpdated}`);
  console.log(`- Total Assets updated: ${assetsUpdated}`);
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
