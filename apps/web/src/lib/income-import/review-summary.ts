import type { RowDecision } from "./classify";
import type { ReviewRowView } from "./review-types";

export interface ReviewSummary {
  conflicts: number;
  errors: number;
  imports: number;
  links: number;
  newDonors: number;
  skips: number;
  /** Needs-review rows still without a choice; they are skipped unless decided. */
  undecided: number;
}

/** Whether a needs-review row has every choice it needs to import. */
export function isDecided(
  row: ReviewRowView,
  decision: RowDecision | undefined
): boolean {
  if (decision?.contribution === "skip") {
    return true;
  }
  const donorOk = row.donorOptions.length === 0 || Boolean(decision?.donor);
  const duplicateOk = !row.duplicate || decision?.contribution === "import";
  return donorOk && duplicateOk;
}

/**
 * The confirmation's counts, mirroring the server's plan: rows already
 * imported in this batch are not counted again, and needs-review rows
 * without a choice are skipped.
 */
export function summarizeReview(
  rows: readonly ReviewRowView[],
  decisions: Readonly<Record<string, RowDecision>>
): ReviewSummary {
  const summary: ReviewSummary = {
    conflicts: 0,
    errors: 0,
    imports: 0,
    links: 0,
    newDonors: 0,
    skips: 0,
    undecided: 0,
  };
  for (const row of rows) {
    const decision = decisions[row.rowId];
    switch (row.category) {
      case "done":
        break;
      case "error":
        summary.errors += 1;
        break;
      case "conflict":
        summary.conflicts += 1;
        break;
      case "already_imported":
        summary.links += 1;
        break;
      case "ready":
        summary.imports += 1;
        break;
      case "new_donor":
        summary.imports += 1;
        if (row.donor.kind === "new" && !row.donor.sharedWithEarlierRow) {
          summary.newDonors += 1;
        }
        break;
      case "needs_review":
        if (!isDecided(row, decision)) {
          summary.undecided += 1;
          summary.skips += 1;
        } else if (decision?.contribution === "skip") {
          summary.skips += 1;
        } else {
          summary.imports += 1;
          const newOwnDonor =
            row.donorOptions.length === 0 &&
            row.donor.kind === "new" &&
            !row.donor.sharedWithEarlierRow;
          if (decision?.donor === "new" || newOwnDonor) {
            summary.newDonors += 1;
          }
        }
        break;
      default:
        break;
    }
  }
  return summary;
}
