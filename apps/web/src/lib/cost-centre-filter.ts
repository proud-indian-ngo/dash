import type { FilterOption } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { LEGACY_CITY_COST_CENTRE_IDS } from "@pi-dash/shared/cost-centre";

import type { LegacyFilterParamMapping } from "@/components/data-table/use-migrate-legacy-filter-params";

/** The "City" filter's options: active cost centres only, by name. */
export function cityFilterOptions(
  active: readonly { id: string; name: string }[]
): FilterOption[] {
  return active.map((c) => ({ label: c.name, value: c.id }));
}

/**
 * The old `?city=bangalore` link still filters: its value becomes the cost
 * centre that replaced the city.
 */
export const LEGACY_CITY_FILTER_PARAM: LegacyFilterParamMapping = {
  mapValue: (value) => LEGACY_CITY_COST_CENTRE_IDS[value] ?? value,
  param: "city",
  path: "city",
};
