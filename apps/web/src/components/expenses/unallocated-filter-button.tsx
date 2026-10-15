import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { isUnallocatedCharge } from "@pi-dash/shared/expense-charge";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { useCanChangeCharge } from "@/components/expenses/charged-to-card";
import type { ChargedRequest } from "@/lib/request-programme";

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
  const count = rows.filter(isUnallocatedCharge).length;
  const showUnallocated = useEventCallback(() =>
    setQuery(
      createFilterQuery([
        createFilterRule({
          id: "unallocated",
          operator: "is",
          path: ["programme"],
          value: PROGRAMME_IDS.unallocated,
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
