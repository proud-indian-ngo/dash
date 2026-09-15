import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { CenterTransportFormDialog } from "@/components/kalakriti/center-transport-form-dialog";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import {
  TransportTable,
  type TransportRow,
} from "@/components/kalakriti/transport-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  canManageKalakritiTransport,
  canViewKalakritiTransport,
} from "@/lib/kalakriti-transport-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/transport")({
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiTransport(context.kalakritiEditionAccess))
      throw notFound();
  },
  component: KalakritiTransportPage,
});

function KalakritiTransportPage() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const zero = useZero();
  const [centers, result] = useQuery(
    queries.kalakritiTransport.centers({ editionId: edition.id })
  );
  const canManage = canManageKalakritiTransport(access);
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
        One row per vehicle. Pickup times are shown in your local time. Status
        follows finalized Center attendance scan stages and cannot be edited
        here.
      </p>
      <TransportTable
        centers={centers}
        complete={result.type === "complete"}
        scopeKey={scopeKey}
        canManage={canManage}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={deleteAction.trigger}
      />
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
    </div>
  );
}
