/** Vendor payment statuses that allow recording/approving transactions. */
export const PAYABLE_STATUSES = new Set<string>([
  "approved",
  "partially_paid",
  "paid",
]);
