import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useId, useMemo, type ReactNode } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { CenterRegistrationChart } from "@/components/kalakriti/center-registration-chart";
import { ParticipationComplianceBadge } from "@/components/kalakriti/participation-compliance-badge";
import {
  buildParticipationCompliance,
  type ParticipationCompliance,
} from "@/lib/kalakriti-participation-compliance";
import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

import { KALAKRITI_SUMMARY_COLORS } from "./summary-colors";

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
  storageKey,
  title,
}: {
  caption: string;
  columns: string[];
  description: string;
  rows: Array<{ id: string; values: Array<ReactNode> }>;
  storageKey: string;
  title: string;
}) {
  const tableColumns = useMemo<DataGridColumnDef<(typeof rows)[number]>[]>(
    () =>
      columns.map((label, index) => ({
        id: `column-${index}`,
        accessorFn: (row) => {
          const value = row.values[index];
          return typeof value === "number" || typeof value === "string"
            ? value
            : "";
        },
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={label}
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span
            className={
              typeof row.original.values[index] === "number"
                ? "tabular-nums"
                : undefined
            }
          >
            {row.original.values[index]}
          </span>
        ),
        meta: {
          headerTitle: label,
          skeleton: <Skeleton className="h-5 w-24" />,
        },
        size: index === 0 ? 220 : 130,
      })),
    [columns]
  );
  const filterFields = useMemo<FilterField[]>(
    () =>
      columns.flatMap((label, index) =>
        label === "Winner" ||
        label === "Runner-up" ||
        label === "Participation compliance"
          ? []
          : [
              {
                id: `column-${index}`,
                label,
                type: index === 0 ? ("text" as const) : ("number" as const),
              },
            ]
      ),
    [columns]
  );
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-label={caption} className="grid gap-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        </div>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <DataTableWrapper
        columns={tableColumns}
        data={rows}
        getRowId={(row) => row.id}
        searchFn={(row, query) =>
          row.values
            .filter((value) => typeof value === "string")
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        }
        searchPlaceholder={`Search ${title.toLowerCase()}...`}
        searchQueryKey={`${storageKey}_search`}
        storageKey={storageKey}
        tableLayout={{ dense: true, columnsVisibility: true }}
        filter={{
          fields: filterFields,
          getValue: (row, path) => {
            const index = Number(path[0]?.replace("column-", ""));
            const value = row.values[index];
            return typeof value === "number" || typeof value === "string"
              ? value
              : undefined;
          },
          queryKey: `${storageKey}_filter`,
        }}
      />
    </section>
  );
}

function CompetitionAwards({
  competition,
  place,
}: {
  competition: KalakritiRegistrationDashboardProjection["competitions"][number];
  place: "winner" | "runnerUp";
}) {
  if (!competition.awards.length)
    return <span className="text-muted-foreground">Not published</span>;
  return (
    <ul className="grid gap-1">
      {competition.awards.map((award) => (
        <li key={award.divisionId}>
          <span className="text-muted-foreground">
            {award.ageCategoryName}:{" "}
          </span>
          {award[place]}
        </li>
      ))}
    </ul>
  );
}

function DashboardProjection({
  projection,
  complianceByCenter,
  complianceMinimum,
}: {
  projection: KalakritiRegistrationDashboardProjection;
  complianceByCenter: Map<string, ParticipationCompliance> | undefined;
  complianceMinimum: number | undefined;
}) {
  const heading = scopeHeading(projection.scope);
  const headingId = useId();
  const scopeKey =
    projection.scope.kind === "edition"
      ? "edition"
      : projection.scope.kind === "center"
        ? `center_${projection.scope.centerIds.join("_")}`
        : projection.scope.kind === "competition_category"
          ? `category_${projection.scope.competitionCategoryIds?.join("_") ?? "all"}`
          : `competition_${projection.scope.competitionIds.join("_")}`;
  const tableKey = (name: string) =>
    `kalakriti_registration_${scopeKey}_${name}_table_state_v1`;
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
  const hasBreakdown =
    projection.centers.length > 0 ||
    projection.ageCategories.length > 0 ||
    projection.competitionCategories.length > 0 ||
    projection.competitions.length > 0;
  let defaultTab = "competitions";
  if (projection.centers.length > 0) {
    defaultTab = "centers";
  } else if (projection.ageCategories.length > 0) {
    defaultTab = "age";
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <Card className={KALAKRITI_SUMMARY_COLORS.work} size="sm">
        <CardHeader>
          <CardTitle>
            <h2 id={headingId}>{heading.title}</h2>
          </CardTitle>
          <Badge variant="outline">{heading.badge}</Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Students</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {projection.totals.students}
              </dd>
              <p className="text-muted-foreground text-xs">
                {studentDescriptionParts.join(" · ")}
              </p>
            </div>
            <div>
              <dt className="text-muted-foreground">Entries</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {projection.totals.entries}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Participations</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {projection.totals.participants}
              </dd>
              <p className="text-muted-foreground text-xs">
                Individual students across Entries
              </p>
            </div>
            {showStudentLimitCard ? (
              <div>
                <dt className="text-muted-foreground">Student limit</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {projection.totals.studentLimit}
                </dd>
                <p className="text-muted-foreground text-xs">
                  Across your assigned Centers
                </p>
              </div>
            ) : null}
          </dl>
          {projection.centers.length > 0 ? (
            <>
              <Separator className="my-3" />
              <CenterRegistrationChart centers={projection.centers} />
            </>
          ) : null}
        </CardContent>
      </Card>
      {hasBreakdown ? (
        <Collapsible>
          <CollapsibleTrigger className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 w-full cursor-pointer items-center justify-between px-3 text-sm font-medium focus-visible:ring-2 sm:min-h-10">
            Registration breakdown <span aria-hidden="true">+</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-3 pt-3">
            <Separator />
            <Tabs className="gap-4" defaultValue={defaultTab}>
              <TabsList className="min-h-11 sm:min-h-10" variant="line">
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
                className="flex flex-col gap-4 motion-reduce:animate-none"
                value="centers"
              >
                <AggregateTable
                  caption={`${heading.title} by Center`}
                  storageKey={tableKey("centers")}
                  columns={[
                    "Center",
                    "Students",
                    "Registered",
                    "Entries",
                    "Participations",
                    ...(canViewStudentLimits ? ["Student limit"] : []),
                    ...(isCenterScoped ? ["Participation compliance"] : []),
                  ]}
                  description="Student totals for each visible center."
                  rows={projection.centers.map((center) => ({
                    id: center.id,
                    values: [
                      center.name,
                      center.students,
                      center.registeredStudents,
                      center.entries,
                      center.participants,
                      ...(canViewStudentLimits ? [center.studentLimit] : []),
                      ...(isCenterScoped
                        ? [
                            <ParticipationComplianceBadge
                              key={center.id}
                              compliance={
                                complianceByCenter &&
                                complianceMinimum !== undefined
                                  ? (complianceByCenter.get(center.id) ?? {
                                      issues: [],
                                      minimum: complianceMinimum,
                                      students: 0,
                                    })
                                  : undefined
                              }
                            />,
                          ]
                        : []),
                    ],
                  }))}
                  title="Centers"
                />
              </TabsContent>
              <TabsContent
                className="flex flex-col gap-4 motion-reduce:animate-none"
                value="age"
              >
                <AggregateTable
                  caption={`${heading.title} by Age Category`}
                  storageKey={tableKey("age")}
                  columns={[
                    "Age Category",
                    "Students",
                    "Registered",
                    "Entries",
                    "Participations",
                  ]}
                  description="Registration and participation by age category."
                  rows={projection.ageCategories.map((age) => ({
                    id: age.id,
                    values: [
                      age.name,
                      age.students,
                      age.registeredStudents,
                      age.entries,
                      age.participants,
                    ],
                  }))}
                  title="Age categories"
                />
                {canViewStudentLimits ? (
                  <AggregateTable
                    caption={`${heading.title} student limits by Age Category`}
                    storageKey={tableKey("age_limits")}
                    columns={[
                      "Age Category",
                      "Female students",
                      "Female limit",
                      "Male students",
                      "Male limit",
                    ]}
                    description="Shared limits applied independently to every center."
                    rows={projection.ageCategories.map((age) => ({
                      id: age.id,
                      values: [
                        age.name,
                        age.femaleStudents ?? 0,
                        age.femaleStudentLimit ?? 0,
                        age.maleStudents ?? 0,
                        age.maleStudentLimit ?? 0,
                      ],
                    }))}
                    title="Student limits per center"
                  />
                ) : null}
              </TabsContent>
              <TabsContent
                className="flex flex-col gap-4 motion-reduce:animate-none"
                value="competitions"
              >
                <AggregateTable
                  caption={`${heading.title} by Competition Category`}
                  storageKey={tableKey("categories")}
                  columns={[
                    "Competition Category",
                    "Competitions",
                    "Entries",
                    "Participations",
                  ]}
                  description="A rollup of competitions and their entries."
                  rows={projection.competitionCategories.map((category) => ({
                    id: category.id,
                    values: [
                      category.name,
                      category.competitions,
                      category.entries,
                      category.participants,
                    ],
                  }))}
                  title="Competition categories"
                />
                <AggregateTable
                  caption={`${heading.title} by Competition`}
                  storageKey={tableKey("competitions")}
                  columns={[
                    "Competition",
                    "Entries",
                    "Participations",
                    "Winner",
                    "Runner-up",
                  ]}
                  description="Entry and participation totals, with published winning Centers by age division."
                  rows={projection.competitions.map((competition) => ({
                    id: competition.id,
                    values: [
                      competitionLabel(competition),
                      competition.entries,
                      competition.participants,
                      <CompetitionAwards
                        key="winner"
                        competition={competition}
                        place="winner"
                      />,
                      <CompetitionAwards
                        key="runner-up"
                        competition={competition}
                        place="runnerUp"
                      />,
                    ],
                  }))}
                  title="Competitions"
                />
              </TabsContent>
            </Tabs>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  );
}

export function RegistrationDashboard({
  projections,
  editionId,
  year,
}: {
  projections: KalakritiRegistrationDashboardProjection[];
  editionId: string;
  year: number;
}) {
  const hasCenterScope = projections.some(
    (projection) => projection.scope.kind === "center"
  );
  const [students, studentResult] = useQuery(
    queries.kalakritiStudent.visibleForCompliance({ editionId }),
    { enabled: hasCenterScope }
  );
  const [edition] = useQuery(queries.kalakritiEdition.byYear({ year }), {
    enabled: hasCenterScope,
  });
  const minimum = edition?.minTotalCompetitions ?? undefined;
  const complianceByCenter =
    minimum === undefined ||
    (students.length === 0 && studentResult.type !== "complete")
      ? undefined
      : buildParticipationCompliance(students, minimum);
  if (projections.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-5">
      {projections.map((projection) => (
        <DashboardProjection
          key={JSON.stringify(projection.scope)}
          projection={projection}
          complianceByCenter={complianceByCenter}
          complianceMinimum={minimum}
        />
      ))}
    </div>
  );
}
