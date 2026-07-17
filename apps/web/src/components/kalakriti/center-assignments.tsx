import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type ReactNode, useCallback } from "react";
import { uuidv7 } from "uuidv7";
import {
  GuardianCenterAssignmentForm,
  LiaisonCenterAssignmentForm,
} from "@/components/kalakriti/center-assignment-forms";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PickerUser } from "@/functions/users-for-picker";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export interface CenterPersonAssignment {
  centerId: string;
  id: string;
  membershipId: string;
  name: string;
}

function AssignmentList({
  assignments,
  label,
  onRemove,
}: {
  assignments: readonly CenterPersonAssignment[];
  label: string;
  onRemove: (assignment: CenterPersonAssignment) => void;
}) {
  if (assignments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No {label.toLowerCase()} assigned.
      </p>
    );
  }
  return (
    <ul aria-label={label} className="divide-y border-y">
      {assignments.map((assignment) => (
        <AssignmentRow
          assignment={assignment}
          key={assignment.id}
          label={label}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

function AssignmentRow({
  assignment,
  label,
  onRemove,
}: {
  assignment: CenterPersonAssignment;
  label: string;
  onRemove: (assignment: CenterPersonAssignment) => void;
}) {
  const handleRemove = useEventCallback(() => onRemove(assignment));
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-sm">{assignment.name}</span>
      <Button
        aria-label={`Remove ${assignment.name} as ${label}`}
        onClick={handleRemove}
        size="sm"
        type="button"
        variant="ghost"
      >
        Remove
      </Button>
    </li>
  );
}

export function CenterAssignments({
  allowNewAssignments,
  canManageGuardians,
  canManageLiaisons,
  centerId,
  editionId,
  guardianAssignments,
  guardianOptions,
  liaisonAssignments,
  onRetryVolunteers,
  volunteerOptions,
  volunteerOptionsError,
}: {
  allowNewAssignments: boolean;
  canManageGuardians: boolean;
  canManageLiaisons: boolean;
  centerId: string;
  editionId: string;
  guardianAssignments: readonly CenterPersonAssignment[];
  guardianOptions: readonly { id: string; name: string }[];
  liaisonAssignments: readonly CenterPersonAssignment[];
  onRetryVolunteers: () => void;
  volunteerOptions: readonly PickerUser[];
  volunteerOptionsError: boolean;
}) {
  const zero = useZero();
  const guardianRemove = useConfirmAction<CenterPersonAssignment>({
    mutationMeta: {
      entityId: (assignment) => assignment.id,
      errorMsg: "Failed to remove Guardian",
      mutation: "kalakritiCenter.removeGuardian",
      successMsg: "Guardian removed",
    },
    onConfirm: (assignment) =>
      zero.mutate(
        mutators.kalakritiCenter.removeGuardian({
          auditEntryId: uuidv7(),
          guardianCenterId: assignment.id,
          now: Date.now(),
        })
      ).server,
  });
  const liaisonRemove = useConfirmAction<CenterPersonAssignment>({
    mutationMeta: {
      entityId: (assignment) => assignment.id,
      errorMsg: "Failed to remove Liaison",
      mutation: "kalakritiAssignment.remove",
      successMsg: "Liaison removed",
    },
    onConfirm: (assignment) =>
      zero.mutate(
        mutators.kalakritiAssignment.remove({
          assignmentId: assignment.id,
          auditEntryId: uuidv7(),
          now: Date.now(),
        })
      ).server,
  });
  const handleGuardianDialog = useCallback(
    (open: boolean) => {
      if (!open) {
        guardianRemove.cancel();
      }
    },
    [guardianRemove]
  );
  const handleLiaisonDialog = useCallback(
    (open: boolean) => {
      if (!open) {
        liaisonRemove.cancel();
      }
    },
    [liaisonRemove]
  );

  if (!(canManageGuardians || canManageLiaisons)) {
    return null;
  }

  let liaisonAssignmentControl: ReactNode = null;
  if (allowNewAssignments && volunteerOptionsError) {
    liaisonAssignmentControl = (
      <div
        className="flex flex-wrap items-center gap-2 text-destructive text-sm"
        role="alert"
      >
        <span>Central volunteers could not be loaded.</span>
        <Button
          onClick={onRetryVolunteers}
          size="sm"
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  } else if (allowNewAssignments) {
    liaisonAssignmentControl = (
      <LiaisonCenterAssignmentForm
        centerId={centerId}
        editionId={editionId}
        users={volunteerOptions}
      />
    );
  }

  return (
    <div className="grid gap-6 border-t pt-4 lg:grid-cols-2">
      {canManageGuardians ? (
        <section className="space-y-3">
          <div>
            <h3 className="font-medium">Guardians</h3>
            <p className="text-muted-foreground text-sm">
              Student registration access for this Center.
            </p>
          </div>
          <AssignmentList
            assignments={guardianAssignments}
            label="Guardians"
            onRemove={guardianRemove.trigger}
          />
          {allowNewAssignments ? (
            <GuardianCenterAssignmentForm
              centerId={centerId}
              guardians={guardianOptions}
            />
          ) : null}
        </section>
      ) : null}
      {canManageLiaisons ? (
        <section className="space-y-3">
          <div>
            <h3 className="font-medium">Liaisons</h3>
            <p className="text-muted-foreground text-sm">
              Operational access for this Center.
            </p>
          </div>
          <AssignmentList
            assignments={liaisonAssignments}
            label="Liaisons"
            onRemove={liaisonRemove.trigger}
          />
          {liaisonAssignmentControl}
        </section>
      ) : null}
      <ConfirmDialog
        confirmLabel="Remove Guardian"
        description={`Remove ${guardianRemove.payload?.name ?? "this Guardian"} from this Center? Their Edition login remains active.`}
        loading={guardianRemove.isLoading}
        loadingLabel="Removing..."
        onConfirm={guardianRemove.confirm}
        onOpenChange={handleGuardianDialog}
        open={guardianRemove.isOpen}
        title="Remove Guardian assignment?"
      />
      <ConfirmDialog
        confirmLabel="Remove Liaison"
        description={`Remove ${liaisonRemove.payload?.name ?? "this Liaison"} from this Center? Their other Edition responsibilities remain active.`}
        loading={liaisonRemove.isLoading}
        loadingLabel="Removing..."
        onConfirm={liaisonRemove.confirm}
        onOpenChange={handleLiaisonDialog}
        open={liaisonRemove.isOpen}
        title="Remove Liaison assignment?"
      />
    </div>
  );
}
