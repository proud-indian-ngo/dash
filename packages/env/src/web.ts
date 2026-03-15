import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_ZERO_URL: z.url(),
    VITE_CDN_URL: z.url(),
    VITE_IMMICH_URL: z.url().optional(),
  },
  // biome-ignore lint/suspicious/noExplicitAny: intentional
  runtimeEnv: (import.meta as any).env ?? process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_VALIDATION === "true",
});
