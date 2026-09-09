import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  KALAKRITI_TRANSPORT_STATUS_LABELS,
  type KalakritiTransportStatus,
} from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { CenterTransportFormDialog } from "@/components/kalakriti/center-transport-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export interface CenterTransportAssignment {
  capacity: number;
  driverName: string;
  driverPhone: string | null;
  id: string;
  notes: string | null;
  status: KalakritiTransportStatus;
  vehicleLabel: string;
}

function TransportStatusBadge({
  status,
}: {
  status: KalakritiTransportStatus;
}) {
  return (
    <Badge variant={status === "completed" ? "outline" : "secondary"}>
      {KALAKRITI_TRANSPORT_STATUS_LABELS[status]}
    </Badge>
  );
}

function TransportAssignmentCard({
  assignment,
  canManageTransport,
  isRetired,
  onDelete,
  onEdit,
}: {
  assignment: CenterTransportAssignment;
  canManageTransport: boolean;
  isRetired: boolean;
  onDelete: (assignment: CenterTransportAssignment) => void;
  onEdit: (assignment: CenterTransportAssignment) => void;
}) {
  const handleEditClick = useEventCallback(() => onEdit(assignment));
  const handleDeleteClick = useEventCallback(() => onDelete(assignment));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <h4 className="text-base font-medium">{assignment.vehicleLabel}</h4>
          <CardDescription>
            Driver: {assignment.driverName}
            {assignment.driverPhone ? ` · ${assignment.driverPhone}` : ""}
          </CardDescription>
        </div>
        <TransportStatusBadge status={assignment.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Capacity: {assignment.capacity}
          {assignment.notes ? ` · ${assignment.notes}` : ""}
        </p>
        {canManageTransport && !isRetired ? (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleEditClick}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Edit02Icon}
                strokeWidth={2}
              />
              Edit
            </Button>
            <Button
              onClick={handleDeleteClick}
              size="sm"
              type="button"
              variant="destructive"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Delete02Icon}
                strokeWidth={2}
              />
              Delete
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CenterTransportSection({
  assignments,
  canManageTransport,
  centerId,
  editionId,
  isRetired,
}: {
  assignments: readonly CenterTransportAssignment[];
  canManageTransport: boolean;
  centerId: string;
  editionId: string;
  isRetired: boolean;
}) {
  const zero = useZero();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<CenterTransportAssignment | null>(null);

  const handleAdd = useEventCallback(() => {
    setEditingAssignment(null);
    setDialogOpen(true);
  });

  const handleEdit = useEventCallback(
    (assignment: CenterTransportAssignment) => {
      setEditingAssignment(assignment);
      setDialogOpen(true);
    }
  );

  const deleteAction = useConfirmAction<CenterTransportAssignment>({
    mutationMeta: {
      entityId: (assignment) => assignment.id,
      mutation: "kalakritiTransport.delete",
      errorMsg: "Failed to delete transport assignment",
      successMsg: "Transport assignment deleted",
    },
    onConfirm: async (assignment) => {
      try {
        return await zero.mutate(
          mutators.kalakritiTransport.delete({
            assignmentId: assignment.id,
            editionId,
            auditEntryId: uuidv7(),
            now: Date.now(),
          })
        ).server;
      } catch (error) {
        log.error({
          component: "CenterTransportSection",
          action: "deleteTransportAssignment",
          editionId,
          centerId,
          assignmentId: assignment.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          type: "error",
          error: { message: "Failed to delete transport assignment" },
        };
      }
    },
  });

  if (!canManageTransport && assignments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-semibold">Transport</h3>
          <p className="text-muted-foreground text-sm">
            Buses and drivers for this Center.
          </p>
        </div>
        {canManageTransport && !isRetired ? (
          <Button onClick={handleAdd} size="sm" type="button" variant="outline">
            <HugeiconsIcon
              className="size-4"
              icon={Add01Icon}
              strokeWidth={2}
            />
            Add vehicle
          </Button>
        ) : null}
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No transport assignments yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => (
            <TransportAssignmentCard
              assignment={assignment}
              canManageTransport={canManageTransport}
              isRetired={isRetired}
              key={assignment.id}
              onDelete={deleteAction.trigger}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {canManageTransport && !isRetired ? (
        <ConfirmDialog
          title="Delete transport assignment?"
          description={`Delete ${deleteAction.payload?.vehicleLabel ?? "this vehicle"}? This removes it from the Center while preserving its history.`}
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

      {canManageTransport && !isRetired ? (
        <CenterTransportFormDialog
          assignment={editingAssignment}
          centerId={centerId}
          editionId={editionId}
          onOpenChange={setDialogOpen}
          open={dialogOpen}
        />
      ) : null}
    </div>
  );
}
