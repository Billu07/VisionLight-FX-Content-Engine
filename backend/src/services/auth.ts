import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "visionlight-demo-secret";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AuthService {
  static async createUser(email: string, name?: string) {
    // For demo, we'll create users without password
    const user = await prisma.user.create({
      data: {
        email,
        name,
        demoCredits: {
          sora: 2,
          gemini: 2,
          bannerbear: 2,
        },
        isVerified: true, // Auto-verify for demo
      },
    });

    // Create initial brand config
    await prisma.brandConfig.create({
      data: {
        userId: user.id,
        companyName: "Your Brand",
        primaryColor: "#3B82F6",
        secondaryColor: "#1E40AF",
      },
    });

    // Create initial ROI metrics
    await prisma.rOIMetrics.create({
      data: {
        userId: user.id,
        postsCreated: 0,
        timeSaved: 0,
        mediaGenerated: 0,
      },
    });

    return user;
  }

  static async findOrCreateUser(email: string, name?: string) {
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.createUser(email, name);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  static async createSession(userId: string) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    const session = await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return session;
  }

  static async validateSession(token: string) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return session.user;
  }

  static async deleteSession(token: string) {
    await prisma.session.delete({
      where: { token },
    });
  }
}
