import type { getBossInstance } from "@pi-dash/jobs/boss-instance";
import { withDefaultOutput } from "@pi-dash/jobs/handlers/create-handler";
import type { RazorpaySyncPaymentPayload } from "@pi-dash/jobs/types";
import { createRequestLogger } from "evlog";

import { databaseErrorFields, sanitizedError } from "@/lib/safe-errors";

import { razorpaySetup } from "./config";
import {
  markRazorpaySyncFailed,
  type SyncOutcome,
  syncRazorpayPayment,
} from "./ingest";

/**
 * Server-only. The `razorpay-sync-payment` worker. It lives in the web app,
 * not `@pi-dash/jobs`, because it runs the contribution import rules that
 * live here; the queue itself is created with the others. Logs carry the
 * payment ID and outcome only.
 */

const QUEUE = "razorpay-sync-payment";

type Boss = NonNullable<ReturnType<typeof getBossInstance>>;
/** The part of a pg-boss job the worker reads. */
interface SyncJob {
  data: RazorpaySyncPaymentPayload;
  id: string;
  retryCount?: number;
  retryLimit?: number;
}
const REGISTERED_KEY = "__razorpay_worker_registered__";

type Sync = (
  input: RazorpaySyncPaymentPayload,
  onStatus: (status: string) => void
) => Promise<SyncOutcome>;

/** Called once a job has failed its last retry. */
type GiveUp = (input: RazorpaySyncPaymentPayload) => Promise<boolean>;

const defaultGiveUp: GiveUp = async ({ day, paymentId }) => {
  const setup = razorpaySetup();
  return day && setup.enabled
    ? await markRazorpaySyncFailed(paymentId, day, setup.mode)
    : false;
};

/** pg-boss counts retries from zero, so the last attempt runs with retryCount = retryLimit. */
const isLastAttempt = (job: SyncJob) =>
  job.retryLimit !== undefined && (job.retryCount ?? 0) >= job.retryLimit;

export async function handleRazorpaySyncPayment(
  jobs: readonly SyncJob[],
  sync: Sync = (input, onStatus) =>
    syncRazorpayPayment(input, razorpaySetup(), undefined, onStatus),
  giveUp: GiveUp = defaultGiveUp
): Promise<{ outcomes: SyncOutcome[] }> {
  const outcomes: SyncOutcome[] = [];
  for (const job of jobs) {
    const { day, paymentId } = job.data;
    const log = createRequestLogger({ method: "JOB", path: QUEUE });
    log.set({ jobId: job.id, paymentId });
    try {
      const outcome = await sync({ day, paymentId }, (status) => {
        log.set({ paymentStatus: status });
      });
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
}
