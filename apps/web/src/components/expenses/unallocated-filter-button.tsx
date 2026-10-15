import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { useCanChangeCharge } from "@/components/expenses/charged-to-card";
import {
  type ChargedRequest,
  requestToClearValue,
  TO_CLEAR_FILTER,
} from "@/lib/request-programme";

/**
 * Finance's way into the legacy requests still on the Unallocated holding
 * programme: a count that filters the table to them. Hidden once none are
 * left, and from people who cannot change what a request is charged to.
 */
export function UnallocatedFilterButton({
  rows,
}: {
  rows: readonly ChargedRequest[];
}) {
  const canChange = useCanChangeCharge();
  const { setQuery } = useDataTableFilters();
  // The same rule as the "To clear" filter it applies, so the count and the
  // filtered rows always agree.
  const count = rows.filter((row) => requestToClearValue(row) !== null).length;
  const showUnallocated = useEventCallback(() =>
    setQuery(
      createFilterQuery([
        createFilterRule({
          id: "to-clear",
          operator: "is",
          path: [TO_CLEAR_FILTER.path],
          value: TO_CLEAR_FILTER.value,
        }),
      ])
    )
  );

  if (!canChange || count === 0) {
    return null;
  }
  return (
    <Button onClick={showUnallocated} size="sm" type="button" variant="outline">
      <HugeiconsIcon className="size-4" icon={FilterIcon} strokeWidth={2} />
      Unallocated · {count}
    </Button>
  );
}
