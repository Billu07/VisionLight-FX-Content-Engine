// backend/src/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string(),
  OPENAI_API_KEY: z.string(),
  SORA_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  BANNERBEAR_API_KEY: z.string().optional(),
  BUFFER_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
