import type {
  StatementLineIgnoreReason,
  StatementLineMatchKind,
  StatementLineMatchReason,
} from "@pi-dash/shared/constants";

import type { StatementRowCategory } from "./types";

export const MATCH_KIND_LABELS: Record<StatementLineMatchKind, string> = {
  contribution: "Donation",
  giveindia_payout: "give.do payout",
  other: "Other",
  settlement: "Settlement",
  transfer: "Transfer between own accounts",
};

export const MATCH_REASON_LABELS: Record<StatementLineMatchReason, string> = {
  amount_date: "Same amount, within 3 days",
  giveindia_narration: "Narration names GiveIndia or give.do",
  manual: "Matched by hand",
  reference: "Reference matches",
  utr: "UTR matches",
};

export const IGNORE_REASON_LABELS: Record<StatementLineIgnoreReason, string> = {
  bank_interest: "Bank interest",
  not_ours: "Not ours",
  other: "Other",
  reversal: "Reversal",
};

export const STATEMENT_ROW_CATEGORY_LABELS: Record<
  StatementRowCategory,
  string
> = {
  error: "Errors",
  existing: "Already imported",
  new: "New lines",
  skipped: "Skipped",
};

/** Shown on debit lines: what can be done with them before the ledger. */
export const DEBIT_MATCHING_NOTE = "Expense matching comes with the ledger.";

const matchKindFrom = (value: string | null | undefined) =>
  value && value in MATCH_KIND_LABELS
    ? MATCH_KIND_LABELS[value as StatementLineMatchKind]
    : null;

const reasonFrom = (value: string | null | undefined) =>
  value && value in MATCH_REASON_LABELS
    ? MATCH_REASON_LABELS[value as StatementLineMatchReason]
    : null;

export const matchKindLabel = (value: string | null | undefined) =>
  matchKindFrom(value) ?? "—";
export const matchReasonLabel = (value: string | null | undefined) =>
  reasonFrom(value) ?? "";

export const settlementProviderLabel = (provider: string | null | undefined) =>
  provider === "give_do"
    ? "give.do"
    : provider === "razorpay"
      ? "Razorpay"
      : "Gateway";

/**
 * A guess at a credit's contribution channel from the bank's narration:
 * UPI for UPI credits, NEFT for NEFT, RTGS and IMPS transfers, cheque for
 * cheque clearing, cash for a cash deposit; UPI when nothing says.
 */
export function guessChannel(
  narration: string
): "cash" | "cheque" | "neft" | "upi" {
  const text = narration.toUpperCase();
  if (/\bUPI\b/.test(text)) {
    return "upi";
  }
  if (/\b(NEFT|RTGS|IMPS)\b/.test(text)) {
    return "neft";
  }
  if (/\b(CHQ|CHEQUE|CLG|CLEARING)\b/.test(text)) {
    return "cheque";
  }
  if (/\b(CASH|CSH)\b/.test(text)) {
    return "cash";
  }
  return "upi";
}
