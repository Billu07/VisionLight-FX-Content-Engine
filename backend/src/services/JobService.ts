// backend/src/services/jobService.ts
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
  private activeJobs = new Map<string, JobStatus>();
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

    this.activeJobs.set(postId, job);

    // Start progress simulation
    this.startProgressSimulation(postId, mediaType);

    // Set safety timeout
    this.setJobTimeout(postId, mediaType);

    return job;
  }

  private startProgressSimulation(postId: string, mediaType: string): void {
    this.clearProgressInterval(postId);

    const interval = setInterval(async () => {
      const job = this.activeJobs.get(postId);
      if (!job || job.status === "completed" || job.status === "failed") {
        this.clearProgressInterval(postId);
        return;
      }

      const newProgress = this.calculateSmartProgress(job);
      const newPhase = this.getPhaseForProgress(newProgress, job.mediaType);

      if (newProgress !== job.progress || newPhase !== job.phase) {
        job.progress = newProgress;
        job.phase = newPhase;
        job.lastPhaseUpdate = new Date();
        job.updatedAt = new Date();

        console.log(
          `🔄 Job ${postId} progress: ${newProgress}% - Phase: ${newPhase}`
        );
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
    const job = this.activeJobs.get(postId);
    if (job) {
      job.status = status;
      if (progress !== undefined) job.progress = progress;
      job.error = error;
      job.updatedAt = new Date();

      if (status === "completed") {
        job.progress = 100;
        job.phase = "✅ Generation complete!";
        this.clearProgressInterval(postId);
      } else if (status === "failed") {
        job.phase = "❌ Generation failed";
        this.clearProgressInterval(postId);
      }

      // 🛠️ FIX: Map job status to correct Airtable status values
      let airtableStatus: string;
      switch (status) {
        case "completed":
          airtableStatus = "READY"; // Use "READY" for completed posts
          break;
        case "failed":
          airtableStatus = "FAILED";
          break;
        case "processing":
          airtableStatus = "PROCESSING";
          break;
        case "queued":
          airtableStatus = "NEW"; // Or "PROCESSING" depending on your workflow
          break;
        default:
          airtableStatus = "PROCESSING";
      }

      await airtableService.updatePost(postId, {
        status: airtableStatus as any,
      });

      if (status === "completed" || status === "failed") {
        this.clearJobTimeout(postId);
      }
    }
  }

  getJobStatus(postId: string): JobStatus | undefined {
    return this.activeJobs.get(postId);
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
      this.activeJobs.delete(postId);
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
      video: 10 * 60 * 1000, // 3 minutes for video
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
