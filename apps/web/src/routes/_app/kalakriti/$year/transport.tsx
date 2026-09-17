import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

import { CenterTransportFormDialog } from "@/components/kalakriti/center-transport-form-dialog";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ScanDialog } from "@/components/kalakriti/scan-dialog";
import { TransportStats } from "@/components/kalakriti/transport-stats";
import {
  TransportTable,
  type TransportRow,
} from "@/components/kalakriti/transport-table";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDashboardDestinationFilter } from "@/lib/kalakriti-dashboard-filter";
import { getKalakritiScanActivities } from "@/lib/kalakriti-event-day-policy";
import {
  canManageKalakritiTransport,
  canViewKalakritiTransport,
} from "@/lib/kalakriti-transport-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/transport")({
  validateSearch: z
    .object({ dashboardFilter: z.string().optional() })
    .passthrough(),
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiTransport(context.kalakritiEditionAccess))
      throw notFound();
  },
  component: KalakritiTransportPage,
});

function KalakritiTransportPage() {
  const dashboardFilterPending = useDashboardDestinationFilter("transport");
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [, setFilter] = useQueryState("dashboardFilter", parseAsString);
  const zero = useZero();
  const [centers, result] = useQuery(
    queries.kalakritiTransport.centers({ editionId: edition.id })
  );
  const canManage = canManageKalakritiTransport(access);
  const canScan =
    edition.lifecycle === "live" &&
    getKalakritiScanActivities(access).includes("transport");
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<TransportRow | null>(null);
  const onAdd = useEventCallback((row: TransportRow) =>
    setEditing({ ...row, assignment: null })
  );
  const onEdit = useEventCallback((row: TransportRow) => setEditing(row));
  const deleteAction = useConfirmAction<TransportRow>({
    mutationMeta: {
      entityId: (row) => row.assignment?.id ?? row.id,
      mutation: "kalakritiTransport.delete",
      successMsg: "Transport assignment deleted",
      errorMsg: "Failed to delete transport assignment",
    },
    onConfirm: (row) => {
      if (!row.assignment) throw new Error("No vehicle selected");
      return zero.mutate(
        mutators.kalakritiTransport.delete({
          assignmentId: row.assignment.id,
          editionId: edition.id,
          auditEntryId: uuidv7(),
          now: Date.now(),
        })
      ).server;
    },
  });
  const scopeKey = JSON.stringify([
    edition.id,
    access.isGlobalAdmin,
    access.membership,
  ]);
  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Transport"
      />
      <p className="text-muted-foreground text-sm">
        One row per vehicle, plus a row for each Center without a vehicle.
        Pickup times use your local time.
      </p>
      {canScan ? (
        <Button
          className="min-h-10 max-sm:min-h-11"
          onClick={() => setScanOpen(true)}
        >
          Scan transport
        </Button>
      ) : null}
      <TransportStats
        centers={centers}
        complete={result.type === "complete"}
        scopeKey={scopeKey}
        scopeLabel={canManage ? "All authorized Centers" : "Assigned Centers"}
        onReviewMissing={() => {
          void setFilter("missing_vehicle");
        }}
      />
      {dashboardFilterPending ? (
        <Loader />
      ) : (
        <TransportTable
          centers={centers}
          complete={result.type === "complete"}
          scopeKey={scopeKey}
          canManage={canManage}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={deleteAction.trigger}
        />
      )}
      {canManage && editing ? (
        <CenterTransportFormDialog
          key={`${editing.center.id}:${editing.assignment?.id ?? "new"}`}
          assignment={editing.assignment}
          centerId={editing.center.id}
          editionId={edition.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}
      {canManage ? (
        <ConfirmDialog
          title="Delete transport assignment?"
          description={`Delete ${deleteAction.payload?.assignment?.vehicleLabel ?? "this vehicle"}? Its history will be preserved.`}
          confirmLabel="Delete assignment"
          loadingLabel="Deleting..."
          loading={deleteAction.isLoading}
          open={deleteAction.isOpen}
          onConfirm={deleteAction.confirm}
          onOpenChange={(open) => {
            if (!open) deleteAction.cancel();
          }}
        />
      ) : null}
      {canScan && scanOpen ? (
        <ScanDialog
          editionId={edition.id}
          year={edition.year}
          activities={["transport"]}
          initialActivity="transport"
          onOpenChange={(open) => {
            if (!open) setScanOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
