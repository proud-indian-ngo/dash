import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";
import { getKalakritiFoodStatus } from "@pi-dash/zero/kalakriti-food-rules";
import { useEffect, useMemo, useState } from "react";

import type { FoodTableRow } from "./food-table";
import { SummaryMetricCards } from "./summary-metric-cards";

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
      if (status.eligible) {
        counts.eligibleBreakfast += Number(status.breakfastServed);
        counts.eligibleLunch += Number(status.lunchServed);
      }
      return counts;
    },
    {
      registered: 0,
      eligible: 0,
      breakfast: 0,
      lunch: 0,
      eligibleBreakfast: 0,
      eligibleLunch: 0,
    }
  );
}
export function FoodStats({
  data,
  complete,
  scopeKey,
  onReviewPending,
}: {
  data: FoodTableRow[];
  complete: boolean;
  scopeKey: string;
  onReviewPending?: (meal: "breakfast" | "lunch") => void;
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
  const pendingBreakfast = counts
    ? counts.eligible - counts.eligibleBreakfast
    : undefined;
  const pendingLunch = counts
    ? counts.eligible - counts.eligibleLunch
    : undefined;
  return (
    <section aria-labelledby="food-stats-title" className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold" id="food-stats-title">
          Meals in scope
        </h2>
        <p className="text-muted-foreground text-xs">All authorized people</p>
      </div>
      {!complete && counts ? (
        <p className="text-muted-foreground text-xs" role="status">
          Showing the last complete meal snapshot while updating.
        </p>
      ) : null}
      <SummaryMetricCards
        label="Food counts"
        metrics={[
          { label: "Registered people", value: counts?.registered },
          { label: "Eligible for meals", value: counts?.eligible },
          {
            label: "Awaiting breakfast",
            value: pendingBreakfast,
            onClick: onReviewPending
              ? () => onReviewPending("breakfast")
              : undefined,
            actionLabel: "Review Awaiting breakfast",
          },
          {
            label: "Awaiting lunch",
            value: pendingLunch,
            onClick: onReviewPending
              ? () => onReviewPending("lunch")
              : undefined,
            actionLabel: "Review Awaiting lunch",
          },
        ]}
      />
      {counts ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "Breakfast served to currently eligible people",
                counts.eligibleBreakfast,
              ],
              [
                "Lunch served to currently eligible people",
                counts.eligibleLunch,
              ],
            ] as const
          ).map(([label, served]) =>
            counts.eligible > 0 ? (
              <Progress
                key={label}
                value={served}
                max={counts.eligible}
                aria-valuetext={`${served} of ${counts.eligible}`}
              >
                <ProgressLabel>{label}</ProgressLabel>
                <span className="ml-auto text-xs tabular-nums">
                  {served} / {counts.eligible}
                </span>
              </Progress>
            ) : (
              <p className="text-muted-foreground text-xs" key={label}>
                {label}: no eligible people
              </p>
            )
          )}
        </div>
      ) : null}
      {counts ? (
        <p className="text-muted-foreground text-xs">
          Historical meals served, including people no longer eligible:
          breakfast {counts.breakfast}; lunch {counts.lunch}.
        </p>
      ) : null}
    </section>
  );
}
