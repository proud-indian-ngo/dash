import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@pi-dash/design-system/components/reui/alert";
import { Button } from "@pi-dash/design-system/components/ui/button";

import { SummaryMetricCards } from "./summary-metric-cards";

export interface CompetitionPageMetric {
  label: string;
  value: number;
  onClick?: () => void;
}

export function CompetitionPageSummary({
  description = "All authorized records",
  error,
  isLoading,
  metrics,
  onRetry,
  title,
}: {
  description?: string;
  error?: boolean;
  isLoading: boolean;
  metrics: CompetitionPageMetric[];
  onRetry?: () => void;
  title: string;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{title} could not be loaded</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
        </AlertDescription>
        {onRetry ? (
          <AlertAction>
            <Button onClick={onRetry} size="sm" variant="outline">
              Retry
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    );
  }
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <header className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </header>
      <SummaryMetricCards
        metrics={metrics.map((metric) => ({
          ...metric,
          value: isLoading ? undefined : metric.value,
        }))}
      />
    </section>
  );
}
