// backend/src/services/roi.ts
import { airtableService } from "./airtable";

export class ROIService {
  static async getMetrics(userId: string) {
    const metrics = await airtableService.getROIMetrics(userId);
    return {
      postsCreated: metrics.postsCreated,
      timeSaved: metrics.timeSaved, // in minutes
      mediaGenerated: metrics.mediaGenerated,
    };
  }

  static async incrementPostsCreated(userId: string) {
    const metrics = await airtableService.getROIMetrics(userId);
    await airtableService.updateROIMetrics(userId, {
      postsCreated: metrics.postsCreated + 1,
      timeSaved: metrics.timeSaved + 30, // 30 minutes saved per post
    });
  }

  static async incrementMediaGenerated(userId: string) {
    const metrics = await airtableService.getROIMetrics(userId);
    await airtableService.updateROIMetrics(userId, {
      mediaGenerated: metrics.mediaGenerated + 1,
    });
  }
}
