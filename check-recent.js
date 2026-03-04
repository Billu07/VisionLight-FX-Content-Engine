const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const posts = await prisma.post.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('Recent posts:', posts.map(p => ({ id: p.id, status: p.status, type: p.mediaType })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
