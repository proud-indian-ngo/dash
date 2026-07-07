import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const env = createEnv({
  client: {
    VITE_APP_NAME: z.string().min(1).default("Proud Indian Dashboard"),
    VITE_CDN_URL: z.url(),
    VITE_IMMICH_URL: z.url().optional(),
    VITE_POSTHOG_HOST: z.url().optional(),
    VITE_POSTHOG_KEY: z.string().min(1).optional(),
    VITE_ZERO_URL: z.url(),
  },
  clientPrefix: "VITE_",
  emptyStringAsUndefined: true,
  // biome-ignore lint/suspicious/noExplicitAny: intentional
  runtimeEnv: (import.meta as any).env ?? process.env,
  skipValidation: process.env.SKIP_VALIDATION === "true",
});
