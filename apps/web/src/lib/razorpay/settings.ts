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
import { countRefundsNeedingAttention } from "@pi-dash/db/queries/razorpay-refunds";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import type { RazorpayReconcilePayload } from "@pi-dash/jobs/types";
import { withFireAndForgetLog } from "@pi-dash/observability";

import { type RazorpaySetup, razorpaySetup } from "./config";
import { type NotesKeys, parseNotesKeys } from "./notes-keys";
import { parseRazorpayBatchKey } from "./payment";
import {
  activeRun,
  backfillRangeError,
  daysBetween,
  emptyCounts,
  parseReconcileState,
  type ReconcileState,
  recentRange,
  saveReconcileRun,
} from "./reconcile";

/**
 * Server-only. What the Settings → Integrations page shows and saves. Only
 * whether keys are present and the mode they imply leave this module, never
 * the keys themselves.
 */

/** The events to subscribe to on the Razorpay dashboard. */
export const RAZORPAY_WEBHOOK_EVENTS = [
  "payment.captured",
  "order.paid",
  "refund.processed",
] as const;

/**
 * Why "Sync now" and "Import past payments" are off, in one line, or null
 * when they can run: they list payments from the API, so they need the key
 * secret, and a test key never syncs on a production server.
 */
export function reconcileUnavailableReason(
  setup: RazorpaySetup
): string | null {
  if (!setup.enabled) {
    return "Razorpay is not configured on this server.";
  }
  if (setup.testInProduction) {
    return "A test key can't sync on a production server.";
  }
  if (!setup.apiKey) {
    return "Set RAZORPAY_KEY_SECRET on the server to sync with Razorpay; webhooks keep recording payments without it.";
  }
  return null;
}

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
  /** Sync now and Import past payments, and the run in progress or last finished. */
  reconcile: {
    /** The run queued or running now, if it is alive. */
    active: ReconcileState | null;
    last: ReconcileState | null;
    /** One line for why the actions are off; null when they can run. */
    unavailableReason: string | null;
  };
  /** Refunds the founder should look at. */
  refundAttention: { afterReceipt: number; amountChanged: number };
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
  const attention = await countRefundsNeedingAttention();
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
    reconcile: {
      active: activeRun(
        parseReconcileState(config.get(RAZORPAY_CONFIG_KEYS.reconcileRun))
      ),
      last: parseReconcileState(config.get(RAZORPAY_CONFIG_KEYS.lastReconcile)),
      unavailableReason: reconcileUnavailableReason(setup),
    },
    refundAttention: {
      afterReceipt: attention.get("refund_after_receipt") ?? 0,
      amountChanged: attention.get("amount_changed") ?? 0,
    },
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

export type ReconcileRequest =
  | { reason: "manual" }
  | { from: string; reason: "backfill"; to: string };

const enqueueReconcile = async (
  payload: RazorpayReconcilePayload
): Promise<string | null> => await enqueue("razorpay-reconcile", payload);

/**
 * Queues a reconcile run from Settings: "Sync now" over the last three
 * days, or "Import past payments" over a chosen range of at most 400 days.
 * Refused when the actions are off or a run is already queued or running
 * (the queue holds one at a time, so a refused send says so too). The run
 * is shown as queued until the job picks it up.
 */
export async function requestRazorpayReconcile(
  request: ReconcileRequest,
  setup: RazorpaySetup = razorpaySetup(),
  queue: (
    payload: RazorpayReconcilePayload
  ) => Promise<string | null> = enqueueReconcile,
  now: Date = new Date()
): Promise<{ days: number; from: string; to: string }> {
  const unavailable = reconcileUnavailableReason(setup);
  if (unavailable) {
    throw new RazorpaySettingsError(unavailable);
  }
  let range = recentRange(now);
  if (request.reason === "backfill") {
    const problem = backfillRangeError(request.from, request.to, now);
    if (problem) {
      throw new RazorpaySettingsError(problem);
    }
    range = { from: request.from, to: request.to };
  }
  const config = await readRazorpayConfig();
  const busy = new RazorpaySettingsError(
    "A Razorpay sync is already running. Try again when it has finished."
  );
  if (
    activeRun(
      parseReconcileState(config.get(RAZORPAY_CONFIG_KEYS.reconcileRun)),
      now
    )
  ) {
    throw busy;
  }
  // Shown as queued before the send, so the job's own progress, written as
  // soon as it starts, is never overwritten; put back if the send fails.
  const previous = config.get(RAZORPAY_CONFIG_KEYS.reconcileRun) ?? "";
  const days = daysBetween(range.from, range.to).length;
  await saveReconcileRun({
    counts: emptyCounts(),
    from: range.from,
    reason: request.reason,
    status: "queued",
    to: range.to,
    updatedAt: now.toISOString(),
    windowsDone: 0,
    windowsTotal: days,
  });
  let jobId: string | null;
  try {
    jobId = await queue({ ...range, reason: request.reason });
  } catch (error) {
    await writeRazorpayConfig({ reconcileRun: previous });
    throw error;
  }
  if (!jobId) {
    await writeRazorpayConfig({ reconcileRun: previous });
    throw busy;
  }
  return { days, ...range };
}
