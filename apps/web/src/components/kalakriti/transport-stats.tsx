import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";
import {
  KALAKRITI_CENTER_SCAN_STAGES,
  type KalakritiCenterScanStage,
} from "@pi-dash/shared/kalakriti";
import { useEffect, useMemo, useState } from "react";

import { SummaryMetricCards } from "./summary-metric-cards";
import type { TransportCenter } from "./transport-table";

const stageLabels: Record<KalakritiCenterScanStage, string> = {
  pickup: "Picked up",
  venue_arrival: "Arrived at venue",
  venue_departure: "Departed venue",
  drop_off: "Dropped off",
};

export function countTransport(centers: readonly TransportCenter[]) {
  const stages = Object.fromEntries(
    KALAKRITI_CENTER_SCAN_STAGES.map((stage) => [stage, 0])
  ) as Record<KalakritiCenterScanStage, number>;
  let missingVehicles = 0;
  let vehicles = 0;
  for (const center of centers) {
    vehicles += center.transportAssignments.length;
    missingVehicles += Number(center.transportAssignments.length === 0);
    for (const stage of center.scanStages ?? []) {
      if (stage.finalizedAt !== null) stages[stage.stage] += 1;
    }
  }
  return { centers: centers.length, missingVehicles, vehicles, stages };
}

export function TransportStats({
  centers,
  complete,
  scopeKey,
  scopeLabel,
  onReviewMissing,
}: {
  centers: readonly TransportCenter[];
  complete: boolean;
  scopeKey: string;
  scopeLabel: string;
  onReviewMissing: () => void;
}) {
  const current = useMemo(
    () => ({ scopeKey, counts: countTransport(centers) }),
    [centers, scopeKey]
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
    <section
      aria-labelledby="transport-stats-title"
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-sm font-semibold" id="transport-stats-title">
          Transport readiness
        </h2>
        <p className="text-muted-foreground text-xs">{scopeLabel}</p>
      </div>
      {!complete && counts ? (
        <p className="text-muted-foreground text-xs" role="status">
          Showing the last complete transport snapshot while updating.
        </p>
      ) : null}
      <SummaryMetricCards
        label="Transport counts"
        metrics={[
          { label: "Active Centers", value: counts?.centers },
          {
            label: "Without vehicles",
            value: counts?.missingVehicles,
            onClick: complete ? onReviewMissing : undefined,
            actionLabel: "Review Centers without vehicles",
          },
          { label: "Assigned vehicles", value: counts?.vehicles },
        ]}
      />
      {counts ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Finalized stages across active Centers. Each stage has its own
            count.
          </p>
          <ol
            className="grid gap-3 sm:grid-cols-2"
            aria-label="Finalized Center stages"
          >
            {KALAKRITI_CENTER_SCAN_STAGES.map((stage, index) => {
              const value = counts.stages[stage];
              return (
                <li key={stage}>
                  {counts.centers > 0 ? (
                    <Progress
                      value={value}
                      max={counts.centers}
                      aria-valuetext={`${value} of ${counts.centers}`}
                    >
                      <ProgressLabel>{`${index + 1}. ${stageLabels[stage]}`}</ProgressLabel>
                      <span className="ml-auto text-xs tabular-nums">
                        {value} / {counts.centers}
                      </span>
                    </Progress>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {stageLabels[stage]}: no active Centers
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
