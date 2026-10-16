import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { useApp } from "@/context/app-context";
import { isMissingPaymentProof, missingProofQuery } from "@/lib/payment-proof";
import type { RequestRow } from "@/lib/reimbursement-types";

/**
 * The founder's list of approved claims the books can't post for want of a
 * payment screenshot: a count that filters the table to them. Shown to
 * those who can add the proof, and hidden once none are left.
 */
export function MissingProofFilterButton({
  rows,
}: {
  rows: readonly RequestRow[];
}) {
  const { hasPermission } = useApp();
  const { setQuery } = useDataTableFilters();
  // The same rule as the filter it applies, so the count and rows agree.
  const count = rows.filter(isMissingPaymentProof).length;
  const showMissing = useEventCallback(() => setQuery(missingProofQuery()));

  if (!hasPermission("requests.approve") || count === 0) {
    return null;
  }
  return (
    <Button onClick={showMissing} size="sm" type="button" variant="outline">
      <HugeiconsIcon className="size-4" icon={FilterIcon} strokeWidth={2} />
      Missing payment proof · {count}
    </Button>
  );
}
