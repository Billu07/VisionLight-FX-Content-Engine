import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { id: "demo-user-1" },
    update: {
      demoCredits: {
        sora: 2,
        gemini: 2,
        bannerbear: 2,
      },
      isVerified: true,
      lastLoginAt: new Date(),
    },
    create: {
      id: "demo-user-1",
      email: "demo@visionlight.ai",
      name: "Demo User",
      demoCredits: {
        sora: 2,
        gemini: 2,
        bannerbear: 2,
      },
      isVerified: true,
      lastLoginAt: new Date(),
    },
  });

  console.log("✅ Demo user created:", demoUser.email);

  // Create brand config
  await prisma.brandConfig.upsert({
    where: { userId: "demo-user-1" },
    update: {},
    create: {
      userId: "demo-user-1",
      companyName: "Your Brand",
      primaryColor: "#3B82F6",
      secondaryColor: "#1E40AF",
    },
  });
  console.log("✅ Brand config created");

  // Create ROI metrics
  await prisma.rOIMetrics.upsert({
    where: { userId: "demo-user-1" },
    update: {},
    create: {
      userId: "demo-user-1",
      postsCreated: 0,
      timeSaved: 0,
      mediaGenerated: 0,
    },
  });
  console.log("✅ ROI metrics initialized");

  // Create sample posts with new schema
  const samplePosts = [
    {
      id: "post-1",
      prompt: "A happy couple enjoying sunset on a tropical beach vacation",
      script: {
        caption: [
          "Golden hour moments that take our breath away 🌅",
          "Creating memories in paradise with my favorite person",
          "Where the ocean meets the sky and love knows no bounds",
        ],
        cta: "Tag someone youd love to travel with!",
        mediaType: "image",
        imageReference:
          "A romantic beach sunset with a happy couple walking hand in hand, golden hour lighting, tropical palm trees, ocean waves, warm colors",
      },
      platform: "INSTAGRAM" as const,
      status: "READY" as const,
      mediaType: "IMAGE" as const,
      mediaUrl:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600",
      mediaProvider: "gemini",
      userId: "demo-user-1",
    },
    {
      id: "post-2",
      prompt:
        "Tech startup team collaborating in modern office with AI technology",
      script: {
        caption: [
          "Innovation happens when great minds come together 💡",
          "Building the future of AI, one line of code at a time",
          "Our team is turning big ideas into reality",
        ],
        cta: "Learn more about our AI solutions",
        mediaType: "carousel",
        imageReference:
          "Slide 1: Team collaboration in modern office. Slide 2: Code on screens with AI visuals. Slide 3: Product demonstration. Slide 4: Call to action with contact info",
      },
      platform: "LINKEDIN" as const,
      status: "READY" as const,
      mediaType: "CAROUSEL" as const,
      mediaUrl:
        "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600",
      mediaProvider: "bannerbear",
      userId: "demo-user-1",
    },
  ];

  for (const postData of samplePosts) {
    const post = await prisma.post.upsert({
      where: {
        id: postData.id,
      },
      update: postData,
      create: postData,
    });
    console.log(`✅ Sample post created: ${post.prompt.substring(0, 30)}...`);
  }

  console.log("🎉 Database seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
