import { flushHeldNotifications } from "@pi-dash/notifications/batching";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

export async function handleFlushHeldNotifications(
  jobs: Job[]
): Promise<Awaited<ReturnType<typeof flushHeldNotifications>>> {
  // Stops between groups once pg-boss aborts the job at its expiry.
  const result = await flushHeldNotifications(jobs[0]?.signal);
  if (
    result.batches > 0 ||
    result.dropped > 0 ||
    result.abandoned > 0 ||
    result.failedGroups > 0
  ) {
    const log = createRequestLogger({
      method: "JOB",
      path: "flush-held-notifications",
    });
    log.set({ event: "flush_complete", ...result });
    log.emit();
  }
  return result;
}
