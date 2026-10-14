import {
  attachClearingAccount,
  countRazorpayPending,
  countRazorpayWaitingByReason,
  findClearingAccount,
  hasOpenReconcileJob,
  listWaitingPayments,
  RAZORPAY_CONFIG_KEYS,
  readRazorpayConfig,
  replaceRazorpayConfigIf,
  withRazorpayStageTransaction,
  writeRazorpayConfig,
} from "@pi-dash/db/queries/razorpay-import";
import {
  countPendingRefunds,
  countRefundsNeedingAttention,
} from "@pi-dash/db/queries/razorpay-refunds";
import { razorpaySettlementStatus } from "@pi-dash/db/queries/razorpay-settlements";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import type { RazorpayReconcilePayload } from "@pi-dash/jobs/types";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { uuidv7 } from "uuidv7";

import { type RazorpaySetup, razorpaySetup } from "./config";
import { type NotesKeys, parseNotesKeys } from "./notes-keys";
import { parseRazorpayBatchKey } from "./payment";
import {
  activeRun,
  backfillRangeError,
  dayCount,
  emptyCounts,
  parseReconcileState,
  type ReconcileState,
  recentRange,
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
  "settlement.processed",
] as const;

/**
 * Why "Sync now" is off, in one line, or null when it can run. Without the
 * key secret it still runs, but only syncs payments stuck in the queue.
 */
export function syncUnavailableReason(setup: RazorpaySetup): string | null {
  if (!setup.enabled) {
    return "Razorpay is not configured on this server.";
  }
  if (setup.testInProduction) {
    return "A test key can't sync on a production server.";
  }
  return null;
}

/** Why "Import past payments" is off: it lists payments, so it needs the key secret. */
export function backfillUnavailableReason(setup: RazorpaySetup): string | null {
  const sync = syncUnavailableReason(setup);
  if (sync) {
    return sync;
  }
  if (setup.enabled && !setup.apiKey) {
    return "Set RAZORPAY_KEY_SECRET on the server to import past payments; without it Sync now only retries payments stuck in the queue, and webhooks keep recording payments.";
  }
  return null;
}

/**
 * Why settlements are not recorded, in one line, or null when they are.
 * They need the key secret: only the API lists the payments a payout
 * covered.
 */
export function settlementsUnavailableReason(
  setup: RazorpaySetup
): string | null {
  const sync = syncUnavailableReason(setup);
  if (sync) {
    return sync;
  }
  if (setup.enabled && !setup.apiKey) {
    return "Needs RAZORPAY_KEY_SECRET on the server: settlements and the payments they covered come from the Razorpay API.";
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
  /** Refunds held for this mode: waiting for their payment, or for a payment that was not imported. */
  pendingRefunds: { notImported: number; waiting: number };
  /** Sync now and Import past payments, and the run in progress or last finished. */
  reconcile: {
    /** The run queued or running now, as pg-boss holds it. */
    active: ReconcileState | null;
    /** One line for why Import past payments is off; null when it can run. */
    backfillUnavailableReason: string | null;
    last: ReconcileState | null;
    /** True when a sync lists payments and refunds from the API (the key secret is set). */
    listsFromApi: boolean;
    /** One line for why Sync now is off; null when it can run. */
    syncUnavailableReason: string | null;
  };
  /** Refunds the founder should look at. */
  refundAttention: { afterReceipt: number; amountChanged: number };
  /** Settlements recorded for this mode. */
  settlements: {
    /** India date of the latest settlement recorded, yyyy-MM-dd. */
    lastSettledOn: string | null;
    /** When a settlement was last written, epoch milliseconds. */
    lastSyncedAt: number | null;
    /** One line for why settlements are off; null when they are recorded. */
    unavailableReason: string | null;
    /** Payment and refund lines waiting for their payment or refund. */
    unlinked: number;
  };
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
  const settlements = setup.enabled
    ? await razorpaySettlementStatus(setup.mode)
    : { lastSettledOn: null, lastSyncedAt: null, unlinked: 0 };
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
    pendingRefunds: setup.enabled
      ? await countPendingRefunds(setup.mode)
      : { notImported: 0, waiting: 0 },
    reconcile: {
      active: activeRun(
        parseReconcileState(config.get(RAZORPAY_CONFIG_KEYS.reconcileRun)),
        await hasOpenReconcileJob()
      ),
      backfillUnavailableReason: backfillUnavailableReason(setup),
      last: parseReconcileState(config.get(RAZORPAY_CONFIG_KEYS.lastReconcile)),
      listsFromApi: setup.enabled && setup.apiKey !== null,
      syncUnavailableReason: syncUnavailableReason(setup),
    },
    refundAttention: attention,
    settlements: {
      lastSettledOn: settlements.lastSettledOn,
      lastSyncedAt: settlements.lastSyncedAt?.getTime() ?? null,
      unavailableReason: settlementsUnavailableReason(setup),
      unlinked: settlements.unlinked,
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
 * days (without the key secret it only syncs payments stuck in the queue),
 * or "Import past payments" over a chosen range of at most 400 days (key
 * secret only). Refused while pg-boss holds an open run; the queue holds
 * one at a time, so a refused send says so too. The run shows as queued
 * from before the send, so the job's own progress is never overwritten; a
 * refused send puts back what was there, unless another request has
 * written since.
 */
export async function requestRazorpayReconcile(
  request: ReconcileRequest,
  setup: RazorpaySetup = razorpaySetup(),
  queue: (
    payload: RazorpayReconcilePayload
  ) => Promise<string | null> = enqueueReconcile,
  now: Date = new Date(),
  openJob: () => Promise<boolean> = hasOpenReconcileJob
): Promise<{ days: number; from: string; to: string }> {
  const unavailable =
    request.reason === "backfill"
      ? backfillUnavailableReason(setup)
      : syncUnavailableReason(setup);
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
  const busy = new RazorpaySettingsError(
    "A Razorpay sync is already running. Try again when it has finished."
  );
  if (await openJob()) {
    throw busy;
  }
  const config = await readRazorpayConfig();
  const previous = config.get(RAZORPAY_CONFIG_KEYS.reconcileRun) ?? "";
  const listed = setup.enabled && setup.apiKey !== null;
  const days = listed ? dayCount(range.from, range.to) : 0;
  const queued = JSON.stringify({
    counts: emptyCounts(),
    from: range.from,
    listed,
    reason: request.reason,
    requestId: uuidv7(),
    status: "queued",
    to: range.to,
    updatedAt: now.toISOString(),
    windowsDone: 0,
    windowsTotal: days,
  } satisfies ReconcileState);
  await writeRazorpayConfig({ reconcileRun: queued });
  let jobId: string | null;
  try {
    jobId = await queue({ ...range, reason: request.reason });
  } catch (error) {
    await replaceRazorpayConfigIf("reconcileRun", queued, previous);
    throw error;
  }
  if (!jobId) {
    await replaceRazorpayConfigIf("reconcileRun", queued, previous);
    throw busy;
  }
  return { days, ...range };
}
