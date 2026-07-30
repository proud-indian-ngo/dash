import { Badge } from "@pi-dash/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { StatsCards } from "@/components/stats/stats-cards";
import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

function scopeHeading(
  scope: KalakritiRegistrationDashboardProjection["scope"]
) {
  if (scope.kind === "edition") {
    return {
      badge: "Edition-wide",
      description: "Complete registration totals for this edition.",
      title: "Edition overview",
    };
  }
  if (scope.kind === "center") {
    return {
      badge: "Center access",
      description: "Students and entries across the centers assigned to you.",
      title: "Your centers",
    };
  }
  if (scope.kind === "competition_category") {
    if (scope.competitionCategoryIds === null) {
      return {
        badge: "Overall events",
        description: "Entry totals across every competition category.",
        title: "All competition categories",
      };
    }
    return {
      badge: "Category access",
      description: "Entries across the competition categories assigned to you.",
      title: "Your competition categories",
    };
  }
  return {
    badge: "Competition access",
    description: "Entries across the individual competitions assigned to you.",
    title: "Your competitions",
  };
}

function competitionLabel(
  competition: KalakritiRegistrationDashboardProjection["competitions"][number]
) {
  let status = "";
  if (competition.cancelled) {
    status = " · Canceled";
  } else if (competition.retired) {
    status = " · Retired";
  }
  return `${competition.name} · ${competition.categoryName}${status}`;
}

function AggregateTable({
  caption,
  columns,
  description,
  rows,
  title,
}: {
  caption: string;
  columns: string[];
  description: string;
  rows: Array<Array<number | string>>;
  title: string;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
        </div>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/35 text-left text-muted-foreground">
            <tr>
              {columns.map((column, index) => (
                <th
                  className={
                    index === 0
                      ? "px-4 py-2.5 font-medium"
                      : "whitespace-nowrap px-4 py-2.5 text-right font-medium"
                  }
                  key={column}
                  scope="col"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr className="hover:bg-muted/20" key={String(row[0])}>
                {row.map((value, index) => {
                  const key = `${String(row[0])}-${columns[index]}`;
                  if (index === 0) {
                    return (
                      <th
                        className="px-4 py-3 text-left font-medium"
                        key={key}
                        scope="row"
                      >
                        {value}
                      </th>
                    );
                  }
                  return (
                    <td
                      className="whitespace-nowrap px-4 py-3 text-right tabular-nums"
                      key={key}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DashboardProjection({
  projection,
}: {
  projection: KalakritiRegistrationDashboardProjection;
}) {
  const heading = scopeHeading(projection.scope);
  const { capacity } = projection.totals;
  const canViewStudentLimits = projection.totals.studentLimit !== null;
  const competitionCategoryColumns = [
    "Competition Category",
    "Competitions",
    "Entries",
    "Participations",
    ...(capacity === null ? [] : ["Capacity"]),
  ];
  const competitionColumns = [
    "Competition",
    "Sessions",
    "Entries",
    "Participations",
    ...(capacity === null ? [] : ["Capacity"]),
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/15">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{heading.title}</CardTitle>
            <CardDescription className="mt-1">
              {heading.description}
            </CardDescription>
          </div>
          <Badge variant="outline">{heading.badge}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <StatsCards
          items={[
            {
              description: `${projection.totals.registeredStudents} with an Entry`,
              label: "Students",
              value: projection.totals.students,
            },
            { label: "Entries", value: projection.totals.entries },
            {
              description: "Individual students across Entries",
              label: "Participations",
              value: projection.totals.participants,
            },
            capacity === null
              ? {
                  description: "Across your assigned Centers",
                  label: "Student limit",
                  value: projection.totals.studentLimit ?? "Restricted",
                }
              : {
                  description: "Across active Competition Sessions",
                  label: "Entry capacity",
                  value: capacity,
                },
          ]}
        />

        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-base">Registration breakdown</h3>
            <p className="text-muted-foreground text-sm">
              Student registration and entry progress by group.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <AggregateTable
              caption={`${heading.title} by Center`}
              columns={[
                "Center",
                "Students",
                "Registered",
                "Entries",
                "Participations",
                ...(canViewStudentLimits ? ["Student limit"] : []),
              ]}
              description="Student totals for each visible center."
              rows={projection.centers.map((center) => [
                center.name,
                center.students,
                center.registeredStudents,
                center.entries,
                center.participants,
                ...(canViewStudentLimits ? [center.studentLimit] : []),
              ])}
              title="Centers"
            />
            <AggregateTable
              caption={`${heading.title} by Age Category`}
              columns={[
                "Age Category",
                "Students",
                "Registered",
                "Entries",
                "Participations",
                ...(capacity === null ? [] : ["Capacity"]),
              ]}
              description="Registration and participation by age category."
              rows={projection.ageCategories.map((age) => [
                age.name,
                age.students,
                age.registeredStudents,
                age.entries,
                age.participants,
                ...(capacity === null ? [] : [age.capacity ?? 0]),
              ])}
              title="Age categories"
            />
            {canViewStudentLimits ? (
              <AggregateTable
                caption={`${heading.title} student limits by Age Category`}
                columns={[
                  "Age Category",
                  "Female students",
                  "Female limit",
                  "Male students",
                  "Male limit",
                ]}
                description="Shared limits applied independently to every center."
                rows={projection.ageCategories.map((age) => [
                  age.name,
                  age.femaleStudents ?? 0,
                  age.femaleStudentLimit ?? 0,
                  age.maleStudents ?? 0,
                  age.maleStudentLimit ?? 0,
                ])}
                title="Student limits per center"
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-base">Competition breakdown</h3>
            <p className="text-muted-foreground text-sm">
              Entry volume across the competitions in your scope.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <AggregateTable
              caption={`${heading.title} by Competition Category`}
              columns={competitionCategoryColumns}
              description="A rollup of competitions and their entries."
              rows={projection.competitionCategories.map((category) => [
                category.name,
                category.competitions,
                category.entries,
                category.participants,
                ...(capacity === null ? [] : [category.capacity ?? 0]),
              ])}
              title="Competition categories"
            />
            <AggregateTable
              caption={`${heading.title} by Competition`}
              columns={competitionColumns}
              description="Session, entry, and participation totals."
              rows={projection.competitions.map((competition) => [
                competitionLabel(competition),
                competition.sessions,
                competition.entries,
                competition.participants,
                ...(capacity === null ? [] : [competition.capacity ?? 0]),
              ])}
              title="Competitions"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RegistrationDashboard({
  projections,
}: {
  projections: KalakritiRegistrationDashboardProjection[];
}) {
  if (projections.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="registration-dashboard-title" className="mt-6">
      <div className="mb-4">
        <h2
          className="font-display font-semibold text-2xl tracking-tight"
          id="registration-dashboard-title"
        >
          Registration dashboard
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Live registration totals, limited to the areas you can access.
        </p>
      </div>
      <div className="space-y-4">
        {projections.map((projection) => (
          <DashboardProjection
            key={JSON.stringify(projection.scope)}
            projection={projection}
          />
        ))}
      </div>
    </section>
  );
}
