import type { Transaction } from "@rocicorp/zero";

import { type Context, requireEnqueue } from "../context";
import { type Schema, zql } from "../schema";

type Tx = Transaction<Schema>;

/** A record the books post from, for the `ledger-post-source` job. */
export interface LedgerSourceRef {
  sourceId: string;
  sourceType:
    | "contribution"
    | "other_income"
    | "reimbursement"
    | "vendor_payment"
    | "vendor_payment_transaction";
}

/**
 * After the commit, brings records into the books (finance layers 3-2 and
 * 3-3a): the `ledger-post-source` job posts, reverses or reposts each on
 * the server. Keyed by source, so repeated edits collapse into one queued
 * job; the daily sweep posts whatever a failed enqueue missed.
 */
export function queueLedgerPosting(
  ctx: Context,
  tx: Tx,
  sources: readonly LedgerSourceRef[],
  mutator: string
) {
  if (tx.location !== "server" || sources.length === 0) {
    return;
  }
  for (const source of sources) {
    ctx.asyncTasks?.push({
      fn: async () => {
        await requireEnqueue(ctx)("ledger-post-source", source, {
          singletonKey: `${source.sourceType}:${source.sourceId}`,
          traceId: ctx.traceId,
        });
      },
      meta: { mutator, ...source },
    });
  }
}

/**
 * True while the books hold a standing posting for the source (finance
 * layer 3-3a): one that is not a reversal and not reversed. Read on the
 * server only: the books sync to finance readers alone, so a client can't
 * tell, and the server's answer decides.
 */
export async function isPostedInBooks(
  tx: Tx,
  source: LedgerSourceRef
): Promise<boolean> {
  if (tx.location !== "server") {
    return false;
  }
  const postings = await tx.run(
    zql.posting
      .where("sourceType", source.sourceType)
      .where("sourceId", source.sourceId)
  );
  const reversed = new Set(
    postings.flatMap((p) => (p.reversesPostingId ? [p.reversesPostingId] : []))
  );
  return postings.some((p) => !(p.reversesPostingId || reversed.has(p.id)));
}
