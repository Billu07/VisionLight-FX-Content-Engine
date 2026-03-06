import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Setting up Default Organization...");

  // 1. Find the organization that looks like the default one
  const orgs = await prisma.organization.findMany();
  let defaultOrg = orgs.find(o => o.name.toLowerCase().includes("default"));

  if (defaultOrg) {
    console.log(`✅ Found existing organization: ${defaultOrg.name}`);
    await prisma.organization.update({
      where: { id: defaultOrg.id },
      data: { isDefault: true, name: "Default VisualFX Organization" }
    });
    console.log("✨ Updated to be the official Default Organization.");
  } else {
    console.log("📝 No default organization found. Creating one...");
    defaultOrg = await prisma.organization.create({
      data: {
        name: "Default VisualFX Organization",
        isDefault: true,
        maxUsers: 999,
        maxProjectsTotal: 9999
      }
    });
    console.log(`✨ Created new Default Organization with ID: ${defaultOrg.id}`);
  }

  // 2. Ensure all SuperAdmin users are linked to this org
  const superAdmins = await prisma.user.findMany({
    where: { role: "SUPERADMIN" }
  });

  for (const admin of superAdmins) {
    if (admin.organizationId !== defaultOrg.id) {
      await prisma.user.update({
        where: { id: admin.id },
        data: { organizationId: defaultOrg.id }
      });
      console.log(`🔗 Linked SuperAdmin ${admin.email} to Default Org.`);
    }
  }

  console.log("🏁 Setup complete.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
