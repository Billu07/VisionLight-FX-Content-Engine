import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export type {
  User,
  Post,
  Asset,
  BrandConfig,
  ROIMetrics,
} from "@prisma/client";

export const dbService = {
  // === NEW: GLOBAL SETTINGS (PRICING CONTROL) ===
  async getGlobalSettings() {
    let settings = await prisma.globalSettings.findUnique({
      where: { id: "singleton" },
    });
    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: { id: "singleton" },
      });
    }
    return settings;
  },

  async updateGlobalSettings(data: any) {
    return prisma.globalSettings.update({
      where: { id: "singleton" },
      data,
    });
  },

  // === USER ===
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  async createUser(data: { email: string; name?: string; view?: string; maxProjects?: number }) {
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        view: data.view || "VISIONLIGHT",
        maxProjects: data.maxProjects || 3,
        creditBalance: 20, // Keep legacy balance
        creditsPicDrift: 10,
        creditsImageFX: 10,
        creditsVideoFX1: 10,
        creditsVideoFX2: 10,
        creditsVideoFX3: 10,
        creditSystem: "COMMERCIAL",
        role: "USER",
      },
    });
  },
  async deleteUser(id: string) {
    return prisma.user.delete({ where: { id } });
  },
  async getAllUsers() {
    return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  },
  async adminUpdateUser(id: string, data: any) {
    const { addCredits, creditType, ...otherData } = data;

    // Logic to handle specific credit pool top-ups
    if (addCredits !== undefined && creditType) {
      return prisma.user.update({
        where: { id },
        data: {
          [creditType]: { increment: parseFloat(addCredits) }, // ✅ Changed to parseFloat
          ...otherData,
        },
      });
    }

    return prisma.user.update({ where: { id }, data: otherData });
  },

  // === NEW: PROJECT ===
  async createProject(userId: string, name: string) {
    return prisma.project.create({
      data: {
        userId,
        name,
      },
    });
  },
  async getUserProjects(userId: string) {
    return prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },
  async getProjectById(id: string) {
    return prisma.project.findUnique({
      where: { id },
    });
  },
  async deleteProject(id: string) {
    return prisma.project.delete({
      where: { id },
    });
  },

  // === CREDITS (Kept Intact for Backward Compatibility) ===
  async deductCredits(id: string, amount: number) {
    return prisma.user.update({
      where: { id },
      data: { creditBalance: { decrement: amount } },
    });
  },
  async addCredits(id: string, amount: number) {
    return prisma.user.update({
      where: { id },
      data: { creditBalance: { increment: parseFloat(amount.toString()) } },
    });
  },
  async refundUserCredit(id: string, amount: number) {
    return this.addCredits(id, amount);
  },

  // === NEW: GRANULAR CREDIT LOGIC ===
  async deductGranularCredits(
    userId: string,
    pool:
      | "creditsPicDrift"
      | "creditsImageFX"
      | "creditsVideoFX1"
      | "creditsVideoFX2"
      | "creditsVideoFX3",
    amount: number,
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: { [pool]: { decrement: amount } },
    });
  },

  async refundGranularCredits(
    userId: string,
    pool:
      | "creditsPicDrift"
      | "creditsImageFX"
      | "creditsVideoFX1"
      | "creditsVideoFX2"
      | "creditsVideoFX3",
    amount: number,
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: { [pool]: { increment: amount } },
    });
  },

  // === ASSETS (Intact) ===
  async createAsset(
    userId: string,
    url: string,
    aspectRatio: string,
    type: string = "IMAGE",
    originalAssetId?: string,
    projectId?: string
  ) {
    return prisma.asset.create({
      data: {
        userId,
        url,
        aspectRatio,
        type: type as any,
        originalAssetId: originalAssetId || undefined,
        projectId: projectId || undefined,
      },
    });
  },
  async getUserAssets(userId: string, projectId?: string) {
    return prisma.asset.findMany({
      where: projectId ? { userId, projectId } : { userId },
      orderBy: { createdAt: "desc" },
      include: {
        variations: true,
        originalAsset: true,
      },
    });
  },
  async deleteAsset(id: string) {
    return prisma.asset.delete({ where: { id } });
  },

  // === POSTS (Intact) ===
  async createPost(data: any) {
    const script =
      typeof data.script === "string" ? JSON.parse(data.script) : data.script;
    const params =
      typeof data.generationParams === "string"
        ? JSON.parse(data.generationParams)
        : data.generationParams;

    return prisma.post.create({
      data: {
        userId: data.userId,
        projectId: data.projectId || undefined,
        title: data.title || "",
        prompt: data.prompt,
        mediaType: data.mediaType,
        mediaProvider: data.mediaProvider,
        platform: data.platform,
        status: data.status || "NEW",
        imageReference: data.imageReference,
        enhancedPrompt: data.enhancedPrompt,
        generationStep: data.generationStep,
        requiresApproval: data.requiresApproval,
        script: script || undefined,
        generationParams: params || undefined,
      },
    });
  },
  async deletePost(id: string) {
    return prisma.post.delete({ where: { id } });
  },
  async getPostById(id: string) {
    return prisma.post.findUnique({ where: { id } });
  },
  async getUserPosts(userId: string, projectId?: string) {
    return prisma.post.findMany({
      where: projectId ? {
        userId,
        projectId,
        platform: { not: "Internal" },
      } : {
        userId,
        platform: { not: "Internal" },
      },
      orderBy: { createdAt: "desc" },
    });
  },
  async updatePost(id: string, data: any) {
    return prisma.post.update({ where: { id }, data });
  },

  // === CONFIG & ROI (Restored getROIMetrics) ===
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

  // === NOTIFICATIONS (Intact) ===
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
