import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const emailsToPromote = ["snowfix07@gmail.com", "keith@picdrift.com"];

async function main() {
  console.log("🚀 Promoting users to SUPERADMIN...");

  for (const email of emailsToPromote) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.toLowerCase(), mode: "insensitive" } },
    });

    if (user) {
      await prisma.user.updateMany({
        where: { email: { equals: email.toLowerCase(), mode: "insensitive" } },
        data: { role: "SUPERADMIN" },
      });
      console.log(`✅ Promoted ${email} to SUPERADMIN`);
    } else {
      console.log(`⚠️ User ${email} not found in database.`);
    }
  }

  console.log("🎉 Promotion process complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
