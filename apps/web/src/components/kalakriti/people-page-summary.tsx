import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";

import { SummaryMetricCards } from "./summary-metric-cards";

interface Measure {
  label: string;
  value: number | undefined;
  onClick?: () => void;
}

export function PeoplePageSummary({
  title,
  scope,
  measures,
  completion,
}: {
  title: string;
  scope: string;
  measures: readonly Measure[];
  completion?: { label: string; value: number; total: number };
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <header className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">{scope}</p>
      </header>
      <SummaryMetricCards
        metrics={measures.map((measure) => ({
          ...measure,
          actionLabel: `Show ${measure.label.toLowerCase()} in table`,
        }))}
      />
      {completion ? (
        completion.total > 0 ? (
          <Progress
            aria-valuetext={`${completion.value} of ${completion.total}`}
            max={completion.total}
            value={Math.min(completion.value, completion.total)}
          >
            <ProgressLabel>{completion.label}</ProgressLabel>
            <span className="ml-auto text-xs tabular-nums">
              {completion.value} / {completion.total}
            </span>
          </Progress>
        ) : (
          <p className="text-muted-foreground text-xs">
            {completion.label}: no eligible records
          </p>
        )
      ) : null}
    </section>
  );
}
