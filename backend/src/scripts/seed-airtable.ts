// backend/src/scripts/seed-airtable.ts
import { airtableService } from "../services/airtable";

async function seedAirtable() {
  console.log("🌱 Seeding Airtable base with initial data...");

  try {
    // Create a test user
    const testUser = await airtableService.createUser({
      email: "demo@visionlight.ai",
      name: "Visionlight Demo User",
    });

    console.log("✅ Test user created:", testUser.email);

    // Create brand config for test user
    const brandConfig = await airtableService.upsertBrandConfig({
      userId: testUser.id,
      companyName: "Visionlight AI",
      primaryColor: "#6366f1",
      secondaryColor: "#8b5cf6",
      logoUrl: "https://visionlight.ai/logo.png",
    });

    console.log("✅ Brand config created");

    // Initialize ROI metrics
    const roiMetrics = await airtableService.getROIMetrics(testUser.id);
    console.log("✅ ROI metrics initialized:", roiMetrics);

    console.log("🎉 Airtable seeding completed successfully!");
    console.log("Test user credentials:");
    console.log("Email: demo@visionlight.ai");
    console.log("User ID:", testUser.id);
  } catch (error) {
    console.error("❌ Airtable seeding failed:", error);
    process.exit(1);
  }
}

seedAirtable();
