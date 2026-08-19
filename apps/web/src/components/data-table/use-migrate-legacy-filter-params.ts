import {
  createFilterQuery,
  createFilterRule,
  isFilterQueryEmpty,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterNode,
  FilterQuery,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef } from "react";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";

export interface LegacyFilterParamMapping {
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
        value,
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
  const parsers = useMemo(() => {
    const next: Record<string, typeof parseAsString> = {};
    for (const mapping of mappings) {
      next[mapping.param] = parseAsString;
    }
    return next;
  }, [mappings]);
  const [paramValues, setParamValues] = useQueryStates(parsers);
  const migrated = useRef(false);

  useEffect(() => {
    if (migrated.current) {
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
