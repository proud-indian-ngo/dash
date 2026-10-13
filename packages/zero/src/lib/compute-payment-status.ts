import { sumPaise } from "@pi-dash/shared/money";

/**
 * Computes the derived vendor payment status based on approved transaction
 * amounts vs total line item amounts, both in integer paise.
 */
export function computePaymentStatus(
  approvedAmountsPaise: readonly number[],
  lineItemAmountsPaise: readonly number[]
): "approved" | "partially_paid" | "paid" {
  const approvedTotal = sumPaise(approvedAmountsPaise);
  const totalOwed = sumPaise(lineItemAmountsPaise);

  if (approvedTotal <= 0) {
    return "approved";
  }
  if (approvedTotal >= totalOwed) {
    return "paid";
  }
  return "partially_paid";
}
