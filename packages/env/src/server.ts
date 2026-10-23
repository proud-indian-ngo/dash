import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

import "./index";

const NAMED_ADDRESS_RE = /^[^<>]+<([^<>\s]+)>$/;

/** A bare address or `Name <address>`, as Resend accepts. */
function isSenderAddress(value: string): boolean {
  const address = NAMED_ADDRESS_RE.exec(value.trim())?.[1] ?? value.trim();
  return z.email().safeParse(address).success;
}

export const env = createEnv({
  emptyStringAsUndefined: true,
  // A copy: emptyStringAsUndefined deletes empty keys from the object it is
  // given, and a later loadEnvFiles would then refill them from .env.
  runtimeEnv: { ...process.env },
  server: {
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    /** Deployment environment on logs and Error Tracking; set explicitly, not derived from NODE_ENV. */
    APP_ENV: z.string().min(1).default("development"),
    APP_NAME: z.string().min(1).default("Proud Indian Dashboard"),
    /** Commit SHA of the running build; the Docker image sets it, local runs leave it empty. */
    APP_RELEASE: z.string().min(1).optional(),
    APP_URL: z.url().optional(),
    AVATAR_FALLBACK_SEED: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    COOKIE_DOMAIN: z.string().min(1).optional(),
    /** Base64 32-byte key for finance-private fields (PAN, bank numbers). Required in production. */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, "base64").length === 32,
        "DATA_ENCRYPTION_KEY must be base64 of 32 bytes"
      )
      .optional()
      .refine(
        (v) => process.env.NODE_ENV !== "production" || !!v,
        "DATA_ENCRYPTION_KEY is required in production"
      ),
    CORS_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    DEV_DB_HOST:
      process.env.NODE_ENV === "development" ? z.url() : z.url().optional(),
    DEV_DB_PASSWORD:
      process.env.NODE_ENV === "development"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    /**
     * Sender on a Resend-verified domain, bare or as `Name <address>`.
     * Required in production; unset skips sending.
     */
    EMAIL_FROM: z
      .string()
      .refine(
        isSenderAddress,
        'EMAIL_FROM must be an address or "Name <address>"'
      )
      .optional()
      .refine(
        (v) => process.env.NODE_ENV !== "production" || !!v,
        "EMAIL_FROM is required in production"
      ),
    GRAVATAR_API_BASE_URL: z.url().default("https://api.gravatar.com/v3"),
    GRAVATAR_API_KEY: z.string().min(1),
    GRAVATAR_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    IMMICH_API_KEY: z.string().min(1).optional(),
    IMMICH_INTERNAL_URL: z.url().optional(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().default("pi-dash"),
    PHOTO_NOTIFICATION_DELAY_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(3600)
      .default(120),
    POSTHOG_API_KEY: z.string().min(1).optional(),
    POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    /**
     * Razorpay key id (rzp_live_… or rzp_test_…). With RAZORPAY_WEBHOOK_SECRET
     * it turns on Payment Page ingestion; its prefix decides live or test mode.
     */
    RAZORPAY_KEY_ID: z
      .string()
      .regex(
        /^rzp_(live|test)_\w+$/,
        "RAZORPAY_KEY_ID must start with rzp_live_ or rzp_test_"
      )
      .optional(),
    /** Optional: lets the sync job fetch each payment from the Razorpay API instead of trusting the webhook copy. */
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    /** The secret set on the Razorpay dashboard webhook; signs every delivery. */
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
    R2_ACCESS_KEY: z.string().min(1),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    /** S3 endpoint override for the E2E fake (`packages/e2e/fake-r2.ts`); unset uses the account's R2 endpoint. */
    R2_ENDPOINT: z.url().optional(),
    R2_KEY_PREFIX: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    /** Required in production; unset skips sending. */
    RESEND_API_KEY: z
      .string()
      .min(1)
      .optional()
      .refine(
        (v) => process.env.NODE_ENV !== "production" || !!v,
        "RESEND_API_KEY is required in production"
      ),
    /** Signing secret (`whsec_…`) of the Resend webhook for bounces and complaints; unset disables `/api/email/webhook`. */
    RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
    /** Shared bearer token for the internal signing service (services/signing). */
    SIGNING_SERVICE_TOKEN: z.string().min(16).optional(),
    /** Internal URL of the signing service; unset stores signed PDFs without a signature check. */
    SIGNING_SERVICE_URL: z.url().optional(),
    /** HMAC key for the social API's signed photo links; unset disables photo endpoints. */
    SOCIAL_MEDIA_SIGNING_SECRET: z.string().min(32).optional(),
    VITE_CDN_URL: z.url(),
    VITE_IMMICH_URL: z.url().optional(),
    VOUCHER_FINANCE_ADMIN_NAME: z.string().min(1),
    VOUCHER_ORG_ADDRESS: z.string().min(1),
    VOUCHER_ORG_EMAIL: z.string().min(1),
    VOUCHER_ORG_NAME: z.string().min(1),
    VOUCHER_ORG_PHONE: z.string().min(1),
    VOUCHER_ORG_REGISTRATION: z.string().min(1),
    WEBSITE_DISPATCH_TOKEN: z.string().min(1).optional(),
    WHATSAPP_API_URL: z.url().optional(),
    WHATSAPP_AUTH_PASS: z.string().min(1).optional(),
    WHATSAPP_AUTH_USER: z.string().min(1).optional(),
    /**
     * WhatsApp Cloud API (official). With the token and phone number ID set,
     * notifications go through Meta as templates; GoWA keeps groups, polls
     * and scheduled messages.
     */
    WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().min(1).optional(),
    /** App secret that signs `/api/whatsapp/cloud/webhook` requests; unset disables the route. */
    WHATSAPP_CLOUD_APP_SECRET: z.string().min(1).optional(),
    /** WhatsApp Business Account ID; required with the token (template categories). */
    WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID: z
      .string()
      .min(1)
      .optional()
      .refine(
        (v) => !process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || !!v,
        "WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID is required with WHATSAPP_CLOUD_ACCESS_TOKEN"
      ),
    WHATSAPP_CLOUD_GRAPH_VERSION: z.string().min(1).default("v25.0"),
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().min(1).optional(),
    /** Shared token Meta echoes back when the webhook URL is registered. */
    WHATSAPP_CLOUD_VERIFY_TOKEN: z.string().min(1).optional(),
    WHATSAPP_WEBHOOK_SECRET: z.string().min(1),
    ZERO_ADMIN_PASSWORD: z.string().optional(),
    ZERO_LOG_LEVEL: z.string().default("debug"),
    ZERO_MUTATE_FORWARD_COOKIES: z.enum(["true", "false"]).default("true"),
    ZERO_MUTATE_URL: z.url().optional(),
    ZERO_QUERY_FORWARD_COOKIES: z.enum(["true", "false"]).default("true"),
    ZERO_QUERY_URL: z.url().optional(),
  },
  skipValidation: process.env.SKIP_VALIDATION === "true",
});
