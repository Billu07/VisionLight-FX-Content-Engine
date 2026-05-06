import { createClient } from "@supabase/supabase-js";
import { dbService as airtableService } from "./database";
import { supportHandoffService } from "./supportHandoff";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials in .env");
}

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAILS || "";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW.split(",").map((email) =>
  email.trim().toLowerCase(),
).filter(Boolean);

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || null;
};

const PICDRIFT_CANONICAL_DOMAIN =
  sanitizeDomain(process.env.PICDRIFT_CANONICAL_DOMAIN || process.env.PICDRIFT_DOMAIN) ||
  "picdrift.studio";
const VISIONLIGHT_CANONICAL_DOMAIN =
  sanitizeDomain(
    process.env.VISIONLIGHT_CANONICAL_DOMAIN ||
      process.env.VISUALFX_CANONICAL_DOMAIN ||
      process.env.VISUALFX_DOMAIN,
  ) || "visualfx.studio";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class AuthService {
  private static isExistingSupabaseEmailError(error: any) {
    const message = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();

    return (
      code.includes("user_already") ||
      code.includes("email_exists") ||
      (message.includes("email") &&
        message.includes("already") &&
        (message.includes("registered") || message.includes("exists")))
    );
  }

  private static async findSupabaseUserByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    const perPage = 1000;

    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw error;

      const users = data?.users || [];
      const match = users.find(
        (user) => user.email?.toLowerCase() === normalizedEmail,
      );
      if (match) return match;
      if (users.length < perPage) return null;
    }

    return null;
  }

  private static withAuthReuseFlag(user: any, authIdentityReused: boolean) {
    if (!authIdentityReused) return user;
    return { ...user, authIdentityReused: true };
  }

  static async getProvisioningEmailStatus(
    email: string,
    organizationId?: string | null,
  ) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error("Email is required.");
    }
    const [authUser, profiles] = await Promise.all([
      this.findSupabaseUserByEmail(normalizedEmail),
      airtableService.findUsersByEmail(normalizedEmail),
    ]);
    const normalizedOrgId = organizationId || null;
    const existingProfileInOrganization = normalizedOrgId
      ? profiles.some(
          (profile: any) => (profile.organizationId || null) === normalizedOrgId,
        )
      : false;

    return {
      email: normalizedEmail,
      authExists: !!authUser,
      authUserId: authUser?.id || null,
      profileCount: profiles.length,
      existingProfileInOrganization,
      hasSuperAdminProfile: profiles.some(
        (profile: any) => profile.role === "SUPERADMIN",
      ),
      requiresPassword: !authUser,
    };
  }

  static isSuperAdminEmail(email?: string | null) {
    return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
  }

  private static getFinalRole(user: any) {
    const isSuperAdminEnv = this.isSuperAdminEmail(user.email);
    const dbRole = user.role;

    if (isSuperAdminEnv || dbRole === "SUPERADMIN") return "SUPERADMIN";
    if (dbRole === "ADMIN") return "ADMIN";
    if (dbRole === "MANAGER") return "MANAGER";
    return "USER";
  }

  private static toSessionUser(user: any) {
    return {
      id: user.id,
      authUserId: user.authUserId || null,
      email: user.email,
      name: user.name,
      creditSystem: user.creditSystem,
      isDemo: user.isDemo === true,
      role: this.getFinalRole(user),
      organizationId: user.organizationId,
      organizationIsDefault: user.organization?.isDefault === true,
      view: user.view || "VISIONLIGHT",
      maxProjects: user.maxProjects || 3,
    };
  }

  private static toProfileOption(user: any) {
    const view = user.view === "PICDRIFT" ? "PICDRIFT" : "VISIONLIGHT";
    const organizationName = user.organization?.name || "Personal Workspace";
    return {
      id: user.id,
      authUserId: user.authUserId || null,
      email: user.email,
      name: user.name,
      role: this.getFinalRole(user),
      view,
      organizationId: user.organizationId,
      organizationName,
      organizationIsDefault: user.organization?.isDefault === true,
      isOrgActive: user.organization?.isActive !== false,
      canonicalDomain:
        view === "PICDRIFT" ? PICDRIFT_CANONICAL_DOMAIN : VISIONLIGHT_CANONICAL_DOMAIN,
    };
  }

  /**
   * ADMIN ONLY: Creates or updates one internal workspace profile for a Supabase identity.
   * The same Supabase email may now have multiple User rows, one per organization/profile.
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
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error("Email is required.");
    }
    const trimmedPassword = typeof password === "string" ? password.trim() : "";

    let supabaseUser: any;
    let authIdentityReused = false;

    if (!trimmedPassword) {
      const existingAuth = await this.findSupabaseUserByEmail(normalizedEmail);
      if (existingAuth) {
        supabaseUser = existingAuth;
        authIdentityReused = true;
      } else {
        throw new Error("Password is required for a new login identity.");
      }
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: trimmedPassword,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (error) {
        if (this.isExistingSupabaseEmailError(error)) {
          const existingAuth = await this.findSupabaseUserByEmail(normalizedEmail);

          if (!existingAuth) {
            throw new Error("Conflict: Supabase says user exists but cannot find them.");
          }

          // One Supabase Auth identity can back multiple internal workspace profiles.
          // Do not reset the shared password during profile creation; users
          // reset their own account password through Supabase recovery links.
          supabaseUser = existingAuth;
          authIdentityReused = true;
        } else {
          throw new Error(`Supabase Create Failed: ${error.message}`);
        }
      } else {
        supabaseUser = data.user;
      }
    }

    if (!supabaseUser?.id) {
      throw new Error("Supabase Create Failed: missing auth user ID.");
    }

    await airtableService.attachAuthIdentityToEmail(normalizedEmail, supabaseUser.id);
    const profiles = await airtableService.findUsersForAuthIdentity(
      supabaseUser.id,
      normalizedEmail,
    );
    const normalizedOrgId = organizationId || null;
    const existingProfile = profiles.find(
      (profile: any) => (profile.organizationId || null) === normalizedOrgId,
    );

    if (existingProfile) {
      const updatedUser = await airtableService.adminUpdateUser(existingProfile.id, {
        authUserId: supabaseUser.id,
        role,
        view,
        name,
        maxProjects,
        organizationId,
        isDemo: isDemo === true,
      });
      return this.withAuthReuseFlag(updatedUser, authIdentityReused);
    }

    const createdUser = await airtableService.createUser({
      id: profiles.length === 0 ? supabaseUser.id : undefined,
      authUserId: supabaseUser.id,
      email: normalizedEmail,
      name,
      view,
      maxProjects,
      organizationId,
      role,
      isDemo,
    });
    return this.withAuthReuseFlag(createdUser, authIdentityReused);
  }

  /**
   * Deletes the Supabase identity only when no other internal profiles remain.
   */
  static async deleteSupabaseUserByEmail(
    email: string,
    scope?: { deletingUserId?: string; deletingOrganizationId?: string },
  ) {
    const normalizedEmail = normalizeEmail(email);
    const profiles = await airtableService.findUsersByEmail(normalizedEmail);
    const remainingProfiles = profiles.filter((profile: any) => {
      if (scope?.deletingUserId && profile.id === scope.deletingUserId) return false;
      if (
        scope?.deletingOrganizationId &&
        profile.organizationId === scope.deletingOrganizationId
      ) {
        return false;
      }
      return true;
    });

    if (remainingProfiles.length > 0) {
      return false;
    }

    const userToDelete = await this.findSupabaseUserByEmail(normalizedEmail);
    if (userToDelete) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(
        userToDelete.id,
      );
      if (deleteError) throw deleteError;
      return true;
    }

    return false;
  }

  static async validateSession(token: string, activeProfileId?: string) {
    try {
      const {
        data: { user: supabaseUser },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !supabaseUser || !supabaseUser.email) {
        return null;
      }

      const email = normalizeEmail(supabaseUser.email);
      await airtableService.attachAuthIdentityToEmail(email, supabaseUser.id);
      let profiles = await airtableService.findUsersForAuthIdentity(supabaseUser.id, email);

      if (profiles.length === 0) {
        const created = await airtableService.createUser({
          id: supabaseUser.id,
          authUserId: supabaseUser.id,
          email,
          name:
            supabaseUser.user_metadata?.full_name ||
            email.split("@")[0],
        });
        profiles = [created];
      }

      if (activeProfileId) {
        const selected = profiles.find((profile: any) => profile.id === activeProfileId);
        if (selected) {
          if (!selected.authUserId) {
            const updated = await airtableService.attachAuthIdentityToUser(
              selected.id,
              supabaseUser.id,
            );
            return this.toSessionUser(updated);
          }
          return this.toSessionUser(selected);
        }
      }

      if (profiles.length === 1) {
        const selected = profiles[0];
        if (!selected.authUserId) {
          const updated = await airtableService.attachAuthIdentityToUser(
            selected.id,
            supabaseUser.id,
          );
          return this.toSessionUser(updated);
        }
        return this.toSessionUser(selected);
      }

      return {
        profileSelectionRequired: true,
        authUserId: supabaseUser.id,
        email,
        name: supabaseUser.user_metadata?.full_name || email.split("@")[0],
        profiles: profiles.map((profile: any) => this.toProfileOption(profile)),
      };
    } catch (error) {
      console.error("Auth Validation Error:", error);
      return null;
    }
  }

  static async getReadOnlyImpersonationTarget(impersonator: any, targetUserId: string) {
    const target = await airtableService.findUserById(targetUserId);
    if (!target) {
      throw new Error("Impersonation target not found.");
    }

    const isSuperAdmin = impersonator?.role === "SUPERADMIN";
    const isOrgAdmin = impersonator?.role === "ADMIN";

    if (!isSuperAdmin) {
      if (!isOrgAdmin || !impersonator?.organizationId) {
        throw new Error("Impersonation is restricted to admins.");
      }
      if (target.role === "SUPERADMIN") {
        throw new Error("Organization admins cannot enter SuperAdmin dashboards.");
      }
      if (target.organizationId !== impersonator.organizationId) {
        throw new Error("Target user is outside your organization.");
      }
    }

    return {
      ...this.toSessionUser(target),
      readOnlyImpersonation: true,
      impersonator: {
        id: impersonator.id,
        email: impersonator.email,
        role: impersonator.role,
      },
    };
  }

  static async validateSupportSessionToken(token: string, incomingHost?: string) {
    const payload = supportHandoffService.parseSupportSessionToken(token, incomingHost);
    if (!payload) return null;

    const [issuer, target] = await Promise.all([
      airtableService.findUserById(payload.iss),
      airtableService.findUserById(payload.sub),
    ]);
    if (!issuer || !target) return null;

    const issuerRole = this.getFinalRole(issuer);
    if (issuerRole !== "SUPERADMIN") return null;

    return this.getReadOnlyImpersonationTarget(issuer, target.id);
  }

  static async deleteSession(token: string) {
    return;
  }
}
