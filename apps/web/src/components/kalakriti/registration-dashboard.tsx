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
      description: "Complete registration totals for this Edition.",
      title: "Edition registration",
    };
  }
  if (scope.kind === "center") {
    return {
      description:
        "Registration totals are limited to your assigned Centers. Edition-wide capacity is hidden.",
      title: "Center registration",
    };
  }
  if (scope.kind === "competition_category") {
    return {
      description:
        "Registration totals are limited to your assigned Competition Categories.",
      title: "Competition Category registration",
    };
  }
  return {
    description:
      "Registration totals are limited to your assigned Competitions.",
    title: "Competition registration",
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
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<number | string>>;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-160 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            {columns.map((column, index) => (
              <th
                className={
                  index === 0
                    ? "px-3 py-2 font-medium"
                    : "px-3 py-2 text-right font-medium"
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
            <tr key={String(row[0])}>
              {row.map((value, index) => {
                const key = `${String(row[0])}-${columns[index]}`;
                if (index === 0) {
                  return (
                    <th
                      className="px-3 py-2 text-left font-normal"
                      key={key}
                      scope="row"
                    >
                      {value}
                    </th>
                  );
                }
                return (
                  <td className="px-3 py-2 text-right" key={key}>
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardProjection({
  projection,
}: {
  projection: KalakritiRegistrationDashboardProjection;
}) {
  const heading = scopeHeading(projection.scope);
  const { capacity } = projection.totals;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading.title}</CardTitle>
        <CardDescription>{heading.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
                  description: "Configured for your Centers",
                  label: "Student quota",
                  value: projection.totals.quotaLimit ?? "Restricted",
                }
              : {
                  description: "Across active Competition Sessions",
                  label: "Entry capacity",
                  value: capacity,
                },
          ]}
        />

        <AggregateTable
          caption={`${heading.title} by Center`}
          columns={[
            "Center",
            "Students",
            "Registered",
            "Entries",
            "Participations",
            "Quota",
          ]}
          rows={projection.centers.map((center) => [
            center.name,
            center.students,
            center.registeredStudents,
            center.entries,
            center.participants,
            center.quotaLimit,
          ])}
        />
        <AggregateTable
          caption={`${heading.title} by Age Category`}
          columns={[
            "Age Category",
            "Students",
            "Registered",
            "Entries",
            "Participations",
            "Capacity",
          ]}
          rows={projection.ageCategories.map((age) => [
            age.name,
            age.students,
            age.registeredStudents,
            age.entries,
            age.participants,
            age.capacity ?? "Restricted",
          ])}
        />
        <AggregateTable
          caption={`${heading.title} by Competition Category`}
          columns={[
            "Competition Category",
            "Competitions",
            "Entries",
            "Participations",
            "Capacity",
          ]}
          rows={projection.competitionCategories.map((category) => [
            category.name,
            category.competitions,
            category.entries,
            category.participants,
            category.capacity ?? "Restricted",
          ])}
        />
        <AggregateTable
          caption={`${heading.title} by Competition`}
          columns={[
            "Competition",
            "Sessions",
            "Entries",
            "Participations",
            "Capacity",
          ]}
          rows={projection.competitions.map((competition) => [
            competitionLabel(competition),
            competition.sessions,
            competition.entries,
            competition.participants,
            competition.capacity ?? "Restricted",
          ])}
        />
        <AggregateTable
          caption={`${heading.title} quotas`}
          columns={[
            "Center and Age Category",
            "Female used",
            "Female limit",
            "Male used",
            "Male limit",
          ]}
          rows={projection.quotas.map((quota) => [
            `${quota.centerName} · ${quota.ageCategoryName}`,
            quota.femaleUsed,
            quota.femaleLimit,
            quota.maleUsed,
            quota.maleLimit,
          ])}
        />
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
          Private totals loaded with this page.
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
