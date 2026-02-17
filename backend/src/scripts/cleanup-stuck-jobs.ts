import { prisma } from "../services/database";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function main() {
  console.log("🧹 Starting Stuck Job Cleanup...");

  const cutoffDate = new Date(Date.now() - TIMEOUT_MS);

  // Find stuck jobs
  const stuckPosts = await prisma.post.findMany({
    where: {
      status: "PROCESSING",
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  console.log(`Found ${stuckPosts.length} stuck jobs.`);

  for (const post of stuckPosts) {
    console.log(`- Fixing Post ID: ${post.id}`);
    
    // 1. Mark as FAILED
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "FAILED",
        error: "Job timed out (Automatic Cleanup)",
        progress: 0,
      },
    });

    // 2. Refund User
    // Try to determine cost from params, default to 5
    const params = post.generationParams as any;
    const cost = params?.cost || 5;
    
    // Determine pool (basic heuristic matching pricing.ts logic)
    // If not found in params, we might have to guess or just refund legacy balance.
    // However, the new refundGranularCredits needs a pool name.
    // Let's rely on legacy 'refundUserCredit' which the dbService maps to 'addCredits' (legacy balance).
    // Wait, 'refundUserCredit' updates 'creditBalance'. 
    // If the user spent from 'creditsPicDrift', refunding to 'creditBalance' is okay if they are interchangeable, 
    // but the system seems to have granular pools now.
    
    // Let's try to infer the pool from the media type/model if possible, 
    // OR just use a generic refund function if available.
    
    // Since this is a script, let's just refund to the main legacy balance for safety 
    // to avoid complex logic here, OR try to find the pool.
    
    // Actually, looking at 'video.ts', it calls: 
    // await airtableService.refundUserCredit(userId, params?.cost || 5);
    // which maps to: 
    // async refundUserCredit(id: string, amount: number) { return this.addCredits(id, amount); }
    // which updates 'creditBalance'.
    
    // So for now, we will stick to that to match the existing codebase behavior.
    
    await prisma.user.update({
      where: { id: post.userId },
      data: { creditBalance: { increment: parseFloat(cost.toString()) } },
    });
    
    console.log(`  -> Refunded ${cost} credits`);
  }

  console.log("✅ Cleanup Complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
