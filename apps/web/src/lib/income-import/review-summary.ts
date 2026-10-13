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
  decisions: Readonly<Record<string, RowDecision>>
): boolean {
  const decision = decisions[row.rowId];
  if (decision?.contribution === "skip") {
    return true;
  }
  const donorOk = row.sameDonorAs
    ? Boolean(decisions[row.sameDonorAs.rowId]?.donor)
    : row.donorOptions.length === 0 || Boolean(decision?.donor);
  const duplicateOk = !row.duplicate || decision?.contribution === "import";
  return donorOk && duplicateOk;
}

/**
 * The confirmation's counts, mirroring the server's plan: rows already
 * imported in this batch are not counted again, and needs-review rows
 * without a choice are skipped. A new donor chosen on one row and followed
 * by later rows with the same ID number is counted once.
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
  const chosenNew = new Set<string>();
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
        if (!isDecided(row, decisions)) {
          summary.undecided += 1;
          summary.skips += 1;
        } else if (decision?.contribution === "skip") {
          summary.skips += 1;
        } else {
          summary.imports += 1;
          const chooser = row.sameDonorAs?.rowId ?? row.rowId;
          const newOwnDonor =
            row.donorOptions.length === 0 &&
            row.donor.kind === "new" &&
            !row.donor.sharedWithEarlierRow;
          if (decisions[chooser]?.donor === "new") {
            chosenNew.add(chooser);
          } else if (newOwnDonor) {
            summary.newDonors += 1;
          }
        }
        break;
      default:
        break;
    }
  }
  summary.newDonors += chosenNew.size;
  return summary;
}
