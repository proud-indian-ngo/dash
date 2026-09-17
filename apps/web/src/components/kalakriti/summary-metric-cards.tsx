import { Button } from "@pi-dash/design-system/components/ui/button";
import { Card, CardContent } from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";

const accents = [
  "border-t-brand",
  "border-t-info",
  "border-t-success",
  "border-t-warning",
] as const;

export function SummaryMetricCards({
  metrics,
  label,
}: {
  metrics: readonly {
    label: string;
    value: number | string | undefined;
    onClick?: () => void;
    actionLabel?: string;
    description?: string;
  }[];
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]"
    >
      {metrics.map((metric, index) => (
        <Card
          className={`bg-card min-w-0 border-t-2 ${accents[index % accents.length]}`}
          key={metric.label}
          size="sm"
        >
          <CardContent>
            <dl className="flex h-full flex-col gap-1">
              <dt className="text-muted-foreground text-xs">{metric.label}</dt>
              <dd className="font-display flex min-h-11 items-center text-2xl font-semibold tabular-nums sm:min-h-10">
                {metric.value === undefined ? (
                  <Skeleton className="h-7 w-16" />
                ) : metric.onClick ? (
                  <Button
                    aria-label={
                      metric.actionLabel ?? `Show ${metric.label.toLowerCase()}`
                    }
                    className="-ml-2 min-h-11 min-w-11 px-2 text-2xl font-semibold tabular-nums sm:min-h-10"
                    onClick={metric.onClick}
                    type="button"
                    variant="link"
                  >
                    {typeof metric.value === "number"
                      ? metric.value.toLocaleString("en-IN")
                      : metric.value}
                  </Button>
                ) : typeof metric.value === "number" ? (
                  metric.value.toLocaleString("en-IN")
                ) : (
                  metric.value
                )}
              </dd>
              {metric.description ? (
                <dd className="text-muted-foreground text-xs">
                  {metric.description}
                </dd>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
