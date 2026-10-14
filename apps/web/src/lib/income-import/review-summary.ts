import type { RowDecision } from "./classify";
import type { ReviewRowView } from "./review-types";

export interface ReviewSummary {
  conflicts: number;
  errors: number;
  /** Distinct donors already on record that the imported gifts go to. */
  existingDonors: number;
  /** Existing donors that get missing details filled (a donor chosen on several rows counts once). */
  fills: number;
  imports: number;
  /** Rows an earlier upload already imported; they are linked, not imported again. */
  links: number;
  /** Distinct donors the import creates. */
  newDonors: number;
  /** Rows that repeat an earlier row of the file; the gift is counted once. */
  repeats: number;
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

/** "party:<id>" for a donor on record, "new:<rowId>" for one the row creates. */
type DonorRef = string;

/**
 * Who a row's gift goes to, mirroring the server's plan: a later row of a
 * new donor, or one that follows an earlier row's choice, shares that row's
 * donor, even when that row itself is skipped.
 */
function resolveDonor(
  row: ReviewRowView,
  decision: RowDecision | undefined,
  resolved: ReadonlyMap<string, DonorRef>
): DonorRef | null {
  if (row.donor.kind === "existing") {
    return `party:${row.donor.partyId}`;
  }
  if (row.donor.kind === "new") {
    return `new:${row.donor.createdOnRow?.rowId ?? row.rowId}`;
  }
  if (row.sameDonorAs) {
    return resolved.get(row.sameDonorAs.rowId) ?? null;
  }
  const choice = decision?.donor;
  if (!choice) {
    return null;
  }
  if (choice === "new") {
    return `new:${row.rowId}`;
  }
  if (choice.startsWith("row:")) {
    const rowId = choice.slice("row:".length);
    return resolved.get(rowId) ?? `new:${rowId}`;
  }
  return choice;
}

/**
 * The review's counts, mirroring the server's plan: rows already imported
 * in this batch are not counted again, needs-review rows without a choice
 * are skipped, and each donor is counted once however many rows it has.
 */
export function summarizeReview(
  rows: readonly ReviewRowView[],
  decisions: Readonly<Record<string, RowDecision>>
): ReviewSummary {
  const summary: ReviewSummary = {
    conflicts: 0,
    errors: 0,
    existingDonors: 0,
    fills: 0,
    imports: 0,
    links: 0,
    newDonors: 0,
    repeats: 0,
    skips: 0,
    undecided: 0,
  };
  const resolved = new Map<string, DonorRef>();
  const donors = new Set<DonorRef>();
  const filled = new Set<string>();
  for (const row of rows) {
    const decision = decisions[row.rowId];
    switch (row.category) {
      case "done":
        continue;
      case "error":
        summary.errors += 1;
        continue;
      case "conflict":
        summary.conflicts += 1;
        continue;
      case "already_imported":
        summary.links += 1;
        continue;
      case "repeated_in_file":
        summary.repeats += 1;
        continue;
      default:
        break;
    }
    const donor = resolveDonor(row, decision, resolved);
    if (donor) {
      resolved.set(row.rowId, donor);
    }
    if (row.category === "needs_review" && !isDecided(row, decisions)) {
      summary.undecided += 1;
      summary.skips += 1;
    } else if (decision?.contribution === "skip" || !donor) {
      summary.skips += 1;
    } else {
      summary.imports += 1;
      donors.add(donor);
      const chosen = row.donorOptions.find((o) => o.value === decision?.donor);
      if (
        !row.sameDonorAs &&
        chosen &&
        chosen.fills.length > 0 &&
        decision?.fillMissing !== false
      ) {
        filled.add(chosen.value);
      }
    }
  }
  for (const donor of donors) {
    if (donor.startsWith("new:")) {
      summary.newDonors += 1;
    } else {
      summary.existingDonors += 1;
    }
  }
  summary.fills = filled.size;
  return summary;
}

const count = (n: number, one: string, many: string) =>
  n > 0 ? `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}` : null;

/** One line above the review tabs, e.g. "3 gifts to import · 2 new donors · 1 error". */
export function reviewSummaryLine(summary: ReviewSummary): string {
  return [
    count(summary.imports, "gift to import", "gifts to import"),
    count(summary.newDonors, "new donor", "new donors"),
    count(summary.existingDonors, "existing donor", "existing donors"),
    count(summary.undecided, "needs review", "need review"),
    count(summary.links, "already imported", "already imported"),
    count(summary.repeats, "repeated in file", "repeated in file"),
    count(summary.conflicts, "conflict", "conflicts"),
    count(summary.errors, "error", "errors"),
  ]
    .filter(Boolean)
    .join(" · ");
}
