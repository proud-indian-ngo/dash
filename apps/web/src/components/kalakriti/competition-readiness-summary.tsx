import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@pi-dash/design-system/components/reui/alert";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";
import { Link } from "@tanstack/react-router";

import { useApp } from "@/context/app-context";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getKalakritiCompetitionSummary } from "@/functions/kalakriti-dashboard-summary";
import { canViewKalakritiAttendees } from "@/lib/kalakriti-attendee-policy";
import { dashboardAccessKey } from "@/lib/kalakriti-dashboard";

import { SummaryMetricCards } from "./summary-metric-cards";
import { useResultSnapshot } from "./use-result-snapshot";

export function CompetitionReadinessSummary({
  access,
}: {
  access: KalakritiEditionAccess;
}) {
  const { user } = useApp();
  const { data, fresh, error, refresh } = useResultSnapshot(
    dashboardAccessKey(access, user.id),
    () =>
      getKalakritiCompetitionSummary({ data: { year: access.edition.year } })
  );
  if (data === null) return null;
  const metrics = new Map(data?.metrics.map((metric) => [metric.id, metric]));
  const published = metrics.get("published_results");
  return (
    <section
      aria-labelledby="competition-readiness-title"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-sm font-semibold" id="competition-readiness-title">
          Competition readiness
        </h2>
        <p className="text-muted-foreground text-xs">
          {data?.scopeLabel ?? "Authorized Competitions"}
        </p>
      </div>
      {error || (data && !fresh) ? (
        <Alert>
          <AlertTitle>
            {data
              ? "Showing the last complete summary"
              : "Readiness could not be loaded"}
          </AlertTitle>
          <AlertDescription>
            Refresh to check current Judge coverage and publication.
          </AlertDescription>
          <AlertAction>
            <Button onClick={() => void refresh()} variant="outline" size="sm">
              Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      <SummaryMetricCards
        metrics={(
          [
            ["competitions", "Active Competitions"],
            ["missing_divisions", "Without Divisions"],
            ["unscheduled_divisions", "Unscheduled Divisions"],
            ["missing_judges", "Competitions without Judges"],
          ] as const
        ).map(([id, label]) => ({
          label,
          value: data ? (metrics.get(id)?.value ?? "Unavailable") : undefined,
        }))}
      />
      {published && published.total !== undefined && published.total > 0 ? (
        <Progress
          value={published.value}
          max={published.total}
          aria-valuetext={`${published.value} of ${published.total} Divisions`}
        >
          <ProgressLabel>Published results</ProgressLabel>
          <span className="ml-auto text-xs tabular-nums">
            {published.value} / {published.total}
          </span>
        </Progress>
      ) : null}
      {data && canViewKalakritiAttendees(access, "judge") ? (
        <Button
          nativeButton={false}
          render={
            <Link
              to="/kalakriti/$year/judges"
              params={{ year: String(access.edition.year) }}
            />
          }
          variant="outline"
          className="min-h-10 self-start max-sm:min-h-11"
        >
          Review Judges
        </Button>
      ) : null}
    </section>
  );
}
