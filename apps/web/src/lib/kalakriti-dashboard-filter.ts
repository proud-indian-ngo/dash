import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type { FilterQuery } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";

export type DashboardFilterDestination =
  | "volunteers"
  | "food"
  | "transport"
  | "inventory"
  | "students";

const FILTERS = {
  volunteers: ["unassigned"],
  food: ["breakfast_pending", "lunch_pending"],
  transport: ["missing_vehicle"],
  inventory: ["out_of_stock"],
  students: ["without_entries", "participation_shortfall"],
} as const;

export function createDashboardFilterQuery(
  destination: DashboardFilterDestination,
  value: string,
  minimum?: number
): FilterQuery | null {
  if (!(FILTERS[destination] as readonly string[]).includes(value)) return null;
  const rule = (
    path: string,
    operator: string,
    ruleValue: unknown,
    id = path
  ) =>
    createFilterRule({
      id: `dashboard-${id}`,
      path: [path],
      operator,
      value: ruleValue,
    });
  switch (value) {
    case "unassigned":
      return createFilterQuery([
        rule("responsibilities", "has_any_of", ["unassigned"]),
      ]);
    case "breakfast_pending":
    case "lunch_pending":
      return createFilterQuery([
        rule(
          value === "breakfast_pending" ? "breakfast" : "lunch",
          "is",
          "Not served"
        ),
      ]);
    case "missing_vehicle":
      return createFilterQuery([rule("vehicleAssignment", "is", "missing")]);
    case "out_of_stock":
      return createFilterQuery([
        rule("status", "is", "Active"),
        rule("quantity", "eq", 0),
      ]);
    case "without_entries":
      return createFilterQuery([rule("entryCount", "eq", 0)]);
    case "participation_shortfall":
      return minimum === undefined
        ? null
        : createFilterQuery([rule("entryCount", "lt", minimum)]);
    default:
      return null;
  }
}

export function useDashboardDestinationFilter(
  destination: DashboardFilterDestination,
  minimum?: number
) {
  const [value, setValue] = useQueryState("dashboardFilter", parseAsString);
  const { setQuery } = useDataTableFilters();
  const consumed = useRef<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const valid =
    value !== null &&
    (FILTERS[destination] as readonly string[]).includes(value);
  const pending = valid && value !== failed;

  useEffect(() => {
    if (value === null) {
      consumed.current = null;
      setFailed(null);
      return;
    }
    if (value === failed) return;
    if (value === consumed.current) return;
    const query = createDashboardFilterQuery(destination, value, minimum);
    if (valid && !query) return;
    consumed.current = value;
    const consume = async () => {
      try {
        if (query) await setQuery(query);
        await setValue(null);
      } catch (error) {
        log.error({
          component: "useDashboardDestinationFilter",
          action: "applyDashboardFilter",
          destination,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Could not apply dashboard filter.");
        setFailed(value);
      }
    };
    void consume();
  }, [destination, failed, minimum, setQuery, setValue, valid, value]);

  return pending;
}
