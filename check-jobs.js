const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const posts = await prisma.post.findMany({ where: { status: 'PROCESSING' } });
  console.log('Stuck posts:', posts);
  for (const p of posts) {
    await prisma.post.update({ where: { id: p.id }, data: { status: 'FAILED', error: 'Manual cleanup', progress: 0 } });
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
