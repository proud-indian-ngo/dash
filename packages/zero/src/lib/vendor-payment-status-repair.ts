import { PAYABLE_STATUSES } from "../vendor-payment-constants";
import { computePaymentStatus } from "./compute-payment-status";

export interface VendorPaymentRepairInput {
  approvedTransactionAmountsPaise: readonly number[];
  invoiceNumber: string | null;
  invoiceRejectionReason: string | null;
  invoiceReviewedAt: Date | number | null;
  /**
   * Latest `invoice_submitted` or `invoice_updated` history entry. Submitting
   * or editing an invoice does not clear `invoiceReviewedAt`, so a review is
   * current only when it is no earlier than this.
   */
  latestInvoiceSubmittedAt: Date | number | null;
  lineItemAmountsPaise: readonly number[];
  status: string;
}

export type VendorPaymentReviewReason =
  /** Invoice data present but payments no longer cover the line items. */
  | "invoice_not_fully_paid"
  /** The invoice was resubmitted or edited after it was last approved. */
  | "invoice_review_stale"
  /** Rejected request that still holds approved payments. */
  | "rejected_with_payments";

export type VendorPaymentRepairPlan =
  | { kind: "ok" }
  /** Status is wrong and can be corrected from the request's data. */
  | { kind: "fix"; status: string }
  /** Pending request with approved payments; approve it in the app. */
  | { kind: "approve"; paymentStatus: string }
  /** Needs a person to decide; listed, never changed. */
  | {
      kind: "review";
      paymentStatus: string;
      reason: VendorPaymentReviewReason;
    };

const toTime = (value: Date | number): number =>
  typeof value === "number" ? value : value.getTime();

/**
 * Plans the status repair for one vendor payment. Before payments needed an
 * approved request, a request could be paid while still `pending`, and an
 * admin approval could drop a paid or invoiced request back to `approved`
 * (or reject one that was already paid). Used by `scripts/repair-vendor-payment-status.ts`.
 */
export function planVendorPaymentRepair(
  input: VendorPaymentRepairInput
): VendorPaymentRepairPlan {
  const paymentStatus = computePaymentStatus(
    input.approvedTransactionAmountsPaise,
    input.lineItemAmountsPaise
  );

  if (input.status === "pending") {
    return paymentStatus === "approved"
      ? { kind: "ok" }
      : { kind: "approve", paymentStatus };
  }
  if (input.status === "rejected") {
    // Money went out on a request that was later rejected; finance decides.
    return paymentStatus === "approved"
      ? { kind: "ok" }
      : { kind: "review", paymentStatus, reason: "rejected_with_payments" };
  }
  if (!PAYABLE_STATUSES.has(input.status)) {
    return { kind: "ok" };
  }

  // A rejected invoice keeps its number and returns the request to `paid`
  // until the owner resubmits, so only an unrejected invoice moves it on.
  const hasOpenInvoice = Boolean(
    input.invoiceNumber && !input.invoiceRejectionReason
  );
  if (hasOpenInvoice && paymentStatus !== "paid") {
    return { kind: "review", paymentStatus, reason: "invoice_not_fully_paid" };
  }

  let target: string = paymentStatus;
  if (hasOpenInvoice && input.invoiceReviewedAt) {
    // Only complete a request whose approval covers the current invoice.
    // Without a submission entry the review cannot be dated, so a person
    // checks it instead.
    const submittedAt = input.latestInvoiceSubmittedAt;
    if (
      submittedAt === null ||
      toTime(input.invoiceReviewedAt) < toTime(submittedAt)
    ) {
      return { kind: "review", paymentStatus, reason: "invoice_review_stale" };
    }
    target = "completed";
  } else if (hasOpenInvoice) {
    target = "invoice_pending";
  }
  return target === input.status
    ? { kind: "ok" }
    : { kind: "fix", status: target };
}
