import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const prisma = new PrismaClient();

async function test() {
  const asset = await prisma.asset.findFirst({
    where: { url: { contains: 'cloudinary.com' } }
  });

  if (!asset) {
    console.log("No cloudinary assets found.");
    return;
  }

  console.log("Testing URL:", asset.url);

  try {
    const res = await axios.get(asset.url);
    console.log("Standard HTTP GET Status:", res.status);
  } catch (e: any) {
    console.log("Standard HTTP GET Error:", e.response?.status, e.response?.statusText);
  }

  try {
    // Extract public ID from URL
    // e.g. https://res.cloudinary.com/drsfsznlo/image/upload/v12345/raw_user_123.jpg
    const parts = asset.url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = filename.split('.')[0];
    
    console.log("Testing Admin API with public_id:", publicId);
    const result = await cloudinary.api.resource(publicId);
    console.log("Admin API Result:", result.public_id, result.secure_url);
    console.log("If this works, we MIGHT be able to download via the Admin API or secure URL!");
  } catch (e: any) {
    console.log("Admin API Error:", e.message || e);
  }
}

test().finally(() => prisma.$disconnect());