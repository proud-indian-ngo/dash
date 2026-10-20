import type { DataTableAttentionView } from "@/components/data-table/data-table-view-tabs";
import { useCanChangeCharge } from "@/components/expenses/use-can-change-charge";
import {
  type ChargedRequest,
  requestToClearValue,
  TO_CLEAR_FILTER,
} from "@/lib/request-programme";

/**
 * Finance's way into the legacy requests still on the Unallocated holding
 * programme: an attention view beside the status tabs that filters the table
 * to them. Hidden once none are left, and from people who cannot change what
 * a request is charged to.
 */
export function useUnallocatedAttentionView(
  rows: readonly ChargedRequest[]
): DataTableAttentionView | null {
  const canChange = useCanChangeCharge();
  if (!canChange) {
    return null;
  }
  return {
    // The same rule as the "To clear" filter it applies, so the count and the
    // filtered rows always agree.
    count: rows.filter((row) => requestToClearValue(row) !== null).length,
    id: "to-clear",
    label: "Unallocated",
    rule: { path: TO_CLEAR_FILTER.path, value: TO_CLEAR_FILTER.value },
  };
}
