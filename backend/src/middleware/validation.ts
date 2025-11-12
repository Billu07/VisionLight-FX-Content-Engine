// backend/src/middleware/validation.ts
import { z } from "zod";

export const scriptSchema = z.object({
  prompt: z.string().min(1).max(1000),
});

export const mediaSchema = z.object({
  postId: z.string().uuid(),
  provider: z.enum(["sora", "gemini", "bannerbear"]),
});

export const postSchema = z.object({
  prompt: z.string().min(1).max(1000),
  script: z.object({
    caption: z.array(z.string()),
    cta: z.string(),
  }),
  platform: z.enum(["INSTAGRAM", "LINKEDIN"]).default("INSTAGRAM"),
});
