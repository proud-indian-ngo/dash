import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";

import { FoodMealUndo } from "@/components/kalakriti/food-meal-undo";
import { FoodStats } from "@/components/kalakriti/food-stats";
import type { FoodTableRow } from "@/components/kalakriti/food-table";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import {
  canViewKalakritiFood,
  kalakritiFoodScopeKey,
} from "@/lib/kalakriti-food-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/food")({
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiFood(context.kalakritiEditionAccess)) throw notFound();
  },
  component: KalakritiFoodPage,
});

function KalakritiFoodPage() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [students, studentsResult] = useQuery(
    queries.kalakritiFood.students({ editionId: edition.id })
  );
  const [memberships, membershipsResult] = useQuery(
    queries.kalakritiFood.memberships({ editionId: edition.id })
  );
  const data = useMemo<FoodTableRow[]>(
    () => [
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
    [students, memberships]
  );
  const complete =
    studentsResult.type === "complete" && membershipsResult.type === "complete";
  const scopeKey = kalakritiFoodScopeKey(access);
  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Food"
      />
      <p className="text-muted-foreground text-sm">
        The table shows only people currently eligible for meals in your scope:
        picked-up Students, checked-in active Volunteers and active Guardians.
        Only Food staff and administrators can record meals using Scan. Counts
        cover your entire authorized roster, not the filtered table. Served
        totals include archived history and can exceed the number of table rows;
        archived people are excluded from Registered people and meal
        eligibility.
      </p>
      <FoodStats data={data} complete={complete} scopeKey={scopeKey} />
      <FoodMealUndo
        key={scopeKey}
        access={access}
        data={data}
        complete={complete}
        scopeKey={scopeKey}
      />
    </div>
  );
}
