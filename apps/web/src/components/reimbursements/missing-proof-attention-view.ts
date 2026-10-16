import type { DataTableAttentionView } from "@/components/data-table/data-table-view-tabs";
import { useApp } from "@/context/app-context";
import {
  isMissingPaymentProof,
  MISSING_PROOF_FILTER,
} from "@/lib/payment-proof";
import type { RequestRow } from "@/lib/reimbursement-types";

/**
 * The founder's list of approved claims the books can't post for want of a
 * payment screenshot: an attention view beside the status tabs that filters
 * the table to them. Shown to those who can add the proof, and hidden once
 * none are left.
 */
export function useMissingProofAttentionView(
  rows: readonly RequestRow[]
): DataTableAttentionView | null {
  const { hasPermission } = useApp();
  if (!hasPermission("requests.approve")) {
    return null;
  }
  return {
    // The same rule as the filter it applies, so the count and rows agree.
    count: rows.filter(isMissingPaymentProof).length,
    id: "missing-payment-proof",
    label: MISSING_PROOF_FILTER.optionLabel,
    rule: {
      path: MISSING_PROOF_FILTER.path,
      value: MISSING_PROOF_FILTER.value,
    },
  };
}
