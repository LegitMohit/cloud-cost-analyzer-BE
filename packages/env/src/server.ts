import dotenv from "dotenv";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import path from "path";
import fs from "fs";

// Function to find the root .env file starting from current directory
function loadEnv() {
  const currentDir = process.cwd();
  const pathsToTry = [
    path.join(currentDir, ".env"),
    path.join(currentDir, "..", ".env"),
    path.join(currentDir, "..", "..", ".env"),
  ];

  for (const envPath of pathsToTry) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
  }

  // Final fallback to default dotenv behavior
  dotenv.config();
}

loadEnv();

export const env = createEnv({
  clientPrefix: "",
  client: {},
  server: {
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).optional(),
    PORT: z.string().default("4000").transform((v) => parseInt(v, 10)),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    JWT_SECRET: z.string().min(8),
    JWT_EXPIRES_IN: z.string().default("7d"),
    CORS_ORIGIN: z.string().url(),
    NEXT_PUBLIC_API_URL: z.string().url(),
    NEXT_PUBLIC_SERVER_URL: z.string().url(),
    ENCRYPTION_KEY: z.string().min(32),
    GROQ_API_KEY: z.string().min(1),
    GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
    LOGIN_EMAIL: z.string().email().optional(),
    LOGIN_PASSWORD: z.string().optional(),
    LOGIN_API_URL: z.string().url().optional(),
    LOGIN_CRON_INTERVAL_MS: z.number().default(10_000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
