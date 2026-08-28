import {
  Add01Icon,
  ArrowRight01Icon,
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
import { getNextKalakritiTransportStatus } from "@pi-dash/zero/kalakriti-transport-rules";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { CenterTransportFormDialog } from "@/components/kalakriti/center-transport-form-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

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
  advancingId,
  assignment,
  canManageTransport,
  isAdvancing,
  isRetired,
  onAdvance,
  onEdit,
}: {
  advancingId: string | null;
  assignment: CenterTransportAssignment;
  canManageTransport: boolean;
  isAdvancing: boolean;
  isRetired: boolean;
  onAdvance: (assignment: CenterTransportAssignment) => void;
  onEdit: (assignment: CenterTransportAssignment) => void;
}) {
  const nextStatus = getNextKalakritiTransportStatus(assignment.status);
  const handleEditClick = useEventCallback(() => onEdit(assignment));
  const handleAdvanceClick = useEventCallback(() => onAdvance(assignment));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <h4 className="font-medium text-base">{assignment.vehicleLabel}</h4>
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
            {nextStatus ? (
              <Button
                disabled={isAdvancing && advancingId === assignment.id}
                onClick={handleAdvanceClick}
                size="sm"
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                />
                {KALAKRITI_TRANSPORT_STATUS_LABELS[nextStatus]}
              </Button>
            ) : null}
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
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

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

  const handleAdvance = useEventCallback(
    async (assignment: CenterTransportAssignment) => {
      const nextStatus = getNextKalakritiTransportStatus(assignment.status);
      if (!nextStatus) {
        return;
      }
      setAdvancingId(assignment.id);
      setIsAdvancing(true);
      try {
        const result = await zero.mutate(
          mutators.kalakritiTransport.transitionStatus({
            assignmentId: assignment.id,
            auditEntryId: uuidv7(),
            editionId,
            historyId: uuidv7(),
            now: Date.now(),
            occurredAt: Date.now(),
          })
        ).server;
        handleMutationResult(result, {
          entityId: assignment.id,
          errorMsg: "Failed to advance transport status",
          mutation: "kalakritiTransport.transitionStatus",
          successMsg: `Marked as ${KALAKRITI_TRANSPORT_STATUS_LABELS[nextStatus]}`,
        });
      } finally {
        setIsAdvancing(false);
        setAdvancingId(null);
      }
    }
  );

  if (!canManageTransport && assignments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display font-semibold text-xl">Transport</h3>
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
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No transport assignments yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => (
            <TransportAssignmentCard
              advancingId={advancingId}
              assignment={assignment}
              canManageTransport={canManageTransport}
              isAdvancing={isAdvancing}
              isRetired={isRetired}
              key={assignment.id}
              onAdvance={handleAdvance}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <CenterTransportFormDialog
        assignment={editingAssignment}
        centerId={centerId}
        editionId={editionId}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
      />
    </div>
  );
}
