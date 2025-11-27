// backend/src/services/airtable.ts
import Airtable from "airtable";
import dotenv from "dotenv";

// Load environment variables FIRST
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
  prompt: string;
  enhancedPrompt?: string;
  imageReference?: string;
  userEditedPrompt?: string;
  generationStep?:
    | "PROMPT_ENHANCEMENT"
    | "AWAITING_APPROVAL"
    | "GENERATION"
    | "COMPLETED";
  requiresApproval?: boolean;
  mediaType?: "VIDEO" | "IMAGE" | "CAROUSEL";
  mediaUrl?: string;
  mediaProvider?: string;
  status: "NEW" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED" | "CANCELLED";
  platform: string;
  script?: any;
  bufferPostId?: string;
  generationParams?: any; // NEW
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
  // User operations
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const records = await base("Users")
        .select({
          filterByFormula: `{email} = '${email}'`,
          maxRecords: 1,
        })
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
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable findUserByEmail error:", error);
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
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable findUserById error:", error);
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
        createdAt: now,
        updatedAt: now,
      });

      return {
        id: record.id,
        email: record.get("email") as string,
        name: record.get("name") as string,
        demoCredits: JSON.parse(record.get("demoCredits") as string),
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable createUser error:", error);
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
      console.error("Airtable updateUserCredits error:", error);
      throw error;
    }
  },

  // Session operations
  async createSession(userId: string, token: string): Promise<Session> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const record = await base("Sessions").create({
        userId: [userId],
        token,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      });

      return {
        id: record.id,
        userId,
        token,
        expiresAt,
        createdAt: now,
      };
    } catch (error) {
      console.error("Airtable createSession error:", error);
      throw error;
    }
  },

  async findSessionByToken(token: string): Promise<Session | null> {
    try {
      const records = await base("Sessions")
        .select({
          filterByFormula: `{token} = '${token}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (records.length === 0) return null;

      const record = records[0];

      const userIdField = record.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        if (typeof firstElement === "string") {
          actualUserId = firstElement;
        } else {
          console.warn(
            "❌ Unexpected userId format in findSessionByToken:",
            userIdField
          );
          actualUserId = "";
        }
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        console.warn(
          "❌ Unexpected userId format in findSessionByToken:",
          userIdField
        );
        actualUserId = "";
      }

      return {
        id: record.id,
        userId: actualUserId,
        token: record.get("token") as string,
        expiresAt: new Date(record.get("expiresAt") as string),
        createdAt: new Date(record.get("createdAt") as string),
      };
    } catch (error) {
      console.error("Airtable findSessionByToken error:", error);
      throw error;
    }
  },

  async deleteSession(token: string): Promise<void> {
    try {
      const records = await base("Sessions")
        .select({
          filterByFormula: `{token} = '${token}'`,
        })
        .firstPage();

      if (records.length > 0) {
        await base("Sessions").destroy(records.map((record) => record.id));
      }
    } catch (error) {
      console.error("Airtable deleteSession error:", error);
      throw error;
    }
  },

  // BrandConfig operations
  async getBrandConfig(userId: string): Promise<BrandConfig | null> {
    try {
      const allRecords = await base("BrandConfig").select().firstPage();

      const userConfig = allRecords.find((record) => {
        const userIdField = record.get("userId");
        return Array.isArray(userIdField) && userIdField.includes(userId);
      });

      if (!userConfig) return null;

      const userIdField = userConfig.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        actualUserId =
          typeof firstElement === "string"
            ? firstElement
            : String(firstElement);
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        actualUserId = String(userIdField || "");
      }

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
      console.error("Airtable getBrandConfig error:", error);
      throw error;
    }
  },

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

      if (existing) {
        const record = await base("BrandConfig").update(existing.id, {
          companyName: configData.companyName,
          primaryColor: configData.primaryColor,
          secondaryColor: configData.secondaryColor,
          logoUrl: configData.logoUrl,
          updatedAt: now,
        });

        const userIdField = record.get("userId");
        let actualUserId: string;

        if (Array.isArray(userIdField) && userIdField.length > 0) {
          const firstElement = userIdField[0];
          if (typeof firstElement === "string") {
            actualUserId = firstElement;
          } else {
            console.warn(
              "❌ Unexpected userId format in upsertBrandConfig:",
              userIdField
            );
            actualUserId = configData.userId;
          }
        } else if (typeof userIdField === "string") {
          actualUserId = userIdField;
        } else {
          console.warn(
            "❌ Unexpected userId format in upsertBrandConfig:",
            userIdField
          );
          actualUserId = configData.userId;
        }

        return {
          id: record.id,
          userId: actualUserId,
          companyName: record.get("companyName") as string,
          primaryColor: record.get("primaryColor") as string,
          secondaryColor: record.get("secondaryColor") as string,
          logoUrl: record.get("logoUrl") as string,
          updatedAt: new Date(record.get("updatedAt") as string),
        };
      } else {
        const record = await base("BrandConfig").create({
          userId: [configData.userId],
          companyName: configData.companyName,
          primaryColor: configData.primaryColor,
          secondaryColor: configData.secondaryColor,
          logoUrl: configData.logoUrl,
          updatedAt: now,
        });

        return {
          id: record.id,
          userId: configData.userId,
          companyName: record.get("companyName") as string,
          primaryColor: record.get("primaryColor") as string,
          secondaryColor: record.get("secondaryColor") as string,
          logoUrl: record.get("logoUrl") as string,
          updatedAt: new Date(record.get("updatedAt") as string),
        };
      }
    } catch (error) {
      console.error("Airtable upsertBrandConfig error:", error);
      throw error;
    }
  },

  // Post operations
  async createPost(postData: {
    userId: string;
    prompt: string;
    mediaType?: "VIDEO" | "IMAGE" | "CAROUSEL";
    platform: string;
    script?: any;
    enhancedPrompt?: string;
    imageReference?: string;
    generationStep?: string;
    requiresApproval?: boolean;
    generationParams?: any; // NEW
  }): Promise<Post> {
    try {
      const now = new Date().toISOString();
      const record = await base("Posts").create({
        userId: [postData.userId],
        prompt: postData.prompt,
        mediaType: postData.mediaType,
        platform: postData.platform,
        script: postData.script ? JSON.stringify(postData.script) : undefined,
        enhancedPrompt: postData.enhancedPrompt,
        imageReference: postData.imageReference,
        generationStep: postData.generationStep || "PROMPT_ENHANCEMENT",
        requiresApproval: postData.requiresApproval !== false,
        generationParams: postData.generationParams
          ? JSON.stringify(postData.generationParams)
          : undefined, // NEW
        status: "NEW",
        createdAt: now,
        updatedAt: now,
      });

      const userIdField = record.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        if (typeof firstElement === "string") {
          actualUserId = firstElement;
        } else {
          console.warn(
            "❌ Unexpected userId format in createPost:",
            userIdField
          );
          actualUserId = postData.userId;
        }
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        console.warn("❌ Unexpected userId format in createPost:", userIdField);
        actualUserId = postData.userId;
      }

      return {
        id: record.id,
        userId: actualUserId,
        prompt: record.get("prompt") as string,
        enhancedPrompt: record.get("enhancedPrompt") as string,
        generationStep: record.get("generationStep") as string,
        requiresApproval: record.get("requiresApproval") as boolean,
        userEditedPrompt: record.get("userEditedPrompt") as string,
        imageReference: record.get("imageReference") as string,
        generationParams: record.get("generationParams")
          ? JSON.parse(record.get("generationParams") as string)
          : undefined, // NEW
        mediaType: record.get("mediaType") as "VIDEO" | "IMAGE" | "CAROUSEL",
        mediaUrl: record.get("mediaUrl") as string,
        mediaProvider: record.get("mediaProvider") as string,
        status: record.get("status") as any,
        platform: record.get("platform") as string,
        script: record.get("script")
          ? JSON.parse(record.get("script") as string)
          : undefined,
        bufferPostId: record.get("bufferPostId") as string,
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable createPost error:", error);
      throw error;
    }
  },

  async updatePost(postId: string, updates: Partial<Post>): Promise<Post> {
    try {
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };

      // Existing fields
      if (updates.mediaUrl !== undefined)
        updateData.mediaUrl = updates.mediaUrl;
      if (updates.mediaType !== undefined)
        updateData.mediaType = updates.mediaType;
      if (updates.mediaProvider !== undefined)
        updateData.mediaProvider = updates.mediaProvider;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.bufferPostId !== undefined)
        updateData.bufferPostId = updates.bufferPostId;
      if (updates.script !== undefined)
        updateData.script = JSON.stringify(updates.script);

      // NEW fields
      if (updates.enhancedPrompt !== undefined)
        updateData.enhancedPrompt = updates.enhancedPrompt;
      if (updates.imageReference !== undefined)
        updateData.imageReference = updates.imageReference;
      if (updates.userEditedPrompt !== undefined)
        updateData.userEditedPrompt = updates.userEditedPrompt;
      if (updates.generationStep !== undefined)
        updateData.generationStep = updates.generationStep;
      if (updates.requiresApproval !== undefined)
        updateData.requiresApproval = updates.requiresApproval;
      if (updates.generationParams !== undefined)
        updateData.generationParams = JSON.stringify(updates.generationParams); // NEW

      const record = await base("Posts").update(postId, updateData);

      const userIdField = record.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        if (typeof firstElement === "string") {
          actualUserId = firstElement;
        } else {
          console.warn(
            "❌ Unexpected userId format in updatePost:",
            userIdField
          );
          actualUserId = "";
        }
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        console.warn("❌ Unexpected userId format in updatePost:", userIdField);
        actualUserId = "";
      }

      return {
        id: record.id,
        userId: actualUserId,
        prompt: record.get("prompt") as string,
        mediaType: record.get("mediaType") as "VIDEO" | "IMAGE" | "CAROUSEL",
        mediaUrl: record.get("mediaUrl") as string,
        mediaProvider: record.get("mediaProvider") as string,
        status: record.get("status") as any,
        platform: record.get("platform") as string,
        script: record.get("script")
          ? JSON.parse(record.get("script") as string)
          : undefined,
        bufferPostId: record.get("bufferPostId") as string,
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable updatePost error:", error);
      throw error;
    }
  },

  async getPostById(postId: string): Promise<Post | null> {
    try {
      const record = await base("Posts").find(postId);

      const userIdField = record.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        actualUserId =
          typeof firstElement === "string"
            ? firstElement
            : String(firstElement);
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        actualUserId = String(userIdField || "");
      }

      return {
        id: record.id,
        userId: actualUserId,
        prompt: record.get("prompt") as string,
        enhancedPrompt: record.get("enhancedPrompt") as string,
        generationStep: record.get("generationStep") as string,
        requiresApproval: record.get("requiresApproval") as boolean,
        userEditedPrompt: record.get("userEditedPrompt") as string,
        imageReference: record.get("imageReference") as string,
        generationParams: record.get("generationParams")
          ? JSON.parse(record.get("generationParams") as string)
          : undefined, // NEW
        mediaType: record.get("mediaType") as "VIDEO" | "IMAGE" | "CAROUSEL",
        mediaUrl: record.get("mediaUrl") as string,
        mediaProvider: record.get("mediaProvider") as string,
        status: record.get("status") as any,
        platform: record.get("platform") as string,
        script: record.get("script")
          ? JSON.parse(record.get("script") as string)
          : undefined,
        bufferPostId: record.get("bufferPostId") as string,
        createdAt: new Date(record.get("createdAt") as string),
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable getPostById error:", error);
      return null;
    }
  },

  async getUserPosts(userId: string): Promise<any[]> {
    try {
      console.log("🔍 Fetching ALL posts to filter for user:", userId);

      const allRecords = await base("Posts")
        .select({
          sort: [{ field: "createdAt", direction: "desc" }],
        })
        .firstPage();

      console.log(`📊 Total posts in Airtable: ${allRecords.length}`);

      const userPosts = allRecords.filter((record) => {
        const userIdField = record.get("userId");
        const isUserPost =
          Array.isArray(userIdField) && userIdField.includes(userId);
        return isUserPost;
      });

      console.log(`🎯 Found ${userPosts.length} posts for user ${userId}`);

      const posts = userPosts.map((record) => {
        const userIdField = record.get("userId");
        const mediaUrl = record.get("mediaUrl");

        let actualUserId: string;
        if (Array.isArray(userIdField) && userIdField.length > 0) {
          const firstElement = userIdField[0];
          actualUserId =
            typeof firstElement === "string"
              ? firstElement
              : String(firstElement);
        } else if (typeof userIdField === "string") {
          actualUserId = userIdField;
        } else {
          actualUserId = String(userIdField || "");
        }

        return {
          id: record.id,
          userId: actualUserId,
          prompt: record.get("prompt") as string,
          enhancedPrompt: record.get("enhancedPrompt") as string,
          generationStep: record.get("generationStep") as string,
          requiresApproval: record.get("requiresApproval") as boolean,
          userEditedPrompt: record.get("userEditedPrompt") as string,
          imageReference: record.get("imageReference") as string,
          generationParams: record.get("generationParams")
            ? JSON.parse(record.get("generationParams") as string)
            : undefined, // NEW
          mediaType: record.get("mediaType") as "VIDEO" | "IMAGE" | "CAROUSEL",
          platform: record.get("platform") as string,
          status: record.get("status") as any,
          mediaUrl: mediaUrl as string,
          mediaProvider: record.get("mediaProvider") as string,
          script: record.get("script")
            ? JSON.parse(record.get("script") as string)
            : undefined,
          createdAt: new Date(record.get("createdAt") as string),
          updatedAt: new Date(record.get("updatedAt") as string),
        };
      });

      return posts;
    } catch (error: any) {
      console.error("❌ Error fetching user posts:", error);
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }
  },

  // ROI Metrics operations
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
          userId: userId,
          postsCreated: record.get("postsCreated") as number,
          timeSaved: record.get("timeSaved") as number,
          mediaGenerated: record.get("mediaGenerated") as number,
          updatedAt: new Date(record.get("updatedAt") as string),
        };
      }

      const userIdField = userMetrics.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        actualUserId =
          typeof firstElement === "string"
            ? firstElement
            : String(firstElement);
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        actualUserId = String(userIdField || "");
      }

      return {
        id: userMetrics.id,
        userId: actualUserId,
        postsCreated: userMetrics.get("postsCreated") as number,
        timeSaved: userMetrics.get("timeSaved") as number,
        mediaGenerated: userMetrics.get("mediaGenerated") as number,
        updatedAt: new Date(userMetrics.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable getROIMetrics error:", error);
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

      const updateData: any = {
        updatedAt: now,
      };

      if (updates.postsCreated !== undefined)
        updateData.postsCreated = updates.postsCreated;
      if (updates.timeSaved !== undefined)
        updateData.timeSaved = updates.timeSaved;
      if (updates.mediaGenerated !== undefined)
        updateData.mediaGenerated = updates.mediaGenerated;

      const record = await base("ROIMetrics").update(existing.id, updateData);

      const userIdField = record.get("userId");
      let actualUserId: string;

      if (Array.isArray(userIdField) && userIdField.length > 0) {
        const firstElement = userIdField[0];
        if (typeof firstElement === "string") {
          actualUserId = firstElement;
        } else {
          console.warn(
            "❌ Unexpected userId format in updateROIMetrics:",
            userIdField
          );
          actualUserId = userId;
        }
      } else if (typeof userIdField === "string") {
        actualUserId = userIdField;
      } else {
        console.warn(
          "❌ Unexpected userId format in updateROIMetrics:",
          userIdField
        );
        actualUserId = userId;
      }

      return {
        id: record.id,
        userId: actualUserId,
        postsCreated: record.get("postsCreated") as number,
        timeSaved: record.get("timeSaved") as number,
        mediaGenerated: record.get("mediaGenerated") as number,
        updatedAt: new Date(record.get("updatedAt") as string),
      };
    } catch (error) {
      console.error("Airtable updateROIMetrics error:", error);
      throw error;
    }
  },
};
