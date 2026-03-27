/**
 * Computes the derived vendor payment status based on approved transaction
 * amounts vs total line item amounts.
 *
 * Uses integer cents to avoid floating-point comparison issues.
 */
export function computePaymentStatus(
  approvedAmounts: readonly (number | string)[],
  lineItemAmounts: readonly (number | string)[]
): "approved" | "partially_paid" | "paid" {
  const toCents = (v: number | string) => Math.round(Number(v) * 100);

  const approvedTotalCents = approvedAmounts.reduce(
    (sum: number, a) => sum + toCents(a),
    0
  );
  const totalOwedCents = lineItemAmounts.reduce(
    (sum: number, a) => sum + toCents(a),
    0
  );

  if (approvedTotalCents <= 0) {
    return "approved";
  }
  if (approvedTotalCents >= totalOwedCents) {
    return "paid";
  }
  return "partially_paid";
}
