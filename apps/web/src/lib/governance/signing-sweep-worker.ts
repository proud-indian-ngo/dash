import type { getBossInstance } from "@pi-dash/jobs/boss-instance";
import { withDefaultOutput } from "@pi-dash/jobs/handlers/create-handler";

import { keysealJobs } from "./signing-jobs";

const QUEUE = "sweep-signing-jobs";
const REGISTERED_KEY = "__signing_sweep_worker_registered__";

/**
 * Server-only. The `sweep-signing-jobs` worker, scheduled only with the
 * signing service: expires DSC helper jobs past their 15 minutes and deletes
 * the blobs of ended or missing ones. A failed run leaves the rest to the next.
 */
export async function registerSigningSweepWorker(
  boss: NonNullable<ReturnType<typeof getBossInstance>>
): Promise<void> {
  const flags = globalThis as Record<string, unknown>;
  if (flags[REGISTERED_KEY]) {
    return;
  }
  flags[REGISTERED_KEY] = true;
  await boss.work<Record<string, never>>(
    QUEUE,
    { pollingIntervalSeconds: 30 },
    withDefaultOutput<Record<string, never>>(() => keysealJobs().sweep())
  );
}
