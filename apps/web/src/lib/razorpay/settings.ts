import { db } from "@pi-dash/db";
import {
  attachClearingAccount,
  countRazorpayPending,
  findClearingAccount,
  RAZORPAY_CONFIG_KEYS,
  readRazorpayConfig,
  writeRazorpayConfig,
} from "@pi-dash/db/queries/razorpay-import";
import { env } from "@pi-dash/env/server";

import { type RazorpaySetup, razorpaySetup } from "./config";
import { type NotesKeys, parseNotesKeys } from "./notes-keys";

/**
 * Server-only. What the Settings → Integrations page shows and saves. Only
 * whether keys are present and the mode they imply leave this module, never
 * the keys themselves.
 */

/** The events to subscribe to on the Razorpay dashboard. */
export const RAZORPAY_WEBHOOK_EVENTS = [
  "payment.captured",
  "order.paid",
] as const;

export interface RazorpaySettingsView {
  /** The configured account when it is still an active gateway clearing account. */
  clearingAccountId: string | null;
  /** True when an account was chosen but has since been deactivated or changed kind. */
  clearingAccountUnusable: boolean;
  configured: boolean;
  /** True when payments are fetched from the API; false when the webhook copy is used. */
  fetchesFromApi: boolean;
  lastWebhookAt: number | null;
  mode: "live" | "test" | null;
  notesKeys: NotesKeys;
  pendingCount: number;
  testInProduction: boolean;
  webhookEvents: readonly string[];
  webhookUrl: string;
}

export async function getRazorpaySettingsView(
  setup: RazorpaySetup = razorpaySetup()
): Promise<RazorpaySettingsView> {
  const config = await readRazorpayConfig();
  const storedAccount = config.get(RAZORPAY_CONFIG_KEYS.clearingAccountId);
  const account = storedAccount
    ? await findClearingAccount(storedAccount)
    : null;
  const lastWebhookAt = Date.parse(
    config.get(RAZORPAY_CONFIG_KEYS.lastWebhookAt) ?? ""
  );
  const base = (env.APP_URL ?? env.BETTER_AUTH_URL).replace(/\/+$/, "");
  return {
    clearingAccountId: account?.id ?? null,
    clearingAccountUnusable: Boolean(storedAccount) && !account,
    configured: setup.enabled,
    fetchesFromApi: setup.enabled && setup.apiKey !== null,
    lastWebhookAt: Number.isNaN(lastWebhookAt) ? null : lastWebhookAt,
    mode: setup.enabled ? setup.mode : null,
    notesKeys: parseNotesKeys(config.get(RAZORPAY_CONFIG_KEYS.notesKeys)),
    pendingCount: await countRazorpayPending(),
    testInProduction: setup.enabled && setup.testInProduction,
    webhookEvents: RAZORPAY_WEBHOOK_EVENTS,
    webhookUrl: `${base}/api/razorpay/webhook`,
  };
}

export class RazorpaySettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpaySettingsError";
  }
}

/**
 * Saves the clearing account and notes keys. Razorpay batches opened before
 * any account was chosen take the new one, so their waiting payments can be
 * imported from the batch page.
 */
export async function saveRazorpaySettings(input: {
  clearingAccountId: string;
  notesKeys: NotesKeys;
}): Promise<{ attachedBatchCount: number }> {
  const account = await findClearingAccount(input.clearingAccountId);
  if (!account) {
    throw new RazorpaySettingsError("Pick an active gateway clearing account");
  }
  return await db.transaction(async (tx) => {
    await writeRazorpayConfig(
      {
        clearingAccountId: account.id,
        notesKeys: JSON.stringify(input.notesKeys),
      },
      tx
    );
    return { attachedBatchCount: await attachClearingAccount(tx, account.id) };
  });
}
