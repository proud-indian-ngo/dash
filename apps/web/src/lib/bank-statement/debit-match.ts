import type { StatementDocumentAllocationKind } from "@pi-dash/shared/constants";

import { daysApart, lineHasUtr } from "./match";

/**
 * Bank debit matching rules (finance layer 3-3b), pure and shared by the
 * server and the "Find other match" dialog.
 *
 * Suggestions: an open debit is suggested the approved claims and vendor
 * payments whose unpaid amount equals what is left of the debit:
 *
 * 1. a vendor payment whose UTR or reference is a whole token of the line's
 *    reference or narration, at any date (ranked first);
 * 2. a vendor payment paid, or a reimbursement approved, within
 *    `DEBIT_MATCH_WINDOW_DAYS` of the line's value date, closest first.
 *
 * Nothing is matched automatically: a reviewer confirms each match. A
 * suggestion turned down ("Not this") is never shown for that line again.
 *
 * Allocation: the debit pays the selected documents in the order picked,
 * each up to what is left of it, so when the selection is more than the
 * debit the last one is paid in part and waits for another debit for the
 * rest; when it is less, the difference is left to explain (another
 * document later) or recorded as bank charges.
 */

/** Days either side of a debit within which a payment or approval is suggested. */
export const DEBIT_MATCH_WINDOW_DAYS = 10;

/** How many suggestions a line shows at most. */
export const DEBIT_SUGGESTION_LIMIT = 3;

export interface DebitLine {
  amountPaise: number;
  /** Suggestions a reviewer turned down: document IDs. */
  dismissed: readonly string[];
  id: string;
  narration: string;
  reference: string | null;
  /** What live allocations on the line already explain. */
  allocatedPaise: number;
  valueOn: string;
}

export interface DebitCandidate {
  allocatedPaise: number;
  amountPaise: number;
  id: string;
  kind: StatementDocumentAllocationKind;
  on: string;
  reference: string | null;
}

export type DebitSuggestionReason = "reference" | "amount_date";

export interface DebitSuggestion {
  daysApart: number;
  id: string;
  kind: StatementDocumentAllocationKind;
  reason: DebitSuggestionReason;
}

export const remainingOf = (doc: {
  allocatedPaise: number;
  amountPaise: number;
}) => Math.max(0, doc.amountPaise - doc.allocatedPaise);

/** The best few documents for one debit, best first. */
export function suggestDebitMatches(
  line: DebitLine,
  candidates: readonly DebitCandidate[],
  limit = DEBIT_SUGGESTION_LIMIT
): DebitSuggestion[] {
  const open = line.amountPaise - line.allocatedPaise;
  if (open <= 0) {
    return [];
  }
  const suggestions: DebitSuggestion[] = [];
  for (const doc of candidates) {
    if (line.dismissed.includes(doc.id) || remainingOf(doc) !== open) {
      continue;
    }
    const apart = daysApart(line.valueOn, doc.on);
    const byReference =
      doc.kind === "vendor_payment_transaction" &&
      lineHasUtr(line, doc.reference);
    if (byReference) {
      suggestions.push({
        daysApart: apart,
        id: doc.id,
        kind: doc.kind,
        reason: "reference",
      });
    } else if (apart <= DEBIT_MATCH_WINDOW_DAYS) {
      suggestions.push({
        daysApart: apart,
        id: doc.id,
        kind: doc.kind,
        reason: "amount_date",
      });
    }
  }
  return suggestions
    .sort(
      (a, b) =>
        Number(b.reason === "reference") - Number(a.reason === "reference") ||
        a.daysApart - b.daysApart ||
        a.id.localeCompare(b.id)
    )
    .slice(0, limit);
}

// ── Allocating one debit ────────────────────────────────────────────────────

export interface DebitSelection {
  id: string;
  kind: StatementDocumentAllocationKind;
  /** What is still unpaid of the document. */
  remainingPaise: number;
}

/**
 * How the difference between the debit and the selection is recorded:
 * `none` when they are equal; when the selection is less, `leave` (the rest
 * of the debit waits for another document) or `bank_charges`; when it is
 * more, `part_pay` (the last document waits for another debit for its
 * rest).
 */
export const DEBIT_DIFFERENCE_VALUES = [
  "none",
  "leave",
  "bank_charges",
  "part_pay",
] as const;
export type DebitDifference = (typeof DEBIT_DIFFERENCE_VALUES)[number];

export interface DebitAllocationPlan {
  allocations: {
    amountPaise: number;
    id: string;
    kind: StatementDocumentAllocationKind;
  }[];
  /** What is left of the debit once the selection is paid (zero when it covers it). */
  debitLeftPaise: number;
  /** The differences that may be recorded for this selection. */
  differences: DebitDifference[];
  /** The document paid only in part, and what of it is left unpaid. */
  partial: { id: string; unpaidPaise: number } | null;
  selectedPaise: number;
}

export class DebitAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DebitAllocationError";
  }
}

/**
 * Pays the selection from what is left of the debit, in the order picked.
 * Throws when a document has nothing left to pay or is picked twice.
 */
export function planDebitAllocation(
  debitOpenPaise: number,
  selections: readonly DebitSelection[]
): DebitAllocationPlan {
  const seen = new Set<string>();
  let left = debitOpenPaise;
  let selectedPaise = 0;
  const allocations: DebitAllocationPlan["allocations"] = [];
  let partial: DebitAllocationPlan["partial"] = null;
  for (const selection of selections) {
    if (seen.has(selection.id)) {
      throw new DebitAllocationError("A record is picked twice");
    }
    seen.add(selection.id);
    if (selection.remainingPaise <= 0) {
      throw new DebitAllocationError(
        "One of the records is already paid in full by bank lines"
      );
    }
    selectedPaise += selection.remainingPaise;
    if (left <= 0) {
      throw new DebitAllocationError(
        "The debit is used up before the last record: pick fewer"
      );
    }
    const amountPaise = Math.min(left, selection.remainingPaise);
    allocations.push({ amountPaise, id: selection.id, kind: selection.kind });
    left -= amountPaise;
    if (amountPaise < selection.remainingPaise) {
      partial = {
        id: selection.id,
        unpaidPaise: selection.remainingPaise - amountPaise,
      };
    }
  }
  let differences: DebitDifference[] = ["none"];
  if (selectedPaise < debitOpenPaise) {
    differences = ["leave", "bank_charges"];
  } else if (selectedPaise > debitOpenPaise) {
    differences = ["part_pay"];
  }
  return {
    allocations,
    debitLeftPaise: left,
    differences,
    partial,
    selectedPaise,
  };
}
