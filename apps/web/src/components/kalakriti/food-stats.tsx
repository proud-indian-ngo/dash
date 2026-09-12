import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { getKalakritiFoodStatus } from "@pi-dash/zero/kalakriti-food-rules";
import { useEffect, useMemo, useState } from "react";

import type { FoodTableRow } from "./food-table";

export function countFoodPeople(rows: readonly FoodTableRow[]) {
  return rows.reduce(
    (counts, row) => {
      const status = getKalakritiFoodStatus(row);
      counts.registered += Number(
        row.kind === "student" || row.state === "active"
      );
      counts.eligible += Number(status.eligible);
      counts.breakfast += Number(status.breakfastServed);
      counts.lunch += Number(status.lunchServed);
      return counts;
    },
    { registered: 0, eligible: 0, breakfast: 0, lunch: 0 }
  );
}
export function FoodStats({
  data,
  complete,
  scopeKey,
}: {
  data: FoodTableRow[];
  complete: boolean;
  scopeKey: string;
}) {
  const current = useMemo(
    () => ({ scopeKey, counts: countFoodPeople(data) }),
    [data, scopeKey]
  );
  const [previous, setPrevious] = useState<typeof current>();
  useEffect(() => {
    if (complete) setPrevious(current);
  }, [complete, current]);
  const counts = complete
    ? current.counts
    : previous?.scopeKey === scopeKey
      ? previous.counts
      : undefined;
  return (
    <dl
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-label="Food counts"
    >
      {(
        [
          ["registered", "Registered people"],
          ["eligible", "Eligible for meals"],
          ["breakfast", "Breakfast served"],
          ["lunch", "Lunch served"],
        ] as const
      ).map(([key, label]) => (
        <div className="rounded-lg border p-4" key={key}>
          <dt className="text-muted-foreground text-sm">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold">
            {counts ? counts[key] : <Skeleton className="h-8 w-16" />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
