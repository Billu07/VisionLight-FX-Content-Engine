// backend/src/services/auth.ts
import { airtableService } from "./airtable";

export class AuthService {
  static async findOrCreateUser(email: string, name?: string) {
    // Check if user exists
    let user = await airtableService.findUserByEmail(email);

    if (!user) {
      // Create new user
      user = await airtableService.createUser({ email, name });
    }

    return user;
  }

  static async createSession(userId: string) {
    const token = this.generateToken();
    return await airtableService.createSession(userId, token);
  }

  static async validateSession(token: string) {
    const session = await airtableService.findSessionByToken(token);

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (new Date() > session.expiresAt) {
      await this.deleteSession(token);
      return null;
    }

    // Get actual user data from Airtable using the new findUserById method
    try {
      const user = await airtableService.findUserById(session.userId);

      if (!user) {
        await this.deleteSession(token);
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
      };
    } catch (error) {
      console.error("Error fetching user in validateSession:", error);
      return null;
    }
  }

  static async deleteSession(token: string) {
    await airtableService.deleteSession(token);
  }

  private static generateToken(): string {
    return (
      "vl_" + Math.random().toString(36).substr(2) + Date.now().toString(36)
    );
  }
}
