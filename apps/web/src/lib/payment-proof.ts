import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { todayInKolkata } from "@pi-dash/shared/income";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";

/**
 * The "Missing payment proof" filter on Reimbursements: approved
 * reimbursements, not void, with no payment screenshot. The books can't post
 * them (they wait with "No payment screenshot"), so this is the founder's
 * list to clear before the year closes (finance cutover section 6).
 */
export const MISSING_PROOF_FILTER = {
  label: "Payment proof",
  optionLabel: "Missing payment proof",
  path: "paymentProof",
  value: "missing",
} as const;

interface ProofFacts {
  approvalScreenshotKey?: null | string;
  reviewedAt?: null | number;
  status: null | string;
  type: string;
  voidedAt?: null | number;
}

/** Approved before the cutover: the books never post it. */
const approvedBeforeCutover = (reviewedAt: null | number | undefined) =>
  reviewedAt != null &&
  todayInKolkata(new Date(reviewedAt)) < LEDGER_CUTOVER_ON;

export function isMissingPaymentProof(row: ProofFacts): boolean {
  return (
    row.type === "reimbursement" &&
    row.status === "approved" &&
    !row.voidedAt &&
    !row.approvalScreenshotKey &&
    !approvedBeforeCutover(row.reviewedAt)
  );
}

/** The row's "Payment proof" filter value, or null. */
export function requestPaymentProofValue(row: ProofFacts): string | null {
  return isMissingPaymentProof(row) ? MISSING_PROOF_FILTER.value : null;
}

/** The filter query showing claims missing payment proof. */
export const missingProofQuery = () =>
  createFilterQuery([
    createFilterRule({
      id: "missing-payment-proof",
      operator: "is",
      path: [MISSING_PROOF_FILTER.path],
      value: MISSING_PROOF_FILTER.value,
    }),
  ]);
