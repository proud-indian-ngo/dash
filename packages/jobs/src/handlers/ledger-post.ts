import type { SweepResult } from "@pi-dash/db/ledger/income-posting";
import {
  postIncomeSourceNow,
  postPendingIncome,
} from "@pi-dash/db/ledger/income-runner";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type {
  LedgerPostPendingPayload,
  LedgerPostSourcePayload,
} from "../types";

/**
 * Income posting (finance layer 3-2). `ledger-post-source` brings one
 * source, and the sources that follow it, into the books after the record
 * changed; `ledger-post-pending` sweeps every source not up to date (daily,
 * after bulk imports, and when "Post pending" ran out of time). Both are
 * idempotent. Logs carry source types, IDs and counts only.
 */

export async function handleLedgerPostSource(
  jobs: Job<LedgerPostSourcePayload>[],
  run: typeof postIncomeSourceNow = postIncomeSourceNow
): Promise<{ outcomes: string[] }> {
  const outcomes: string[] = [];
  for (const job of jobs) {
    const { sourceId, sourceType } = job.data;
    const log = createRequestLogger({
      method: "JOB",
      path: "ledger-post-source",
    });
    log.set({ jobId: job.id, sourceId, sourceType });
    try {
      const { related, result } = await run({ sourceId, sourceType });
      log.set({
        event: "ledger_source_posted",
        outcome: result.status,
        posted: result.posted,
        reason: result.reason,
        related,
        reversed: result.reversed,
      });
      log.emit();
      outcomes.push(result.status);
    } catch (error) {
      log.set({ event: "ledger_source_post_failed" });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  }
  return { outcomes };
}

export async function handleLedgerPostPending(
  jobs: Job<LedgerPostPendingPayload>[],
  run: typeof postPendingIncome = postPendingIncome
): Promise<{ results: SweepResult[] }> {
  const results: SweepResult[] = [];
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "ledger-post-pending",
    });
    log.set({ jobId: job.id, reason: job.data.reason });
    const failures: string[] = [];
    const result = await run({
      actorId: job.data.actorId ?? null,
      onFailure: (source, error) => {
        failures.push(`${source.sourceType}:${source.sourceId}`);
        log.set({
          lastFailure: error instanceof Error ? error.name : "unknown",
        });
      },
    });
    log.set({
      event: "ledger_pending_posted",
      failedSources: failures.slice(0, 20),
      ...result,
    });
    if (result.failed > 0) {
      log.warn("some sources could not be posted");
    }
    log.emit();
    results.push(result);
  }
  return { results };
}
