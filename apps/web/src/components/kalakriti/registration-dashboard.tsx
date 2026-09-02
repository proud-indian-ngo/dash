import { Badge } from "@pi-dash/design-system/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";

import { StatsCards } from "@/components/stats/stats-cards";
import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

function scopeHeading(
  scope: KalakritiRegistrationDashboardProjection["scope"]
) {
  if (scope.kind === "edition") {
    return {
      badge: "Edition-wide",
      title: "Edition overview",
    };
  }
  if (scope.kind === "center") {
    return {
      badge: "Center access",
      title: "Your centers",
    };
  }
  if (scope.kind === "competition_category") {
    if (scope.competitionCategoryIds === null) {
      return {
        badge: "Overall events",
        title: "All competition categories",
      };
    }
    return {
      badge: "Category access",
      title: "Your competition categories",
    };
  }
  return {
    badge: "Competition access",
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
    <section className="bg-card ring-foreground/15 overflow-hidden ring-1">
      <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
        <div>
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        </div>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/35 text-muted-foreground text-left">
            <tr>
              {columns.map((column, index) => (
                <th
                  className={
                    index === 0
                      ? "px-4 py-2.5 font-medium"
                      : "px-4 py-2.5 text-right font-medium whitespace-nowrap"
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
                      className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
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
  const isCenterScoped = projection.scope.kind === "center";
  const canViewStudentLimits = projection.totals.studentLimit !== null;
  const studentDescriptionParts = [
    `${projection.totals.registeredStudents} with an Entry`,
  ];
  if (canViewStudentLimits && !isCenterScoped) {
    studentDescriptionParts.push(
      `Limit ${projection.totals.students} / ${projection.totals.studentLimit}`
    );
  }
  const showStudentLimitCard = canViewStudentLimits && isCenterScoped;
  let defaultTab = "competitions";
  if (projection.centers.length > 0) {
    defaultTab = "centers";
  } else if (projection.ageCategories.length > 0) {
    defaultTab = "age";
  }

  return (
    <section
      aria-labelledby="registration-dashboard-title"
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-display text-lg font-semibold tracking-tight"
          id="registration-dashboard-title"
        >
          {heading.title}
        </h2>
        <Badge variant="outline">{heading.badge}</Badge>
      </div>
      <StatsCards
        items={[
          {
            description: studentDescriptionParts.join(" · "),
            label: "Students",
            value: projection.totals.students,
          },
          { label: "Entries", value: projection.totals.entries },
          {
            description: "Individual students across Entries",
            label: "Participations",
            value: projection.totals.participants,
          },
          ...(showStudentLimitCard
            ? [
                {
                  description: "Across your assigned Centers",
                  label: "Student limit",
                  value: projection.totals.studentLimit ?? 0,
                },
              ]
            : []),
        ]}
      />

      <Tabs className="gap-4" defaultValue={defaultTab}>
        <TabsList className="h-10 min-h-10" variant="line">
          {projection.centers.length > 0 ? (
            <TabsTrigger className="px-3" value="centers">
              Centers
            </TabsTrigger>
          ) : null}
          {projection.ageCategories.length > 0 ? (
            <TabsTrigger className="px-3" value="age">
              Age categories
            </TabsTrigger>
          ) : null}
          {projection.competitionCategories.length > 0 ||
          projection.competitions.length > 0 ? (
            <TabsTrigger className="px-3" value="competitions">
              Competitions
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent
          className="space-y-4 motion-reduce:animate-none"
          value="centers"
        >
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
        </TabsContent>
        <TabsContent
          className="space-y-4 motion-reduce:animate-none"
          value="age"
        >
          <AggregateTable
            caption={`${heading.title} by Age Category`}
            columns={[
              "Age Category",
              "Students",
              "Registered",
              "Entries",
              "Participations",
            ]}
            description="Registration and participation by age category."
            rows={projection.ageCategories.map((age) => [
              age.name,
              age.students,
              age.registeredStudents,
              age.entries,
              age.participants,
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
        </TabsContent>
        <TabsContent
          className="space-y-4 motion-reduce:animate-none"
          value="competitions"
        >
          <AggregateTable
            caption={`${heading.title} by Competition Category`}
            columns={[
              "Competition Category",
              "Competitions",
              "Entries",
              "Participations",
            ]}
            description="A rollup of competitions and their entries."
            rows={projection.competitionCategories.map((category) => [
              category.name,
              category.competitions,
              category.entries,
              category.participants,
            ])}
            title="Competition categories"
          />
          <AggregateTable
            caption={`${heading.title} by Competition`}
            columns={["Competition", "Sessions", "Entries", "Participations"]}
            description="Session, entry, and participation totals."
            rows={projection.competitions.map((competition) => [
              competitionLabel(competition),
              competition.sessions,
              competition.entries,
              competition.participants,
            ])}
            title="Competitions"
          />
        </TabsContent>
      </Tabs>
    </section>
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
    <div className="space-y-8">
      {projections.map((projection) => (
        <DashboardProjection
          key={JSON.stringify(projection.scope)}
          projection={projection}
        />
      ))}
    </div>
  );
}
