import type { ReviewRowView } from "./review-types";

/** Why rows wait, in the order the batch page lists them. */
const WAITING_REASON_LABELS = {
  needs_review: "needs review",
  undecided: "left for review",
  queued: "syncing",
  sync_failed: "sync failed",
  no_clearing_account: "no clearing account",
  clearing_account_inactive: "account inactive",
} as const;

type WaitingReason = keyof typeof WAITING_REASON_LABELS;

export interface WaitingGroup {
  count: number;
  label: string;
  reason: WaitingReason | "other";
}

const isWaitingReason = (reason: string | null): reason is WaitingReason =>
  reason !== null && reason in WAITING_REASON_LABELS;

/**
 * The batch's waiting rows grouped by why they wait: pending rows, and
 * skipped rows a run left undecided, as `pending_count` counts them. A
 * payment syncing for a few seconds is told apart from one a reviewer must
 * decide.
 */
export function waitingBreakdown(
  rows: readonly Pick<ReviewRowView, "outcome" | "outcomeReason">[]
): WaitingGroup[] {
  const counts = new Map<WaitingReason | "other", number>();
  for (const row of rows) {
    const waiting =
      row.outcome === "pending" ||
      (row.outcome === "skipped" && row.outcomeReason === "undecided");
    if (!waiting) {
      continue;
    }
    const reason = isWaitingReason(row.outcomeReason)
      ? row.outcomeReason
      : "other";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const order = [
    ...(Object.keys(WAITING_REASON_LABELS) as WaitingReason[]),
    "other" as const,
  ];
  return order
    .filter((reason) => counts.has(reason))
    .map((reason) => ({
      count: counts.get(reason) ?? 0,
      label:
        reason === "other" ? "not imported" : WAITING_REASON_LABELS[reason],
      reason,
    }));
}
