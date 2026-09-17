import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";
import {
  KALAKRITI_CENTER_SCAN_STAGES,
  type KalakritiCenterScanStage,
} from "@pi-dash/shared/kalakriti";

import type { KalakritiDashboardSection } from "@/lib/server/kalakriti-dashboard-summary";

const stageLabels: Record<KalakritiCenterScanStage, string> = {
  pickup: "Picked up",
  venue_arrival: "Arrived at venue",
  venue_departure: "Departed venue",
  drop_off: "Dropped off",
};
const numberFormatter = new Intl.NumberFormat("en-IN");

function CompletionBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">No eligible records</span>
      </div>
    );
  }
  return (
    <Progress
      value={Math.min(value, total)}
      max={total}
      aria-valuetext={`${value} of ${total}`}
    >
      <ProgressLabel>{label}</ProgressLabel>
      <span className="ml-auto text-xs tabular-nums">
        {numberFormatter.format(value)} / {numberFormatter.format(total)}
      </span>
    </Progress>
  );
}

export function DashboardSectionMetrics({
  section,
}: {
  section: KalakritiDashboardSection;
}) {
  const metrics = new Map(section.metrics.map((metric) => [metric.id, metric]));
  const isTransport = section.id === "transport";
  const completionMetrics = section.metrics.filter(
    (metric) => metric.total !== undefined
  );
  const numericMetrics = section.metrics.filter(
    (metric) =>
      metric.total === undefined &&
      !(
        isTransport &&
        KALAKRITI_CENTER_SCAN_STAGES.some((stage) => stage === metric.id)
      )
  );
  const centers = metrics.get("centers")?.value ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {numericMetrics.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {numericMetrics.map((metric) => (
            <div key={metric.id} className="flex flex-col gap-1">
              <dt className="text-muted-foreground text-xs">{metric.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {numberFormatter.format(metric.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {completionMetrics.length ? (
        <div className="grid gap-3">
          {completionMetrics.map((metric) => (
            <CompletionBar
              key={metric.id}
              label={metric.label}
              value={metric.value}
              total={metric.total ?? 0}
            />
          ))}
        </div>
      ) : null}
      {isTransport ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Finalized stages across active Centers. A Center can complete each
            stage.
          </p>
          {centers === 0 ? (
            <p className="text-muted-foreground text-xs">No active Centers</p>
          ) : (
            <ol
              aria-label="Transport stages"
              className="grid gap-3 sm:grid-cols-2"
            >
              {KALAKRITI_CENTER_SCAN_STAGES.map((stage, index) => (
                <li key={stage}>
                  <CompletionBar
                    label={`${index + 1}. ${stageLabels[stage]}`}
                    value={metrics.get(stage)?.value ?? 0}
                    total={centers}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
