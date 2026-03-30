/** Vendor payment statuses that allow recording/approving transactions. */
export const PAYABLE_STATUSES = new Set<string>([
  "approved",
  "partially_paid",
  "paid",
]);

/** Statuses where recording a payment transaction is allowed (includes pending). */
export const RECORDABLE_STATUSES = new Set<string>([
  "pending",
  ...PAYABLE_STATUSES,
]);

/** Statuses where invoice upload is allowed. */
export const INVOICE_UPLOADABLE_STATUSES = new Set<string>(["paid"]);

/** Statuses that should not be overwritten by recalculateParentStatus. */
export const INVOICE_LOCKED_STATUSES = new Set<string>([
  "invoice_pending",
  "completed",
]);
