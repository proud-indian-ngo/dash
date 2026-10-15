import { enqueue } from "@pi-dash/jobs/enqueue";
import type { LedgerPostSourcePayload } from "@pi-dash/jobs/types";
import { withFireAndForgetLog } from "@pi-dash/observability";

/**
 * Server-only. After a server command commits a change to an income record,
 * queue its posting (finance layer 3-2): one `ledger-post-source` job per
 * source, keyed by source so repeats collapse, or the `ledger-post-pending`
 * sweep after a bulk import. Fire and forget: a failed enqueue is logged,
 * and the daily sweep posts whatever was missed. Jobs are outside the
 * audit ledger.
 */

export type LedgerSourceRef = LedgerPostSourcePayload;

export function queueLedgerPosting(
  sources: readonly (LedgerSourceRef | null | undefined)[]
): void {
  const seen = new Set<string>();
  for (const source of sources) {
    if (!source) {
      continue;
    }
    const key = `${source.sourceType}:${source.sourceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    withFireAndForgetLog(
      {
        event: "ledger_post_source_queued",
        sourceId: source.sourceId,
        sourceType: source.sourceType,
      },
      async () => {
        await enqueue("ledger-post-source", source, { singletonKey: key });
      }
    );
  }
}

/** Queues the sweep (one at a time); for imports that touch many records. */
export function queueLedgerSweep(
  reason: "after_import" | "manual",
  actorId?: string
): void {
  withFireAndForgetLog(
    { event: "ledger_post_pending_queued", reason },
    async () => {
      await enqueue("ledger-post-pending", {
        reason,
        ...(actorId ? { actorId } : {}),
      });
    }
  );
}

export const contributionSource = (sourceId: string): LedgerSourceRef => ({
  sourceId,
  sourceType: "contribution",
});

export const settlementSource = (sourceId: string): LedgerSourceRef => ({
  sourceId,
  sourceType: "gateway_settlement",
});
