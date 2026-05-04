import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Safety Net: Load protected emails from .env
const PROTECTED_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase());

async function purgeZombies() {
  const isConfirm = process.argv.includes("--confirm");
  
  console.log("\n🔍 Starting Deep Cleanup of Zombie Users...");
  if (!isConfirm) {
    console.log("⚠️  DRY RUN MODE: No users will be deleted. Run with '--confirm' to execute.");
  }

  // 1. Get all users from Supabase Auth
  const { data: { users: supabaseUsers }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error("❌ Failed to fetch Supabase users:", error);
    return;
  }

  console.log(`📊 Found ${supabaseUsers.length} total users in Supabase Auth.`);
  console.log(`🛡️  Protected Emails: ${PROTECTED_EMAILS.join(", ")}`);

  let purgedCount = 0;
  let skippedCount = 0;

  for (const sUser of supabaseUsers) {
    if (!sUser.email) continue;
    const email = sUser.email.toLowerCase();

    // Safety Check 1: Is it a protected admin email?
    if (PROTECTED_EMAILS.includes(email)) {
      console.log(`✅ [SAFE] Protected Admin: ${email}`);
      skippedCount++;
      continue;
    }

    // Safety Check 2: Does it exist in our DB?
    const dbUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } }
    });

    if (dbUser) {
      console.log(`✅ [SAFE] Active User found in DB: ${email}`);
      skippedCount++;
      continue;
    }

    // If we get here, it's a zombie (in Auth but not in DB)
    console.log(`🧹 [ZOMBIE] Target for deletion: ${email}`);
    
    if (isConfirm) {
      const { error: delError } = await supabase.auth.admin.deleteUser(sUser.id);
      if (delError) {
        console.error(`❌ Failed to delete ${email}:`, delError.message);
      } else {
        console.log(`🗑️  Successfully deleted ${email}`);
        purgedCount++;
      }
    } else {
      purgedCount++;
    }
  }

  console.log("\n--- CLEANUP SUMMARY ---");
  console.log(`✅ Users Kept: ${skippedCount}`);
  console.log(`${isConfirm ? "🗑️  Users Deleted:" : "🕒 Users to be Deleted:"} ${purgedCount}`);
  
  if (!isConfirm && purgedCount > 0) {
    console.log("\n🚀 TO LOG THESE CHANGES FOR REAL, RUN:");
    console.log("npx ts-node src/scripts/purge-zombies.ts --confirm\n");
  }

  await prisma.$disconnect();
}

purgeZombies();
