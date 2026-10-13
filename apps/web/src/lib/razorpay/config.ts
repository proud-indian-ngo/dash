import { env } from "@pi-dash/env/server";

import { type RazorpayMode, razorpayMode } from "./payment";

/**
 * Server-only. Whether Razorpay ingestion is on, and in which mode. On only
 * when both the key id and the webhook secret are set: the key id's prefix
 * is the only source of the mode. The secrets stay in this module and the
 * calls that need them; they are never logged, stored or returned.
 */

export interface RazorpayEnvValues {
  NODE_ENV?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}

export type RazorpaySetup =
  | { enabled: false }
  | {
      enabled: true;
      /** Set when the job may fetch payments from the API. */
      apiKey: { id: string; secret: string } | null;
      mode: RazorpayMode;
      /** A test key on a production server would put test payments in the real books. */
      testInProduction: boolean;
      webhookSecret: string;
    };

export function razorpaySetup(values: RazorpayEnvValues = env): RazorpaySetup {
  const keyId = values.RAZORPAY_KEY_ID;
  const webhookSecret = values.RAZORPAY_WEBHOOK_SECRET;
  if (!(keyId && webhookSecret)) {
    return { enabled: false };
  }
  const mode = razorpayMode(keyId);
  return {
    apiKey: values.RAZORPAY_KEY_SECRET
      ? { id: keyId, secret: values.RAZORPAY_KEY_SECRET }
      : null,
    enabled: true,
    mode,
    testInProduction: mode === "test" && values.NODE_ENV === "production",
    webhookSecret,
  };
}
