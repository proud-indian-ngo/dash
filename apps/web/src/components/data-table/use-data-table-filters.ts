import {
  createFilterQuery,
  isFilterQueryEmpty,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type { FilterQuery } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { parseAsJson, useQueryState } from "nuqs";

const EMPTY_FILTER_QUERY = createFilterQuery();

function parseFilterQuery(value: unknown): FilterQuery | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<FilterQuery>;
  if (candidate.type !== "group" || !Array.isArray(candidate.rules)) {
    return null;
  }
  return value as FilterQuery;
}

export function useDataTableFilters(queryKey = "filters") {
  const [query, setQueryState] = useQueryState(
    queryKey,
    parseAsJson(parseFilterQuery).withDefault(EMPTY_FILTER_QUERY)
  );

  const setQuery = (next: FilterQuery | null) => {
    if (next === null || isFilterQueryEmpty(next)) {
      return setQueryState(null);
    }
    return setQueryState(next);
  };

  return {
    isEmpty: isFilterQueryEmpty(query),
    query,
    setQuery,
  };
}
