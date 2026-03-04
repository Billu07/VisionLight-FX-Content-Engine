const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const posts = await prisma.post.updateMany({ where: { status: 'NEW' }, data: { status: 'FAILED', error: 'Manual cleanup', progress: 0 } });
  console.log('Fixed stuck NEW posts:', posts);
}
main().catch(console.error).finally(() => prisma.$disconnect());