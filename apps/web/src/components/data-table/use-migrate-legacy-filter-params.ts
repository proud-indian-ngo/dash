import {
  createFilterQuery,
  createFilterRule,
  isFilterQueryEmpty,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterNode,
  FilterQuery,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { getRefCurrent } from "@pi-dash/design-system/hooks/get-ref-current";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";

export interface LegacyFilterParamMapping {
  /** Maps an old value to what the filter compares today. */
  mapValue?: (value: string) => string;
  param: string;
  path: string;
}

export function buildLegacyFilterQuery(
  values: Record<string, string | null | undefined>,
  mappings: readonly LegacyFilterParamMapping[]
): FilterQuery | null {
  const rules: FilterNode[] = [];
  for (const mapping of mappings) {
    const value = values[mapping.param];
    if (!value) {
      continue;
    }
    rules.push(
      createFilterRule({
        id: `legacy-${mapping.param}`,
        operator: "is",
        path: [mapping.path],
        value: mapping.mapValue ? mapping.mapValue(value) : value,
      })
    );
  }
  if (rules.length === 0) {
    return null;
  }
  return createFilterQuery(rules);
}

export function useMigrateLegacyFilterParams(
  mappings: readonly LegacyFilterParamMapping[],
  queryKey?: string
) {
  const { query, setQuery } = useDataTableFilters(queryKey);
  const parsers: Record<string, typeof parseAsString> = {};
  for (const mapping of mappings) {
    parsers[mapping.param] = parseAsString;
  }
  const [paramValues, setParamValues] = useQueryStates(parsers);
  const migrated = useRef<boolean>(false);

  useEffect(() => {
    if (getRefCurrent(migrated)) {
      return;
    }
    if (!isFilterQueryEmpty(query)) {
      migrated.current = true;
      return;
    }

    const nextQuery = buildLegacyFilterQuery(paramValues, mappings);
    migrated.current = true;
    if (!nextQuery) {
      return;
    }

    const clear: Record<string, null> = {};
    for (const mapping of mappings) {
      clear[mapping.param] = null;
    }
    setQuery(nextQuery);
    setParamValues(clear);
  }, [mappings, paramValues, query, setParamValues, setQuery]);
}
