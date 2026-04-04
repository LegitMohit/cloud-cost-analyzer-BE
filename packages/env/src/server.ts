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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
