import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting Tenant Migration...");

  // 1. Create Default visualFX Organization
  const org = await prisma.organization.create({
    data: {
      name: "Default visualFX Organization",
      isActive: true,
    },
  });

  console.log(`✅ Created Default Organization: ${org.id}`);

  // 2. Migrate Users
  const users = await prisma.user.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${users.count} Users`);

  // 3. Migrate Projects
  const projects = await prisma.project.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${projects.count} Projects`);

  // 4. Migrate Posts
  const posts = await prisma.post.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${posts.count} Posts`);

  // 5. Migrate Assets
  const assets = await prisma.asset.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${assets.count} Assets`);

  // 6. Migrate BrandConfigs
  const brandConfigs = await prisma.brandConfig.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${brandConfigs.count} BrandConfigs`);

  // 7. Migrate ROIMetrics
  const roiMetrics = await prisma.rOIMetrics.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${roiMetrics.count} ROIMetrics`);

  // 8. Migrate CreditRequests
  const creditRequests = await prisma.creditRequest.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✅ Migrated ${creditRequests.count} CreditRequests`);

  console.log("🎉 Migration Complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });