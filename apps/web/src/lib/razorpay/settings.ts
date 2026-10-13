import {
  attachClearingAccount,
  countRazorpayPending,
  countRazorpayWaitingByReason,
  findClearingAccount,
  listWaitingPayments,
  RAZORPAY_CONFIG_KEYS,
  readRazorpayConfig,
  withRazorpayStageTransaction,
  writeRazorpayConfig,
} from "@pi-dash/db/queries/razorpay-import";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";

import { type RazorpaySetup, razorpaySetup } from "./config";
import { type NotesKeys, parseNotesKeys } from "./notes-keys";
import { parseRazorpayBatchKey } from "./payment";

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
  /** Payments waiting because their batch's clearing account was deactivated. */
  inactiveAccountCount: number;
  configured: boolean;
  /** True when payments are fetched from the API; false when the webhook copy is used. */
  fetchesFromApi: boolean;
  lastWebhookAt: number | null;
  mode: "live" | "test" | null;
  notesKeys: NotesKeys;
  pendingCount: number;
  /** Payments whose sync job gave up; they wait to be imported by hand. */
  syncFailedCount: number;
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
  const waiting = await countRazorpayWaitingByReason();
  return {
    clearingAccountId: account?.id ?? null,
    clearingAccountUnusable: Boolean(storedAccount) && !account,
    configured: setup.enabled,
    inactiveAccountCount: waiting.get("clearing_account_inactive") ?? 0,
    fetchesFromApi: setup.enabled && setup.apiKey !== null,
    lastWebhookAt: Number.isNaN(lastWebhookAt) ? null : lastWebhookAt,
    mode: setup.enabled ? setup.mode : null,
    notesKeys: parseNotesKeys(config.get(RAZORPAY_CONFIG_KEYS.notesKeys)),
    pendingCount: await countRazorpayPending(),
    syncFailedCount: waiting.get("sync_failed") ?? 0,
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
 * Saves the clearing account, the notes keys, or both. Razorpay batches with
 * no usable account take the new one, under the stage lock so a payment
 * staged meanwhile never opens a batch without it, and the payments that
 * waited for an account are queued again (keyed by payment ID, so a job
 * already queued is not doubled).
 */
export async function saveRazorpaySettings(
  input: { clearingAccountId?: string; notesKeys?: NotesKeys },
  queue: (payments: { day: string; paymentId: string }[]) => void = queueSync
): Promise<{ attachedBatchCount: number; requeuedCount: number }> {
  const account = input.clearingAccountId
    ? await findClearingAccount(input.clearingAccountId)
    : null;
  if (input.clearingAccountId && !account) {
    throw new RazorpaySettingsError("Pick an active gateway clearing account");
  }
  const attachedBatchCount = await withRazorpayStageTransaction(async (tx) => {
    await writeRazorpayConfig(
      {
        ...(account ? { clearingAccountId: account.id } : {}),
        ...(input.notesKeys
          ? { notesKeys: JSON.stringify(input.notesKeys) }
          : {}),
      },
      tx
    );
    return account ? await attachClearingAccount(tx, account.id) : 0;
  });
  if (!account) {
    return { attachedBatchCount, requeuedCount: 0 };
  }
  const payments = (
    await listWaitingPayments([
      "no_clearing_account",
      "clearing_account_inactive",
    ])
  ).flatMap(({ batchKey, paymentId }) => {
    const key = parseRazorpayBatchKey(batchKey);
    return key ? [{ day: key.day, paymentId }] : [];
  });
  queue(payments);
  return { attachedBatchCount, requeuedCount: payments.length };
}

function queueSync(payments: { day: string; paymentId: string }[]): void {
  for (const payment of payments) {
    withFireAndForgetLog(
      { event: "razorpay_sync_requeued", paymentId: payment.paymentId },
      async () => {
        await enqueue("razorpay-sync-payment", payment, {
          singletonKey: payment.paymentId,
        });
      }
    );
  }
}
