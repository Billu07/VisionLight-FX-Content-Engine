import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export type {
  User,
  Post,
  Asset,
  BrandConfig,
  ROIMetrics,
} from "@prisma/client";

// Map DB Service to match your old Airtable Service exactly
export const dbService = {
  // === USER ===
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  async createUser(data: { email: string; name?: string }) {
    return prisma.user.create({
      data: { ...data, creditBalance: 20, creditSystem: "COMMERCIAL" },
    });
  },
  async deleteUser(id: string) {
    return prisma.user.delete({ where: { id } });
  },
  async getAllUsers() {
    return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  },
  async adminUpdateUser(id: string, data: any) {
    return prisma.user.update({ where: { id }, data });
  },

  // === CREDITS ===
  async deductCredits(id: string, amount: number) {
    return prisma.user.update({
      where: { id },
      data: { creditBalance: { decrement: amount } },
    });
  },
  async addCredits(id: string, amount: number) {
    return prisma.user.update({
      where: { id },
      data: { creditBalance: { increment: amount } },
    });
  },
  async refundUserCredit(id: string, amount: number) {
    return this.addCredits(id, amount);
  },

  // === ASSETS ===
  async createAsset(userId: string, url: string, aspectRatio: string) {
    return prisma.asset.create({
      data: { userId, url, aspectRatio },
    });
  },
  async getUserAssets(userId: string) {
    return prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },
  async deleteAsset(id: string) {
    return prisma.asset.delete({ where: { id } });
  },

  // === POSTS ===
  async createPost(data: any) {
    // Ensure JSON is parsed if passed as string
    const script =
      typeof data.script === "string" ? JSON.parse(data.script) : data.script;
    const params =
      typeof data.generationParams === "string"
        ? JSON.parse(data.generationParams)
        : data.generationParams;

    return prisma.post.create({
      data: {
        userId: data.userId,
        title: data.title || "",
        prompt: data.prompt,
        mediaType: data.mediaType,
        mediaProvider: data.mediaProvider,
        platform: data.platform,
        status: "NEW",
        imageReference: data.imageReference,
        enhancedPrompt: data.enhancedPrompt,
        generationStep: data.generationStep,
        requiresApproval: data.requiresApproval,
        script: script || undefined,
        generationParams: params || undefined,
      },
    });
  },
  async getPostById(id: string) {
    return prisma.post.findUnique({ where: { id } });
  },
  async getUserPosts(userId: string) {
    return prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },
  async updatePost(id: string, data: any) {
    return prisma.post.update({ where: { id }, data });
  },

  // === CONFIG & ROI ===
  async getBrandConfig(userId: string) {
    return prisma.brandConfig.findUnique({ where: { userId } });
  },
  async upsertBrandConfig(data: any) {
    return prisma.brandConfig.upsert({
      where: { userId: data.userId },
      create: data,
      update: data,
    });
  },
  async getROIMetrics(userId: string) {
    let metrics = await prisma.rOIMetrics.findUnique({ where: { userId } });
    if (!metrics) {
      metrics = await prisma.rOIMetrics.create({ data: { userId } });
    }
    return metrics;
  },
  // Notifications
  async createCreditRequest(userId: string, email: string, name: string) {
    return prisma.creditRequest.create({ data: { userId, email, name } });
  },
  async getPendingCreditRequests() {
    return prisma.creditRequest.findMany({ where: { status: "PENDING" } });
  },
  async resolveCreditRequest(id: string) {
    return prisma.creditRequest.update({
      where: { id },
      data: { status: "RESOLVED" },
    });
  },
};
