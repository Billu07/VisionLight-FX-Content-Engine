import { prisma } from "../db";

export class ROIService {
  static async incrementPostsCreated(userId: string) {
    await this.ensureMetrics(userId);
    await prisma.rOIMetrics.update({
      where: { userId },
      data: { postsCreated: { increment: 1 } },
    });
  }

  static async incrementMediaGenerated(userId: string) {
    await this.ensureMetrics(userId);
    await prisma.rOIMetrics.update({
      where: { userId },
      data: {
        mediaGenerated: { increment: 1 },
        timeSaved: { increment: 60 }, // 1 hour saved per media
      },
    });
  }

  private static async ensureMetrics(userId: string) {
    const existing = await prisma.rOIMetrics.findUnique({
      where: { userId },
    });

    if (!existing) {
      await prisma.rOIMetrics.create({
        data: { userId },
      });
    }
  }

  static async getMetrics(userId: string) {
    const metrics = await prisma.rOIMetrics.findUnique({
      where: { userId },
    });

    // Return default metrics if none exist
    return (
      metrics || {
        id: "default",
        userId,
        postsCreated: 0,
        timeSaved: 0,
        mediaGenerated: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  }
}
