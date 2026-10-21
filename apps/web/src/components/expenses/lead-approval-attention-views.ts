import type { DataTableAttentionView } from "@/components/data-table/data-table-view-tabs";
import { useApp } from "@/context/app-context";
import { authClient } from "@/lib/auth-client";
import {
  APPROVAL_FILTER,
  type ApprovalFilterValue,
  type LeadApprovalRequest,
  requestApprovalValue,
} from "@/lib/lead-approval";

/**
 * Shortcuts beside the status tabs ("Approval policy"): "Waiting for you"
 * for a programme lead, "Waiting for lead" for finance, so finance can tell
 * requests still with the lead from those ready for them. Each is hidden
 * while its count is 0.
 */
export function useLeadApprovalAttentionViews(
  rows: readonly LeadApprovalRequest[]
): DataTableAttentionView[] {
  const { hasPermission } = useApp();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const view = (
    value: ApprovalFilterValue,
    label: string
  ): DataTableAttentionView => ({
    // The same rule as the "Approval" filter it applies.
    count: rows.filter((row) => requestApprovalValue(row, userId) === value)
      .length,
    id: `approval-${value}`,
    label,
    rule: { path: APPROVAL_FILTER.path, value },
  });
  return [
    view("you", "Waiting for you"),
    ...(hasPermission("requests.approve")
      ? [view("lead", "Waiting for lead")]
      : []),
  ];
}
