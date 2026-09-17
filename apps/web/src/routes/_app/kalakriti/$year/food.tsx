import { Button } from "@pi-dash/design-system/components/ui/button";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { z } from "zod";

import { FoodMealUndo } from "@/components/kalakriti/food-meal-undo";
import { FoodStats } from "@/components/kalakriti/food-stats";
import type { FoodTableRow } from "@/components/kalakriti/food-table";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ScanDialog } from "@/components/kalakriti/scan-dialog";
import { useFoodAttendees } from "@/components/kalakriti/use-food-attendees";
import { Loader } from "@/components/loader";
import { useDashboardDestinationFilter } from "@/lib/kalakriti-dashboard-filter";
import { getKalakritiScanActivities } from "@/lib/kalakriti-event-day-policy";
import {
  canViewKalakritiFood,
  canViewKalakritiFoodAttendees,
  kalakritiFoodScopeKey,
} from "@/lib/kalakriti-food-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/food")({
  validateSearch: z
    .object({ dashboardFilter: z.string().optional() })
    .passthrough(),
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiFood(context.kalakritiEditionAccess)) throw notFound();
  },
  component: KalakritiFoodPage,
});

function KalakritiFoodPage() {
  const dashboardFilterPending = useDashboardDestinationFilter("food");
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [, setFilter] = useQueryState("dashboardFilter", parseAsString);
  const [scanOpen, setScanOpen] = useState(false);
  const canScan =
    edition.lifecycle === "live" &&
    getKalakritiScanActivities(access).includes("meals");
  const scopeKey = kalakritiFoodScopeKey(access);
  const attendees = useFoodAttendees(
    edition.year,
    scopeKey,
    canViewKalakritiFoodAttendees(access)
  );
  const [students, studentsResult] = useQuery(
    queries.kalakritiFood.students({ editionId: edition.id })
  );
  const [memberships, membershipsResult] = useQuery(
    queries.kalakritiFood.memberships({ editionId: edition.id })
  );
  const data = useMemo<FoodTableRow[]>(
    () => [
      ...attendees.rows,
      ...students.map((student): FoodTableRow => ({
        id: student.id,
        name: student.name,
        humanId: student.humanId,
        kind: "student",
        centers: student.center ? [student.center] : [],
        operations: student.operations,
      })),
      ...memberships.map((membership): FoodTableRow => ({
        id: membership.id,
        name: membership.snapshotName,
        humanId: membership.humanId,
        kind: membership.kind,
        state: membership.state ?? undefined,
        centers: [
          ...membership.assignments,
          ...membership.guardianCenters,
        ].flatMap((link) => (link.center ? [link.center] : [])),
        operations: membership.operations,
      })),
    ],
    [students, memberships, attendees.rows]
  );
  const complete =
    studentsResult.type === "complete" &&
    membershipsResult.type === "complete" &&
    attendees.complete;
  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Food"
      />
      <p className="text-muted-foreground text-sm">
        Review currently eligible people and meals awaiting service.
      </p>
      {canScan ? (
        <Button
          className="min-h-10 max-sm:min-h-11"
          onClick={() => setScanOpen(true)}
        >
          Serve meals
        </Button>
      ) : null}
      <FoodStats
        data={data}
        complete={complete}
        scopeKey={scopeKey}
        onReviewPending={
          complete
            ? (meal) => {
                void setFilter(`${meal}_pending`);
              }
            : undefined
        }
      />
      <details className="text-muted-foreground text-xs">
        <summary className="min-h-10 cursor-pointer py-2">
          How meal eligibility works
        </summary>
        <p className="max-w-3xl pb-2">
          The table includes picked-up Students, checked-in active Volunteers,
          Guests and Judges, and active Guardians in your scope. Historical
          served totals can include people who are no longer eligible. Archived
          people are excluded from registered and eligible counts. Meals can be
          recorded during a Live Edition by authorized staff.
        </p>
      </details>
      {dashboardFilterPending ? (
        <Loader />
      ) : (
        <FoodMealUndo
          key={scopeKey}
          access={access}
          data={data}
          complete={complete}
          scopeKey={scopeKey}
          onMealSettled={attendees.refresh}
        />
      )}
      {canScan && scanOpen ? (
        <ScanDialog
          editionId={edition.id}
          year={edition.year}
          activities={["meals"]}
          initialActivity="meals"
          onOpenChange={(open) => {
            if (!open) setScanOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
