import { KALAKRITI_MEAL_STATUS_LABELS } from "@pi-dash/shared/kalakriti";
import { getKalakritiFoodStatus } from "@pi-dash/zero/kalakriti-food-rules";
import { useEffect, useMemo, useState } from "react";

import type { FoodTableRow } from "./food-table";

export interface EligibleFoodRow extends FoodTableRow {
  breakfast: "Served" | "Not served";
  lunch: "Served" | "Not served";
}
interface FoodRosterSnapshot {
  scopeKey: string;
  rows: EligibleFoodRow[];
}
export function projectEligibleFoodRows(
  data: readonly FoodTableRow[]
): EligibleFoodRow[] {
  return data.flatMap((row) => {
    const status = getKalakritiFoodStatus(row);
    return status.eligible
      ? [
          {
            ...row,
            breakfast:
              KALAKRITI_MEAL_STATUS_LABELS[
                status.breakfastServed ? "served" : "not_served"
              ],
            lunch:
              KALAKRITI_MEAL_STATUS_LABELS[
                status.lunchServed ? "served" : "not_served"
              ],
          },
        ]
      : [];
  });
}
export function resolveFoodRosterSnapshot(
  previous: FoodRosterSnapshot | undefined,
  current: FoodRosterSnapshot,
  complete: boolean
): FoodRosterSnapshot | undefined {
  return complete
    ? current
    : previous?.scopeKey === current.scopeKey
      ? previous
      : undefined;
}
export function useEligibleFoodRoster(
  data: FoodTableRow[],
  scopeKey: string,
  complete: boolean
) {
  const current = useMemo(
    () => ({ scopeKey, rows: projectEligibleFoodRows(data) }),
    [data, scopeKey]
  );
  const [previous, setPrevious] = useState<FoodRosterSnapshot>();
  useEffect(() => {
    if (complete) setPrevious(current);
  }, [complete, current]);
  return resolveFoodRosterSnapshot(previous, current, complete);
}
