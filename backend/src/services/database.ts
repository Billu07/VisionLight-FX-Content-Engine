import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export type {
  User,
  Post,
  Asset,
  BrandConfig,
  ROIMetrics,
} from "@prisma/client";

export type CreditPool =
  | "creditsPicDrift"
  | "creditsPicDriftPlus"
  | "creditsImageFX"
  | "creditsVideoFX1"
  | "creditsVideoFX2"
  | "creditsVideoFX3";

export const CREDIT_POOLS: CreditPool[] = [
  "creditsPicDrift",
  "creditsPicDriftPlus",
  "creditsImageFX",
  "creditsVideoFX1",
  "creditsVideoFX2",
  "creditsVideoFX3",
];

const isValidCreditPool = (value: string): value is CreditPool =>
  CREDIT_POOLS.includes(value as CreditPool);

const toFiniteNumber = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeNonNegativeInt = (value: any, fallback = 0) => {
  const n = toFiniteNumber(value);
  if (n === null) return fallback;
  return Math.max(0, Math.round(n));
};

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

  // === ORGANIZATION ===
  async createOrganization(data: {
    name: string;
    maxUsers: number;
    maxProjectsTotal: number;
    maxStorageMb?: number;
    isDefault?: boolean;
    tenantPlan?: string;
    trialEndsAt?: Date | null;
  }) {
    return prisma.organization.create({
      data: {
        name: data.name,
        maxUsers: data.maxUsers,
        maxProjectsTotal: data.maxProjectsTotal,
        maxStorageMb: data.maxStorageMb || 500,
        isDefault: data.isDefault || false,
        tenantPlan: data.tenantPlan || "PAID",
        trialEndsAt: data.trialEndsAt || null,
      } as any,
    });
  },

  async getOrganization(orgId: string) {
    return prisma.organization.findUnique({
      where: { id: orgId },
    });
  },

  async getDefaultOrganization() {
    return prisma.organization.findFirst({
      where: { isDefault: true },
    });
  },

  async updateOrganization(orgId: string, data: any) {
    return prisma.organization.update({
      where: { id: orgId },
      data,
    });
  },

  async updateOrganizationStatus(orgId: string, isActive: boolean) {
    return prisma.organization.update({
      where: { id: orgId },
      data: { isActive },
    });
  },

  // === USER ===
  async findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });
  },
  async findUsersByEmail(email: string) {
    return prisma.user.findMany({
      where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
  },
  async findUsersForAuthIdentity(authUserId: string, email: string) {
    const orClauses: any[] = [
      { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
    ];
    if (authUserId?.trim()) {
      orClauses.unshift({ authUserId });
    }

    return prisma.user.findMany({
      where: {
        OR: orClauses,
      },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
  },
  async findUserProfileForAuthIdentity(
    profileId: string,
    authUserId: string,
    email: string,
  ) {
    return prisma.user.findFirst({
      where: {
        id: profileId,
        OR: [
          { authUserId },
          { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
        ],
      },
      include: { organization: true },
    });
  },
  async attachAuthIdentityToEmail(email: string, authUserId: string) {
    return prisma.user.updateMany({
      where: {
        email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
        OR: [{ authUserId: null }, { authUserId: "" }],
      },
      data: { authUserId },
    });
  },
  async attachAuthIdentityToUser(userId: string, authUserId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { authUserId },
      include: { organization: true },
    });
  },
  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { organization: true },
    });
  },
  async createUser(data: {
    id?: string; // 👈 Allow passing Supabase UUID
    email: string;
    authUserId?: string;
    name?: string;
    view?: string;
    maxProjects?: number;
    organizationId?: string;
    role?: string;
    isDemo?: boolean;
    // Allow explicit override of credits during creation
    creditsPicDrift?: number;
    creditsPicDriftPlus?: number;
    creditsImageFX?: number;
    creditsVideoFX1?: number;
    creditsVideoFX2?: number;
    creditsVideoFX3?: number;
    creditBalance?: number;
  }) {
    const isDemo = data.isDemo === true;
    // Users in a Tenant Organization start with 0 credits unless specified.
    const hasOrg = !!data.organizationId;

    return prisma.user.create({
      data: {
        id: data.id, // 👈 Map Supabase ID here
        authUserId: data.authUserId,
        email: data.email.trim().toLowerCase(),
        name: data.name,
        view: data.view || "VISIONLIGHT",
        maxProjects: data.maxProjects || 3,
        organizationId: data.organizationId,
        creditBalance: data.creditBalance !== undefined ? data.creditBalance : (isDemo ? 0 : (hasOrg ? 0 : 20)),
        creditsPicDrift: data.creditsPicDrift !== undefined ? data.creditsPicDrift : (isDemo ? 5 : (hasOrg ? 0 : 10)),
        creditsPicDriftPlus: data.creditsPicDriftPlus !== undefined ? data.creditsPicDriftPlus : (isDemo ? 0 : (hasOrg ? 0 : 10)),
        creditsImageFX: data.creditsImageFX !== undefined ? data.creditsImageFX : (isDemo ? 15 : (hasOrg ? 0 : 10)),
        creditsVideoFX1: data.creditsVideoFX1 !== undefined ? data.creditsVideoFX1 : (isDemo ? 0 : (hasOrg ? 0 : 10)),
        creditsVideoFX2: data.creditsVideoFX2 !== undefined ? data.creditsVideoFX2 : (isDemo ? 0 : (hasOrg ? 0 : 10)),
        creditsVideoFX3: data.creditsVideoFX3 !== undefined ? data.creditsVideoFX3 : (isDemo ? 0 : (hasOrg ? 0 : 10)),
        creditSystem: isDemo ? "INTERNAL" : "COMMERCIAL",
        isDemo,
        role: data.role || "USER",
      },
      include: { organization: true },
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

    if (otherData.maxProjects !== undefined) {
      otherData.maxProjects = Math.max(1, normalizeNonNegativeInt(otherData.maxProjects, 1));
    }

    for (const pool of CREDIT_POOLS) {
      if (otherData[pool] !== undefined) {
        otherData[pool] = normalizeNonNegativeInt(otherData[pool]);
      }
    }

    // Logic to handle specific credit pool top-ups
    if (addCredits !== undefined && creditType) {
      if (!isValidCreditPool(creditType)) {
        throw new Error("INVALID_CREDIT_POOL");
      }

      const delta = toFiniteNumber(addCredits);
      if (delta === null) {
        throw new Error("INVALID_CREDIT_AMOUNT");
      }

      const current = await prisma.user.findUnique({
        where: { id },
        select: { [creditType]: true } as any,
      });
      if (!current) {
        throw new Error("USER_NOT_FOUND");
      }

      const currentVal = normalizeNonNegativeInt((current as any)[creditType], 0);
      const deltaInt = Math.round(delta);
      const nextVal = currentVal + deltaInt;
      if (nextVal < 0) {
        throw new Error("CREDIT_UNDERFLOW");
      }

      return prisma.user.update({
        where: { id },
        data: {
          [creditType]: nextVal,
          ...otherData,
        },
      });
    }

    return prisma.user.update({ where: { id }, data: otherData });
  },

  // === NEW: PROJECT ===
  async createProject(userId: string, name: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    return prisma.project.create({
      data: {
        userId,
        name,
        organizationId: user?.organizationId || undefined,
      },
    });
  },
  async createProjectWithLimits(userId: string, name: string) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: userId },
              include: { organization: true },
            });

            if (!user) {
              throw new Error("USER_NOT_FOUND");
            }

            const userProjectCount = await tx.project.count({
              where: { userId },
            });

            if (userProjectCount >= user.maxProjects) {
              throw new Error("USER_PROJECT_LIMIT");
            }

            if (user.organizationId && user.organization) {
              const orgProjectCount = await tx.project.count({
                where: {
                  OR: [
                    { organizationId: user.organizationId },
                    {
                      organizationId: null,
                      user: { organizationId: user.organizationId },
                    },
                  ],
                },
              });

              if (orgProjectCount >= user.organization.maxProjectsTotal) {
                throw new Error("ORG_PROJECT_LIMIT");
              }
            }

            return tx.project.create({
              data: {
                userId,
                name,
                organizationId: user.organizationId || undefined,
              },
            });
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error: any) {
        const isSerializationError = error?.code === "P2034";
        if (isSerializationError && attempt < maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("PROJECT_CREATE_FAILED");
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
  async updateProject(id: string, data: { name?: string, editorState?: any }) {
    return prisma.project.update({
      where: { id },
      data,
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
    pool: CreditPool,
    amount: number,
  ) {
    const delta = normalizeNonNegativeInt(amount);
    if (delta <= 0) return prisma.user.findUnique({ where: { id: userId } });
    return prisma.user.update({
      where: { id: userId },
      data: { [pool]: { decrement: delta } },
    });
  },

  async refundGranularCredits(
    userId: string,
    pool: CreditPool,
    amount: number,
  ) {
    const delta = normalizeNonNegativeInt(amount);
    if (delta <= 0) return prisma.user.findUnique({ where: { id: userId } });
    return prisma.user.update({
      where: { id: userId },
      data: { [pool]: { increment: delta } },
    });
  },

  // === ASSETS (Intact) ===
  async createAsset(
    userId: string,
    url: string,
    aspectRatio: string,
    type: string = "IMAGE",
    originalAssetId?: string,
    projectId?: string,
    sizeBytes?: number
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return prisma.asset.create({
      data: {
        userId,
        url,
        aspectRatio,
        type: type as any,
        originalAssetId: originalAssetId || undefined,
        projectId: projectId || undefined,
        sizeBytes: sizeBytes || null,
        organizationId: user?.organizationId,
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
  async getAssetById(id: string) {
    return prisma.asset.findUnique({
      where: { id },
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
    // Lazy Cleanup: Automatically fail jobs older than 15 minutes that are stuck in 'PROCESSING' or 'NEW'
    const timeout = new Date(Date.now() - 15 * 60 * 1000);
    try {
      const stalePosts = await prisma.post.findMany({
        where: {
          userId,
          status: { in: ["PROCESSING", "NEW"] },
          createdAt: { lt: timeout },
        },
        select: { id: true, generationParams: true },
      });

      for (const stalePost of stalePosts) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.post.updateMany({
            where: {
              id: stalePost.id,
              userId,
              status: { in: ["PROCESSING", "NEW"] },
            },
            data: {
              status: "FAILED",
              error: "Job timed out (Automatic Cleanup)",
              progress: 0,
            },
          });

          if (updated.count === 0) return;

          const paramsRaw = stalePost.generationParams;
          const parsedParams =
            typeof paramsRaw === "string"
              ? (() => {
                  try {
                    return JSON.parse(paramsRaw);
                  } catch {
                    return null;
                  }
                })()
              : paramsRaw;
          const chargedPool = (parsedParams as any)?.chargedPool;
          const chargedCost = normalizeNonNegativeInt((parsedParams as any)?.cost);

          if (
            typeof chargedPool === "string" &&
            isValidCreditPool(chargedPool) &&
            chargedCost > 0
          ) {
            await tx.user.update({
              where: { id: userId },
              data: { [chargedPool]: { increment: chargedCost } },
            });
          }
        });
      }
    } catch (e) {
      console.error("Lazy cleanup failed:", e);
    }

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
  async updateROIMetrics(userId: string, data: any) {
    return prisma.rOIMetrics.update({
      where: { userId },
      data: {
        ...data,
      },
    });
  },

  // === NOTIFICATIONS (Intact) ===
  async createCreditRequest(
    userId: string,
    email: string,
    name: string,
    organizationId?: string | null,
  ) {
    return prisma.creditRequest.create({
      data: {
        userId,
        email,
        name,
        organizationId: organizationId || undefined,
      },
    });
  },
  async getPendingCreditRequests() {
    return prisma.creditRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            organizationId: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },
  async getPendingCreditRequestsByOrganization(organizationId: string) {
    return prisma.creditRequest.findMany({
      where: {
        status: "PENDING",
        organizationId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            organizationId: true,
          },
        },
      },
    });
  },
  async resolveCreditRequest(id: string) {
    return prisma.creditRequest.update({
      where: { id },
      data: { status: "RESOLVED" },
    });
  },
  async resolveCreditRequestForOrganization(id: string, organizationId: string) {
    const result = await prisma.creditRequest.updateMany({
      where: {
        id,
        organizationId,
        status: "PENDING",
      },
      data: { status: "RESOLVED" },
    });

    if (result.count === 0) {
      return null;
    }

    return prisma.creditRequest.findUnique({ where: { id } });
  },

  // === STORYBOARD PERSISTENCE ===
  async getStoryboard(userId: string, projectId?: string) {
    if (projectId && projectId !== "default") {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      return project?.storyboard || [];
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user?.storyboard || [];
  },
  async updateStoryboard(userId: string, sequence: any, projectId?: string) {
    if (projectId && projectId !== "default") {
      return prisma.project.update({
        where: { id: projectId },
        data: { storyboard: sequence },
      });
    }
    return prisma.user.update({
      where: { id: userId },
      data: { storyboard: sequence },
    });
  },
};
