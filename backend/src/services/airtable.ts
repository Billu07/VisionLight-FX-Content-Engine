import Airtable from "airtable";
import dotenv from "dotenv";

dotenv.config();

console.log("🔑 Airtable Config Check:", {
  hasApiKey: !!process.env.AIRTABLE_API_KEY,
  hasBaseId: !!process.env.AIRTABLE_BASE_ID,
  baseId: process.env.AIRTABLE_BASE_ID?.substring(0, 10) + "...",
});

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID!);

export interface User {
  id: string;
  email: string;
  name?: string;
  demoCredits: { video: number; image: number; carousel: number };
  creditSystem: "COMMERCIAL" | "INTERNAL";
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface BrandConfig {
  id: string;
  userId: string;
  companyName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  updatedAt: Date;
}

export interface Post {
  id: string;
  userId: string;
  title?: string;
  prompt: string;
  enhancedPrompt?: string;
  imageReference?: string;
  userEditedPrompt?: string;
  generationStep?: string;
  requiresApproval?: boolean;
  mediaType?: "VIDEO" | "IMAGE" | "CAROUSEL";
  mediaUrl?: string;
  mediaProvider?: string;
  status: "NEW" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED" | "CANCELLED";
  platform: string;
  script?: any;
  bufferPostId?: string;
  error?: string;
  generationParams?: any;
  progress?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ROIMetrics {
  id: string;
  userId: string;
  postsCreated: number;
  timeSaved: number;
  mediaGenerated: number;
  updatedAt: Date;
}

export const airtableService = {
  // === USER OPERATIONS ===
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const records = await base("Users")
        .select({ filterByFormula: `{email} = '${email}'`, maxRecords: 1 })
        .firstPage();

      if (records.length === 0) return null;
      const record = records[0];
      return {
        id: record.id,
        email: record.get("email") as string,
        name: record.get("name") as string,
        demoCredits: JSON.parse(
          (record.get("demoCredits") as string) ||
            '{"video":2,"image":2,"carousel":2}'
        ),
        creditSystem:
          (record.get("creditSystem") as "COMMERCIAL" | "INTERNAL") ||
          "COMMERCIAL",
        adminNotes: record.get("adminNotes") as string,
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      throw error;
    }
  },

  async findUserById(userId: string): Promise<User | null> {
    try {
      const record = await base("Users").find(userId);
      return {
        id: record.id,
        email: record.get("email") as string,
        name: record.get("name") as string,
        demoCredits: JSON.parse(
          (record.get("demoCredits") as string) ||
            '{"video":2,"image":2,"carousel":2}'
        ),
        creditSystem:
          (record.get("creditSystem") as "COMMERCIAL" | "INTERNAL") ||
          "COMMERCIAL",
        adminNotes: record.get("adminNotes") as string,
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      return null;
    }
  },

  async createUser(userData: { email: string; name?: string }): Promise<User> {
    try {
      const now = new Date().toISOString();
      const record = await base("Users").create({
        email: userData.email,
        name: userData.name || "",
        demoCredits: JSON.stringify({ video: 2, image: 2, carousel: 2 }),
        creditSystem: "COMMERCIAL",
        createdAt: now,
        updatedAt: now,
      });
      return {
        id: record.id,
        email: record.get("email") as string,
        name: record.get("name") as string,
        demoCredits: JSON.parse(record.get("demoCredits") as string),
        creditSystem: "COMMERCIAL",
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      throw error;
    }
  },

  async updateUserCredits(
    userId: string,
    credits: { video: number; image: number; carousel: number }
  ): Promise<void> {
    try {
      await base("Users").update(userId, {
        demoCredits: JSON.stringify(credits),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  },

  async deleteUser(userId: string): Promise<void> {
    try {
      await base("Users").destroy(userId);
    } catch (error) {
      throw error;
    }
  },

  // === ADMIN OPERATIONS ===
  async getAllUsers(): Promise<User[]> {
    try {
      const records = await base("Users")
        .select({ sort: [{ field: "createdAt", direction: "desc" }] })
        .all();
      return records.map((record) => ({
        id: record.id,
        email: record.get("email") as string,
        name: record.get("name") as string,
        demoCredits: JSON.parse(
          (record.get("demoCredits") as string) ||
            '{"video":0,"image":0,"carousel":0}'
        ),
        creditSystem:
          (record.get("creditSystem") as "COMMERCIAL" | "INTERNAL") ||
          "COMMERCIAL",
        adminNotes: record.get("adminNotes") as string,
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      }));
    } catch (error) {
      throw error;
    }
  },

  async adminUpdateUser(
    userId: string,
    updates: {
      credits?: any;
      creditSystem?: "COMMERCIAL" | "INTERNAL";
      name?: string;
      adminNotes?: string;
    }
  ): Promise<void> {
    try {
      const updateData: any = { updatedAt: new Date().toISOString() };
      if (updates.credits)
        updateData.demoCredits = JSON.stringify(updates.credits);
      if (updates.creditSystem) updateData.creditSystem = updates.creditSystem;
      if (updates.name) updateData.name = updates.name;
      if (updates.adminNotes) updateData.adminNotes = updates.adminNotes;
      await base("Users").update(userId, updateData);
    } catch (error) {
      throw error;
    }
  },

  // === CREDIT REQUESTS (NOTIFICATIONS) ===
  async createCreditRequest(
    userId: string,
    email: string,
    name: string
  ): Promise<void> {
    try {
      await base("CreditRequests").create({
        userId: userId,
        email: email,
        name: name,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error creating credit request:", error);
      throw error;
    }
  },

  async getPendingCreditRequests(): Promise<any[]> {
    try {
      const records = await base("CreditRequests")
        .select({
          filterByFormula: `{status} = 'PENDING'`,
          sort: [{ field: "createdAt", direction: "desc" }],
        })
        .all();

      return records.map((r) => ({
        id: r.id,
        userId: r.get("userId"),
        email: r.get("email"),
        name: r.get("name"),
        createdAt: r.get("createdAt"),
      }));
    } catch (error) {
      return [];
    }
  },

  async resolveCreditRequest(requestId: string): Promise<void> {
    try {
      await base("CreditRequests").update(requestId, { status: "RESOLVED" });
    } catch (error) {
      throw error;
    }
  },

  // === BRAND CONFIG ===
  async getBrandConfig(userId: string): Promise<BrandConfig | null> {
    try {
      const allRecords = await base("BrandConfig").select().firstPage();
      const userConfig = allRecords.find((record) => {
        const userIdField = record.get("userId");
        return Array.isArray(userIdField) && userIdField.includes(userId);
      });
      if (!userConfig) return null;

      const userIdField = userConfig.get("userId");
      let actualUserId = Array.isArray(userIdField)
        ? String(userIdField[0])
        : String(userIdField);

      return {
        id: userConfig.id,
        userId: actualUserId,
        companyName: userConfig.get("companyName") as string,
        primaryColor: userConfig.get("primaryColor") as string,
        secondaryColor: userConfig.get("secondaryColor") as string,
        logoUrl: userConfig.get("logoUrl") as string,
        updatedAt: new Date(userConfig.get("updatedAt") as string),
      };
    } catch (error) {
      throw error;
    }
  },

  // FIX: Converted string 'now' back to Date for return object
  async upsertBrandConfig(configData: {
    userId: string;
    companyName?: string;
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
  }): Promise<BrandConfig> {
    try {
      const existing = await this.getBrandConfig(configData.userId);
      const now = new Date().toISOString();
      const payload = {
        companyName: configData.companyName,
        primaryColor: configData.primaryColor,
        secondaryColor: configData.secondaryColor,
        logoUrl: configData.logoUrl,
        updatedAt: now,
      };

      if (existing) {
        await base("BrandConfig").update(existing.id, payload);
        return { ...existing, ...payload, updatedAt: new Date(now) };
      } else {
        const record = await base("BrandConfig").create({
          userId: [configData.userId],
          ...payload,
        });
        return {
          id: record.id,
          userId: configData.userId,
          ...payload,
          updatedAt: new Date(now),
        } as BrandConfig;
      }
    } catch (error) {
      throw error;
    }
  },

  // === POSTS ===
  async createPost(postData: any): Promise<Post> {
    try {
      const now = new Date().toISOString();
      const record = await base("Posts").create({
        userId: [postData.userId],
        title: postData.title || "",
        prompt: postData.prompt,
        mediaType: postData.mediaType,
        platform: postData.platform,
        script: postData.script ? JSON.stringify(postData.script) : undefined,
        enhancedPrompt: postData.enhancedPrompt,
        imageReference: postData.imageReference,
        generationStep: postData.generationStep,
        requiresApproval: postData.requiresApproval !== false,
        generationParams: postData.generationParams
          ? JSON.stringify(postData.generationParams)
          : undefined,
        status: "NEW",
        progress: 0,
        createdAt: now,
        updatedAt: now,
      });
      return {
        id: record.id,
        ...postData,
        status: "NEW",
        progress: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      } as Post;
    } catch (error) {
      throw error;
    }
  },

  async updatePost(postId: string, updates: Partial<Post>): Promise<Post> {
    try {
      const updateData: any = {
        updatedAt: new Date().toISOString(),
        ...updates,
      };
      if (updates.script) updateData.script = JSON.stringify(updates.script);
      if (updates.generationParams)
        updateData.generationParams = JSON.stringify(updates.generationParams);

      const record = await base("Posts").update(postId, updateData);
      return { id: record.id, ...updates } as Post;
    } catch (error) {
      throw error;
    }
  },

  async getPostById(postId: string): Promise<Post | null> {
    try {
      const record = await base("Posts").find(postId);
      const userIdField = record.get("userId");
      let actualUserId = Array.isArray(userIdField)
        ? String(userIdField[0])
        : String(userIdField);

      return {
        id: record.id,
        userId: actualUserId,
        title: record.get("title") as string,
        prompt: record.get("prompt") as string,
        mediaType: record.get("mediaType") as any,
        mediaUrl: record.get("mediaUrl") as string,
        status: record.get("status") as any,
        progress: record.get("progress") as number,
        generationParams: record.get("generationParams")
          ? JSON.parse(record.get("generationParams") as string)
          : undefined,
        error: record.get("error") as string, // Added error mapping
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      } as Post;
    } catch (error) {
      return null;
    }
  },

  async getUserPosts(userId: string): Promise<any[]> {
    try {
      const allRecords = await base("Posts")
        .select({ sort: [{ field: "createdAt", direction: "desc" }] })
        .firstPage();
      const userPosts = allRecords.filter((record) => {
        const userIdField = record.get("userId");
        return Array.isArray(userIdField) && userIdField.includes(userId);
      });

      return userPosts.map((record) => {
        let mediaUrl = record.get("mediaUrl") as string;
        if (
          mediaUrl &&
          typeof mediaUrl === "string" &&
          mediaUrl.startsWith("http://")
        ) {
          mediaUrl = mediaUrl.replace("http://", "https://");
        }

        return {
          id: record.id,
          title: record.get("title"),
          prompt: record.get("prompt"),
          mediaUrl: mediaUrl,
          mediaType: record.get("mediaType"),
          status: record.get("status"),
          progress: record.get("progress"),
          error: record.get("error"),
          createdAt: record.get("createdAt"),
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }
  },

  // === SESSION (Auth) ===
  async validateSession(token: string) {
    /* Handled by Auth Service */ return null;
  },
  async createSession(userId: string, token: string) {
    return {
      id: "mock",
      userId,
      token,
      expiresAt: new Date(),
      createdAt: new Date(),
    };
  },
  async deleteSession(token: string) {
    return;
  },

  // === ROI METRICS ===
  async getROIMetrics(userId: string): Promise<ROIMetrics> {
    try {
      const allRecords = await base("ROIMetrics").select().firstPage();
      const userMetrics = allRecords.find((record) => {
        const userIdField = record.get("userId");
        return Array.isArray(userIdField) && userIdField.includes(userId);
      });

      if (!userMetrics) {
        const now = new Date().toISOString();
        const record = await base("ROIMetrics").create({
          userId: [userId],
          postsCreated: 0,
          timeSaved: 0,
          mediaGenerated: 0,
          updatedAt: now,
        });
        return {
          id: record.id,
          userId,
          postsCreated: 0,
          timeSaved: 0,
          mediaGenerated: 0,
          updatedAt: new Date(now),
        };
      }

      return {
        id: userMetrics.id,
        userId,
        postsCreated: userMetrics.get("postsCreated") as number,
        timeSaved: userMetrics.get("timeSaved") as number,
        mediaGenerated: userMetrics.get("mediaGenerated") as number,
        updatedAt: new Date(userMetrics.get("updatedAt") as string),
      };
    } catch (error) {
      throw error;
    }
  },

  async updateROIMetrics(
    userId: string,
    updates: Partial<Omit<ROIMetrics, "id" | "userId" | "updatedAt">>
  ): Promise<ROIMetrics> {
    try {
      const existing = await this.getROIMetrics(userId);
      const now = new Date().toISOString();
      const updateData: any = { updatedAt: now, ...updates };

      await base("ROIMetrics").update(existing.id, updateData);

      return {
        ...existing,
        ...updates,
        updatedAt: new Date(now),
      };
    } catch (error) {
      throw error;
    }
  },
};
