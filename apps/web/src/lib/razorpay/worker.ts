import {
  contributionIdsForRazorpayPayment,
  refundIdsForRazorpayRefund,
  settlementIdsForRazorpaySettlement,
  settlementIdsLinkedTo,
} from "@pi-dash/db/queries/ledger-sources";
import type { getBossInstance } from "@pi-dash/jobs/boss-instance";
import { withDefaultOutput } from "@pi-dash/jobs/handlers/create-handler";
import type {
  RazorpayReconcilePayload,
  RazorpaySyncPaymentPayload,
  RazorpaySyncRefundPayload,
  RazorpaySyncSettlementPayload,
} from "@pi-dash/jobs/types";
import { createRequestLogger } from "evlog";

import {
  contributionSource,
  queueLedgerPosting,
  queueLedgerSweep,
  settlementSource,
} from "@/lib/ledger-posting";
import { databaseErrorFields, sanitizedError } from "@/lib/safe-errors";

import { razorpaySetup } from "./config";
import {
  markRazorpaySyncFailed,
  type SyncOutcome,
  syncRazorpayPayment,
} from "./ingest";
import {
  type ReconcileOutcome,
  runRazorpayReconcile,
  saveReconcileRun,
} from "./reconcile";
import {
  RefundNotProcessedError,
  type RefundSyncOutcome,
  syncRazorpayRefund,
} from "./refund";
import {
  SettlementLinesNotReadyError,
  type SettlementSyncOutcome,
  syncRazorpaySettlement,
} from "./settlement";

/**
 * Server-only. The Razorpay workers (`razorpay-sync-payment`,
 * `razorpay-sync-refund`, `razorpay-sync-settlement` and
 * `razorpay-reconcile`). They live in the web
 * app, not `@pi-dash/jobs`, because they run the contribution import rules
 * that live here; the queues themselves are created with the others. Logs
 * carry IDs, outcomes, counts and page numbers only.
 */

const QUEUE = "razorpay-sync-payment";
const REFUND_QUEUE = "razorpay-sync-refund";
const RECONCILE_QUEUE = "razorpay-reconcile";
const SETTLEMENT_QUEUE = "razorpay-sync-settlement";

type Boss = NonNullable<ReturnType<typeof getBossInstance>>;
/** The part of a pg-boss job a worker reads. */
interface Job<T> {
  data: T;
  id: string;
  retryCount?: number;
  retryLimit?: number;
}
type SyncJob = Job<RazorpaySyncPaymentPayload>;
const REGISTERED_KEY = "__razorpay_worker_registered__";

type Sync = (
  input: RazorpaySyncPaymentPayload,
  onStatus: (status: string) => void,
  onRefunds: (tally: {
    applied: number;
    changed: number;
    waiting: number;
  }) => void
) => Promise<SyncOutcome>;

/** Called once a job has failed its last retry. */
type GiveUp = (input: RazorpaySyncPaymentPayload) => Promise<boolean>;

const defaultGiveUp: GiveUp = async ({ day, paymentId }) => {
  const setup = razorpaySetup();
  return day && setup.enabled
    ? await markRazorpaySyncFailed(paymentId, day, setup.mode)
    : false;
};

/**
 * Queues the books for what a sync recorded (finance layer 3-2). A failed
 * lookup is logged and left to the daily sweep; it never fails the sync.
 */
type QueueBooks = (id: string) => Promise<void>;

const queuePaymentBooks: QueueBooks = async (paymentId) => {
  const contributionIds = await contributionIdsForRazorpayPayment(paymentId);
  // A payout line linked to the gift by this sync posts again too.
  const payouts = await settlementIdsLinkedTo({ contributionIds });
  queueLedgerPosting([
    ...contributionIds.map(contributionSource),
    ...payouts.map(settlementSource),
  ]);
};

const queueRefundBooks: QueueBooks = async (refundId) => {
  const refundIds = await refundIdsForRazorpayRefund(refundId);
  // A payout's refund line linked by this sync posts again too.
  const payouts = await settlementIdsLinkedTo({ refundIds });
  queueLedgerPosting([
    ...refundIds.map((id) => ({
      sourceId: id,
      sourceType: "contribution_refund" as const,
    })),
    ...payouts.map(settlementSource),
  ]);
};

const queueSettlementBooks: QueueBooks = async (settlementId) => {
  queueLedgerPosting(
    (await settlementIdsForRazorpaySettlement(settlementId)).map(
      settlementSource
    )
  );
};

async function queueBooksSafely(
  queue: QueueBooks,
  id: string,
  log: { set: (fields: Record<string, unknown>) => void }
) {
  try {
    await queue(id);
  } catch (error) {
    log.set({
      booksQueueError: sanitizedError(error, "ledger_queue_failed").message,
    });
  }
}

/** pg-boss counts retries from zero, so the last attempt runs with retryCount = retryLimit. */
const isLastAttempt = (job: Job<unknown>) =>
  job.retryLimit !== undefined && (job.retryCount ?? 0) >= job.retryLimit;

export async function handleRazorpaySyncPayment(
  jobs: readonly SyncJob[],
  sync: Sync = (input, onStatus, onRefunds) =>
    syncRazorpayPayment(input, razorpaySetup(), undefined, onStatus, onRefunds),
  giveUp: GiveUp = defaultGiveUp,
  queueBooks: QueueBooks = queuePaymentBooks
): Promise<{ outcomes: SyncOutcome[] }> {
  const outcomes: SyncOutcome[] = [];
  for (const job of jobs) {
    const { day, paymentId } = job.data;
    const log = createRequestLogger({ method: "JOB", path: QUEUE });
    log.set({ jobId: job.id, paymentId });
    try {
      const outcome = await sync(
        { day, paymentId },
        (status) => {
          log.set({ paymentStatus: status });
        },
        (tally) => {
          log.set({ refunds: tally });
        }
      );
      await queueBooksSafely(queueBooks, paymentId, log);
      log.set({ event: "razorpay_payment_synced", outcome });
      log.emit();
      outcomes.push(outcome);
    } catch (error) {
      // pg-boss stores the thrown error, so it gets the sanitised one too.
      const safe = sanitizedError(error, "razorpay_payment_sync_failed");
      log.set({
        event: "razorpay_payment_sync_failed",
        lastAttempt: isLastAttempt(job),
        ...databaseErrorFields(error),
      });
      if (isLastAttempt(job)) {
        try {
          log.set({ markedSyncFailed: await giveUp({ day, paymentId }) });
        } catch (markError) {
          log.set({
            markedSyncFailed: false,
            markError: sanitizedError(markError, "mark_failed").message,
          });
        }
      }
      log.error(safe);
      log.emit();
      throw safe;
    }
  }
  return { outcomes };
}

/**
 * Applies refunds. A refund whose payment is not imported yet is held for
 * it (outcome `payment_not_imported`); one the API does not show as
 * processed yet is thrown again so pg-boss retries it.
 */
export async function handleRazorpaySyncRefund(
  jobs: readonly Job<RazorpaySyncRefundPayload>[],
  sync: (input: RazorpaySyncRefundPayload) => Promise<RefundSyncOutcome> = (
    input
  ) => syncRazorpayRefund(input, razorpaySetup()),
  queueBooks: QueueBooks = queueRefundBooks
): Promise<{ outcomes: RefundSyncOutcome[] }> {
  const outcomes: RefundSyncOutcome[] = [];
  for (const job of jobs) {
    const { copy, paymentId, refundId } = job.data;
    const log = createRequestLogger({ method: "JOB", path: REFUND_QUEUE });
    log.set({ jobId: job.id, paymentId, refundId });
    try {
      const outcome = await sync({
        ...(copy ? { copy } : {}),
        paymentId,
        refundId,
      });
      await queueBooksSafely(queueBooks, refundId, log);
      log.set({ event: "razorpay_refund_synced", outcome });
      log.emit();
      outcomes.push(outcome);
    } catch (error) {
      if (error instanceof RefundNotProcessedError) {
        log.set({
          event: "razorpay_refund_not_processed_yet",
          lastAttempt: isLastAttempt(job),
        });
        log.warn("refund not processed yet; retrying");
        log.emit();
        throw error;
      }
      const safe = sanitizedError(error, "razorpay_refund_sync_failed");
      log.set({
        event: "razorpay_refund_sync_failed",
        lastAttempt: isLastAttempt(job),
        ...databaseErrorFields(error),
      });
      log.error(safe);
      log.emit();
      throw safe;
    }
  }
  return { outcomes };
}

/**
 * Records a settlement a webhook announced. A processed settlement whose
 * lines are not listed yet, or a failure (the API, the database), is thrown
 * so pg-boss retries it; logs carry the settlement ID and counts only.
 */
export async function handleRazorpaySyncSettlement(
  jobs: readonly Job<RazorpaySyncSettlementPayload>[],
  sync: (
    input: RazorpaySyncSettlementPayload
  ) => Promise<SettlementSyncOutcome> = (input) =>
    syncRazorpaySettlement(input, razorpaySetup()),
  queueBooks: QueueBooks = queueSettlementBooks
): Promise<{ outcomes: SettlementSyncOutcome[] }> {
  const outcomes: SettlementSyncOutcome[] = [];
  for (const job of jobs) {
    const { settlementId } = job.data;
    const log = createRequestLogger({ method: "JOB", path: SETTLEMENT_QUEUE });
    log.set({ jobId: job.id, settlementId });
    try {
      const outcome = await sync({ settlementId });
      if (outcome.outcome === "recorded") {
        await queueBooksSafely(queueBooks, settlementId, log);
      }
      log.set({ event: "razorpay_settlement_synced", ...outcome });
      log.emit();
      outcomes.push(outcome);
    } catch (error) {
      if (error instanceof SettlementLinesNotReadyError) {
        log.set({
          event: "razorpay_settlement_lines_not_ready",
          lastAttempt: isLastAttempt(job),
        });
        log.warn("settlement lines not listed yet; retrying");
        log.emit();
        throw error;
      }
      const safe = sanitizedError(error, "razorpay_settlement_sync_failed");
      log.set({
        event: "razorpay_settlement_sync_failed",
        lastAttempt: isLastAttempt(job),
        ...databaseErrorFields(error),
      });
      log.error(safe);
      log.emit();
      throw safe;
    }
  }
  return { outcomes };
}

/** Runs a reconcile; its result (counts, pages, error code) is logged and kept in app_config. */
export async function handleRazorpayReconcile(
  jobs: readonly Job<RazorpayReconcilePayload>[],
  run: (input: RazorpayReconcilePayload) => Promise<ReconcileOutcome> = (
    input
  ) => runRazorpayReconcile(input, razorpaySetup()),
  clearRun: () => Promise<void> = () => saveReconcileRun(null),
  queueSweep: () => void = () => queueLedgerSweep("after_import")
): Promise<{ outcomes: ReconcileOutcome[] }> {
  const outcomes: ReconcileOutcome[] = [];
  for (const job of jobs) {
    const { from, reason, to } = job.data;
    const log = createRequestLogger({ method: "JOB", path: RECONCILE_QUEUE });
    log.set({ from: from ?? null, jobId: job.id, reason, to: to ?? null });
    try {
      const outcome = await run({
        ...(from && to ? { from, to } : {}),
        reason,
      });
      log.set(
        outcome.status === "skipped"
          ? {
              event: "razorpay_reconcile_skipped",
              outcome: outcome.reason,
            }
          : {
              counts: outcome.counts,
              errorCode: outcome.errorCode ?? null,
              event: "razorpay_reconcile_finished",
              outcome: outcome.status,
              pages: outcome.pages,
              windowsDone: outcome.windowsDone,
              windowsTotal: outcome.windowsTotal,
            }
      );
      if (outcome.status === "failed") {
        log.warn("razorpay reconcile failed");
      }
      // A run can record many payments and refunds: post them in one sweep.
      if (outcome.status !== "skipped") {
        queueSweep();
      }
      log.emit();
      outcomes.push(outcome);
    } catch (error) {
      const safe = sanitizedError(error, "razorpay_reconcile_failed");
      log.set({
        event: "razorpay_reconcile_failed",
        ...databaseErrorFields(error),
      });
      try {
        await clearRun();
      } catch {
        // The settings page treats a run whose progress stopped as dead.
      }
      log.error(safe);
      log.emit();
      throw safe;
    }
  }
  return { outcomes };
}

/**
 * Registers the worker once per process (dev server reloads re-run plugins).
 * Called from `server/plugins/jobs.ts`, which knip does not scan.
 * @public
 */
export async function registerRazorpayWorker(boss: Boss): Promise<void> {
  const flags = globalThis as Record<string, unknown>;
  if (flags[REGISTERED_KEY]) {
    return;
  }
  flags[REGISTERED_KEY] = true;
  // Metadata carries retryCount and retryLimit, to tell the last attempt.
  await boss.work<RazorpaySyncPaymentPayload>(
    QUEUE,
    { includeMetadata: true },
    (jobs) =>
      withDefaultOutput<RazorpaySyncPaymentPayload>(() =>
        handleRazorpaySyncPayment(jobs)
      )(jobs)
  );
  await boss.work<RazorpaySyncRefundPayload>(
    REFUND_QUEUE,
    { includeMetadata: true },
    (jobs) =>
      withDefaultOutput<RazorpaySyncRefundPayload>(() =>
        handleRazorpaySyncRefund(jobs)
      )(jobs)
  );
  await boss.work<RazorpaySyncSettlementPayload>(
    SETTLEMENT_QUEUE,
    { includeMetadata: true, pollingIntervalSeconds: 10 },
    (jobs) =>
      withDefaultOutput<RazorpaySyncSettlementPayload>(() =>
        handleRazorpaySyncSettlement(jobs)
      )(jobs)
  );
  // Low traffic: one run every six hours, or one a person asked for.
  await boss.work<RazorpayReconcilePayload>(
    RECONCILE_QUEUE,
    { pollingIntervalSeconds: 10 },
    (jobs) =>
      withDefaultOutput<RazorpayReconcilePayload>(() =>
        handleRazorpayReconcile(jobs)
      )(jobs)
  );
}
