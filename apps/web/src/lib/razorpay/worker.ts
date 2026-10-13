import type { getBossInstance } from "@pi-dash/jobs/boss-instance";
import { withDefaultOutput } from "@pi-dash/jobs/handlers/create-handler";
import type { RazorpaySyncPaymentPayload } from "@pi-dash/jobs/types";
import { createRequestLogger } from "evlog";

import { databaseErrorFields, sanitizedError } from "@/lib/safe-errors";

import { razorpaySetup } from "./config";
import { type SyncOutcome, syncRazorpayPayment } from "./ingest";

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
}
const REGISTERED_KEY = "__razorpay_worker_registered__";

export async function handleRazorpaySyncPayment(
  jobs: readonly SyncJob[],
  sync: (input: RazorpaySyncPaymentPayload) => Promise<SyncOutcome> = (input) =>
    syncRazorpayPayment(input, razorpaySetup())
): Promise<{ outcomes: SyncOutcome[] }> {
  const outcomes: SyncOutcome[] = [];
  for (const job of jobs) {
    const { day, paymentId } = job.data;
    const log = createRequestLogger({ method: "JOB", path: QUEUE });
    log.set({ jobId: job.id, paymentId });
    try {
      const outcome = await sync({ day, paymentId });
      log.set({ event: "razorpay_payment_synced", outcome });
      log.emit();
      outcomes.push(outcome);
    } catch (error) {
      // pg-boss stores the thrown error, so it gets the sanitised one too.
      const safe = sanitizedError(error, "razorpay_payment_sync_failed");
      log.set({
        event: "razorpay_payment_sync_failed",
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
  await boss.work<RazorpaySyncPaymentPayload>(
    QUEUE,
    withDefaultOutput((jobs) => handleRazorpaySyncPayment(jobs))
  );
}
