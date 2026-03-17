import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import "./index";

export const env = createEnv({
  server: {
    DEV_DB_HOST:
      process.env.NODE_ENV === "development" ? z.url() : z.url().optional(),
    DEV_DB_PASSWORD:
      process.env.NODE_ENV === "development"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    CORS_ORIGIN: z.url(),
    COOKIE_DOMAIN: z.string().min(1).optional(),
    GRAVATAR_API_KEY: z.string().min(1),
    AVATAR_FALLBACK_SEED: z.string().min(1),
    GRAVATAR_API_BASE_URL: z.url().default("https://api.gravatar.com/v3"),
    GRAVATAR_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    ZERO_ADMIN_PASSWORD: z.string().optional(),
    ZERO_MUTATE_URL: z.url().optional(),
    ZERO_QUERY_URL: z.url().optional(),
    ZERO_MUTATE_FORWARD_COOKIES: z.enum(["true", "false"]).default("true"),
    ZERO_QUERY_FORWARD_COOKIES: z.enum(["true", "false"]).default("true"),
    ZERO_LOG_LEVEL: z.string().default("debug"),
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    SMTP_FROM: z.email(),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    R2_KEY_PREFIX: z.string().min(1),
    COURIER_API_KEY: z.string().min(1).optional(),
    WHATSAPP_API_URL: z.url().optional(),
    WHATSAPP_AUTH_USER: z.string().min(1).optional(),
    WHATSAPP_AUTH_PASS: z.string().min(1).optional(),
    VITE_IMMICH_URL: z.url().optional(),
    IMMICH_API_KEY: z.string().min(1).optional(),
    APP_NAME: z.string().min(1).default("Proud Indian Dashboard"),
    APP_URL: z.url().optional(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_VALIDATION === "true",
});
