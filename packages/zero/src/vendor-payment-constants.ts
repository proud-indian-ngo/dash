/**
 * Vendor payment statuses that allow recording/approving transactions. A
 * payment is recorded only after the request is approved.
 */
export const PAYABLE_STATUSES = new Set<string>([
  "approved",
  "partially_paid",
  "paid",
]);

/** Statuses where invoice upload is allowed. */
export const INVOICE_UPLOADABLE_STATUSES = new Set<string>(["paid"]);

/** Statuses that should not be overwritten by recalculateParentStatus. */
export const INVOICE_LOCKED_STATUSES = new Set<string>([
  "invoice_pending",
  "completed",
]);

/**
 * Statuses past approval. A volunteer who raised a payment request in one of
 * these statuses may reveal the vendor's full bank account to pay it.
 */
export const PAST_APPROVAL_STATUSES = new Set<string>([
  ...PAYABLE_STATUSES,
  ...INVOICE_LOCKED_STATUSES,
]);
