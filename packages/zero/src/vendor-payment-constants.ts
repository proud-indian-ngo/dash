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
