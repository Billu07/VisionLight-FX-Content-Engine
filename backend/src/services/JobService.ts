import { airtableService } from "./airtable";

export interface JobStatus {
  postId: string;
  status: "queued" | "processing" | "completed" | "failed" | "timeout";
  progress: number;
  error?: string;
  startedAt: Date;
  updatedAt: Date;
  estimatedCompletion: Date;
  mediaType: string;
  phase: string;
  lastPhaseUpdate: Date;
}

export class JobService {
  private static instance: JobService;
  private jobTimeouts = new Map<string, NodeJS.Timeout>();
  private progressIntervals = new Map<string, NodeJS.Timeout>();

  static getInstance(): JobService {
    if (!JobService.instance) {
      JobService.instance = new JobService();
    }
    return JobService.instance;
  }

  async createJob(postId: string, mediaType: string): Promise<JobStatus> {
    const job: JobStatus = {
      postId,
      status: "queued",
      progress: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
      estimatedCompletion: this.calculateEstimatedCompletion(mediaType),
      mediaType,
      phase: this.getInitialPhase(mediaType),
      lastPhaseUpdate: new Date(),
    };

    // Store job in Airtable
    await this.saveJobToAirtable(job);

    // Start progress simulation
    this.startProgressSimulation(postId, mediaType);

    // Set safety timeout
    this.setJobTimeout(postId, mediaType);

    return job;
  }

  private async saveJobToAirtable(job: JobStatus): Promise<void> {
    await airtableService.updatePost(job.postId, {
      jobStatus: job.status,
      jobProgress: job.progress,
      jobMessage: job.phase,
    });
  }

  private async getJobFromAirtable(postId: string): Promise<JobStatus | null> {
    try {
      const post = await airtableService.getPostById(postId);
      if (!post || !post.jobStatus) return null;

      return {
        postId,
        status: post.jobStatus as JobStatus["status"],
        progress: post.jobProgress || 0,
        startedAt: new Date(post.createdAt),
        updatedAt: new Date(post.updatedAt),
        estimatedCompletion: this.calculateEstimatedCompletion(
          post.mediaType?.toLowerCase() || "video"
        ),
        mediaType: post.mediaType?.toLowerCase() || "video",
        phase: post.jobMessage || "Starting...",
        lastPhaseUpdate: new Date(post.updatedAt),
      };
    } catch (error) {
      console.error("Error getting job from Airtable:", error);
      return null;
    }
  }

  private startProgressSimulation(postId: string, mediaType: string): void {
    this.clearProgressInterval(postId);

    const interval = setInterval(async () => {
      try {
        const job = await this.getJobFromAirtable(postId);
        if (!job || job.status === "completed" || job.status === "failed") {
          this.clearProgressInterval(postId);
          return;
        }

        const newProgress = this.calculateSmartProgress(job);
        const newPhase = this.getPhaseForProgress(newProgress, job.mediaType);

        if (newProgress !== job.progress || newPhase !== job.phase) {
          await this.updateJobStatus(
            postId,
            job.status, // Keep same status
            newProgress,
            job.error
          );
        }
      } catch (error) {
        console.error("Progress simulation error:", error);
        this.clearProgressInterval(postId);
      }
    }, 5000);

    this.progressIntervals.set(postId, interval);
  }

  private calculateSmartProgress(job: JobStatus): number {
    const startTime = job.startedAt.getTime();
    const currentTime = Date.now();
    const elapsed = currentTime - startTime;

    const estimatedTotalTime = job.estimatedCompletion.getTime() - startTime;
    const baseProgress = Math.min(95, (elapsed / estimatedTotalTime) * 100);

    // Add some randomness to make it feel natural
    const randomVariation = Math.random() * 5 - 2.5;
    return Math.max(0, Math.min(95, baseProgress + randomVariation));
  }

  private getPhaseForProgress(progress: number, mediaType: string): string {
    const phases = {
      video: [
        { threshold: 0, phase: "📋 Analyzing your prompt..." },
        { threshold: 10, phase: "🎬 Setting up scene composition..." },
        { threshold: 25, phase: "🎨 Generating visual elements..." },
        { threshold: 45, phase: "✨ Adding lighting and effects..." },
        { threshold: 65, phase: "🎞️ Rendering video frames..." },
        { threshold: 80, phase: "🎭 Finalizing cinematic details..." },
        { threshold: 90, phase: "⚡ Almost ready..." },
      ],
      image: [
        { threshold: 0, phase: "📋 Understanding your vision..." },
        { threshold: 15, phase: "🎨 Sketching composition..." },
        { threshold: 40, phase: "🖌️ Adding colors and textures..." },
        { threshold: 65, phase: "✨ Enhancing details..." },
        { threshold: 85, phase: "🎯 Final touches..." },
      ],
      carousel: [
        { threshold: 0, phase: "📋 Planning your story..." },
        { threshold: 20, phase: "🎨 Designing slides..." },
        { threshold: 50, phase: "✨ Adding visual consistency..." },
        { threshold: 80, phase: "📖 Final review..." },
      ],
    };

    const mediaPhases =
      phases[mediaType as keyof typeof phases] || phases.image;

    for (let i = mediaPhases.length - 1; i >= 0; i--) {
      if (progress >= mediaPhases[i].threshold) {
        return mediaPhases[i].phase;
      }
    }

    return mediaPhases[0].phase;
  }

  private getInitialPhase(mediaType: string): string {
    const initialPhases = {
      video: "📋 Analyzing your prompt...",
      image: "📋 Understanding your vision...",
      carousel: "📋 Planning your story...",
    };

    return (
      initialPhases[mediaType as keyof typeof initialPhases] ||
      "Starting generation..."
    );
  }

  async updateJobStatus(
    postId: string,
    status: JobStatus["status"],
    progress?: number,
    error?: string
  ): Promise<void> {
    try {
      const currentJob = await this.getJobFromAirtable(postId);
      if (!currentJob) {
        console.warn(`Job ${postId} not found in Airtable`);
        return;
      }

      const phase =
        status === "completed"
          ? "✅ Generation complete!"
          : status === "failed"
          ? "❌ Generation failed"
          : currentJob.phase;

      // Update job in Airtable
      await airtableService.updatePost(postId, {
        jobStatus: status,
        jobProgress: progress !== undefined ? progress : currentJob.progress,
        jobMessage: phase,
      });

      // Map to Airtable status
      let airtableStatus: string;
      switch (status) {
        case "completed":
          airtableStatus = "READY";
          break;
        case "failed":
          airtableStatus = "FAILED";
          break;
        case "processing":
          airtableStatus = "PROCESSING";
          break;
        case "queued":
          airtableStatus = "NEW";
          break;
        default:
          airtableStatus = "PROCESSING";
      }

      await airtableService.updatePost(postId, {
        status: airtableStatus as any,
      });

      if (status === "completed" || status === "failed") {
        this.clearJobTimeout(postId);
        this.clearProgressInterval(postId);
      }
    } catch (error) {
      console.error("Error updating job status:", error);
    }
  }

  async getJobStatus(postId: string): Promise<JobStatus | null> {
    try {
      return await this.getJobFromAirtable(postId);
    } catch (error) {
      console.error("Error getting job status:", error);
      return null;
    }
  }

  private setJobTimeout(postId: string, mediaType: string): void {
    const timeoutMinutes = mediaType === "video" ? 45 : 10;

    const timeoutId = setTimeout(async () => {
      console.log(`⏰ Job timeout for post ${postId}`);
      await this.updateJobStatus(
        postId,
        "timeout",
        undefined,
        "Generation timeout - process took too long"
      );
    }, timeoutMinutes * 60 * 1000);

    this.jobTimeouts.set(postId, timeoutId);
  }

  private clearJobTimeout(postId: string): void {
    const timeoutId = this.jobTimeouts.get(postId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.jobTimeouts.delete(postId);
    }
  }

  private clearProgressInterval(postId: string): void {
    const interval = this.progressIntervals.get(postId);
    if (interval) {
      clearInterval(interval);
      this.progressIntervals.delete(postId);
    }
  }

  private calculateEstimatedCompletion(mediaType: string): Date {
    const baseTimes = {
      video: 10 * 60 * 1000, // 10 minutes for video
      image: 1.5 * 60 * 1000, // 1.5 minutes for image
      carousel: 2 * 60 * 1000, // 2 minutes for carousel
    };

    const baseTime =
      baseTimes[mediaType as keyof typeof baseTimes] || baseTimes.image;
    const randomVariation = (Math.random() - 0.5) * 60000;
    return new Date(Date.now() + baseTime + randomVariation);
  }
}

export const jobService = JobService.getInstance();
