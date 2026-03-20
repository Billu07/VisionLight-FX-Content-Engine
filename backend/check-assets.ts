import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const assets = await prisma.asset.findMany();
  const cloudinaryCount = assets.filter(a => a.url.includes('cloudinary.com')).length;
  const r2Count = assets.filter(a => a.url.includes('r2.dev')).length;
  const otherCount = assets.length - cloudinaryCount - r2Count;
  
  console.log(`Total Assets: ${assets.length}`);
  console.log(`Cloudinary URLs: ${cloudinaryCount}`);
  console.log(`R2 URLs: ${r2Count}`);
  console.log(`Other URLs: ${otherCount}`);
  
  if (cloudinaryCount > 0) {
      console.log("Found Cloudinary assets. These are likely the ones causing 401s.");
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());