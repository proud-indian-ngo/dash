import { LEDGER_ACCOUNT_HEAD_IDS } from "./constants";
import { formatPaise } from "./money";

/**
 * Provisions a vendor invoice can clear (finance layer 3-3a). The CA
 * provides for a cost at year end (the audit fee, under `Audit fees
 * payable`) and it is paid the next year, usually as a vendor payment to
 * the auditor. Finance charges that invoice's line to the provision instead
 * of its expense category's head: the payment then clears the provision,
 * and only what is above it is expense, under the provision's own expense
 * head. A small fixed list, never a free choice of any liability.
 */
export const PROVISION_HEADS = [
  {
    /** Where the part above the outstanding provision goes. */
    excessHeadId: LEDGER_ACCOUNT_HEAD_IDS.auditFees,
    excessLabel: "Audit fees",
    id: LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable,
    /** The picker's option. */
    label: "Audit fees payable (provision)",
    /** The head's name in the books. */
    name: "Audit fees payable",
  },
] as const;

export type ProvisionHead = (typeof PROVISION_HEADS)[number];

/** The provision head with this ID, or null for any other head. */
export function provisionHeadOf(
  id: string | null | undefined
): ProvisionHead | null {
  return PROVISION_HEADS.find((h) => h.id === id) ?? null;
}

/** "FY 2025-26" or "FY 2025-26 and FY 2026-27". */
function yearsText(years: readonly string[]): string {
  const labels = years.map((y) => `FY ${y}`);
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** "₹7,500.00 outstanding from FY 2025-26", or "Nothing outstanding". */
export function provisionOutstandingText(outstanding: {
  paise: number;
  years: readonly string[];
}): string {
  if (outstanding.paise <= 0) {
    return "Nothing outstanding";
  }
  const from = yearsText(outstanding.years);
  return `${formatPaise(outstanding.paise)} outstanding${from ? ` from ${from}` : ""}`;
}
