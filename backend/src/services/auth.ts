import { createClient } from "@supabase/supabase-js";
import { dbService as airtableService } from "./database";
import dotenv from "dotenv";

dotenv.config();

// Initialize Supabase Admin Client
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase Credentials in .env");
}

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

// Load Super Admins from Backend ENV (Safety Net)
const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAILS || "";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW.split(",").map((email) =>
  email.trim().toLowerCase(),
).filter(Boolean);

export class AuthService {
  /**
   * ADMIN ONLY: Creates a user in Supabase AND ensures they exist in Database.
   */
  static async createSystemUser(
    email: string,
    password: string,
    name: string,
    view: string = "VISIONLIGHT",
    maxProjects: number = 3,
    organizationId?: string,
    role?: string,
    isDemo?: boolean,
  ) {
    // 1. Attempt to create in Supabase
    let supabaseUser;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        console.log(`ℹ️ User ${email} already in Supabase. Syncing identity...`);
        // Find existing user to get ID
        const { data: list } = await supabase.auth.admin.listUsers();
        const existingAuth = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        
        if (existingAuth) {
          // Update password to match the new form
          await supabase.auth.admin.updateUserById(existingAuth.id, { password });
          supabaseUser = existingAuth;
        } else {
          throw new Error("Conflict: Supabase says user exists but cannot find them.");
        }
      } else {
        throw new Error(`Supabase Create Failed: ${error.message}`);
      }
    } else {
      supabaseUser = data.user;
    }

    // 2. Sync with Database
    const existingDbUser = await airtableService.findUserByEmail(email);
    let dbUser;

    if (!existingDbUser) {
      dbUser = await airtableService.createUser({
        id: supabaseUser.id, // 👈 Pass the Supabase UUID
        email,
        name,
        view,
        maxProjects,
        organizationId,
        role,
        isDemo,
      });
    } else {
      // If they exist in DB, update them to the new Org/Role
      dbUser = await airtableService.adminUpdateUser(existingDbUser.id, {
        organizationId,
        role,
        view,
        name,
        maxProjects,
        isDemo: isDemo === true,
      });
    }

    return dbUser; // 👈 Return the DB record for the router to use
  }

  /**
   * ADMIN ONLY: Deletes a user from Supabase to prevent login.
   */
  static async deleteSupabaseUserByEmail(email: string) {
    // 1. Find the Supabase User ID (UUID)
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) throw listError;

    const userToDelete = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    // 2. If found, delete by ID
    if (userToDelete) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(
        userToDelete.id,
      );
      if (deleteError) throw deleteError;
      return true;
    }

    return false;
  }

  /**
   * ADMIN ONLY: Force update a user's password in Supabase.
   */
  static async updateSupabaseUserPassword(email: string, newPassword: string) {
    // 1. Find the Supabase User
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) throw listError;

    const userToUpdate = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    // 2. If found, update by ID
    if (userToUpdate) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userToUpdate.id,
        { password: newPassword }
      );
      if (updateError) throw updateError;
      return true;
    }

    throw new Error(`User ${email} not found in Supabase Auth.`);
  }

  /**
   * Validates the Bearer token (JWT) from Supabase.
   * ✅ UPDATED: Checks .env AND Database for Admin Role.
   */
  static async validateSession(token: string) {
    try {
      const {
        data: { user: supabaseUser },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !supabaseUser || !supabaseUser.email) {
        return null;
      }

      let user = await airtableService.findUserByEmail(supabaseUser.email);

      if (!user) {
        console.log(
          `⚠️ User ${supabaseUser.email} found in Supabase but missing in DB. Re-syncing...`,
        );
        user = await airtableService.createUser({
          email: supabaseUser.email,
          name:
            supabaseUser.user_metadata?.full_name ||
            supabaseUser.email.split("@")[0],
        });
      }

      if (!user) return null;

      // 1. Check .env (Super Admin Safety Net)
      const isSuperAdminEnv = ADMIN_EMAILS.includes(user.email.toLowerCase());

      // 2. Check Database (Dynamic Role)
      const dbRole = (user as any).role;

      // 3. Determine Final Role
      let finalRole = "USER";
      if (isSuperAdminEnv || dbRole === "SUPERADMIN") {
        finalRole = "SUPERADMIN";
      } else if (dbRole === "ADMIN") {
        finalRole = "ADMIN";
      } else if (dbRole === "MANAGER") {
        finalRole = "MANAGER";
      }

      // 4. Enforce Organization Active Status
      if (finalRole !== "SUPERADMIN") {
        const org = (user as any).organization;
        if (org && org.isActive === false) {
          console.log(`🚫 Rejecting session for ${user.email}: Organization is deactivated.`);
          return null; // Deny access
        }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        creditSystem: user.creditSystem,
        isDemo: (user as any).isDemo === true,
        role: finalRole,
        organizationId: user.organizationId,
        view: (user as any).view || "VISIONLIGHT",
        maxProjects: (user as any).maxProjects || 3,
      };
    } catch (error) {
      console.error("Auth Validation Error:", error);
      return null;
    }
  }

  static async deleteSession(token: string) {
    return;
  }
}
