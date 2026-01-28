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

// Load Admins from Backend ENV (Security Best Practice)
const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAILS || "";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW.split(",").map((email) =>
  email.trim().toLowerCase(),
);

export class AuthService {
  /**
   * ADMIN ONLY: Creates a user in Supabase AND ensures they exist in Airtable.
   */
  static async createSystemUser(email: string, password: string, name: string) {
    // 1. Create in Supabase (Auth Provider)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (error) {
      throw new Error(`Supabase Create Failed: ${error.message}`);
    }

    // 2. Sync with Airtable (Data Provider)
    const existingAirtableUser = await airtableService.findUserByEmail(email);

    if (!existingAirtableUser) {
      await airtableService.createUser({ email, name });
    }

    return data.user;
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

    const userToDelete = users.find((u) => u.email === email);

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
   * Validates the Bearer token (JWT) from Supabase.
   * ✅ UPDATED: Returns creditSystem and calculates Role.
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

      // ✅ CALCULATE ROLE ON SERVER
      const role = ADMIN_EMAILS.includes(user.email.toLowerCase())
        ? "ADMIN"
        : "USER";

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        creditSystem: user.creditSystem, // 👈 PASSING THIS NOW
        role: role, // 👈 PASSING THIS NOW
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
