import { Filters } from "@pi-dash/design-system/components/reui/filters/filters";
import type {
  FilterField,
  FilterQuery,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useState } from "react";

import { DATA_TABLE_FILTER_EDITORS } from "@/components/data-table/filter-date-editor";

export function DataTableFiltersBar({
  allowAdvanced = true,
  fields,
  onQueryChange,
  query,
}: {
  /** When false, hide chip kebab "Convert to advanced". Server-paginated chips only honor `is`. */
  allowAdvanced?: boolean;
  fields: FilterField[];
  onQueryChange: (query: FilterQuery) => void;
  query: FilterQuery;
}) {
  const [variant, setVariant] = useState<"advanced" | "basic">("basic");
  const handleQueryChange = useEventCallback((next: FilterQuery) => {
    onQueryChange(next);
  });
  const handleConvertToAdvanced = useEventCallback(() => {
    setVariant("advanced");
  });

  return (
    <Filters
      editors={DATA_TABLE_FILTER_EDITORS}
      fields={fields}
      onConvertToAdvanced={allowAdvanced ? handleConvertToAdvanced : undefined}
      onQueryChange={handleQueryChange}
      query={query}
      showClear
      size="sm"
      variant={allowAdvanced ? variant : "basic"}
    />
  );
}
