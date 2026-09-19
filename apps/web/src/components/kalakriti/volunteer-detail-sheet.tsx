import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  canAssignKalakritiVolunteerRole,
  canManageKalakritiResponsibility,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";

import { PersonQrPanel } from "@/components/kalakriti/person-qr-panel";
import {
  formatKalakritiVolunteerAssignment,
  type RemoveAssignmentPayload,
  type VolunteerRosterItem,
} from "@/components/kalakriti/volunteers-table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shared/responsive-sheet";

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? "Not provided"}</span>
    </div>
  );
}

export function VolunteerDetailSheet({
  actorResponsibilities,
  canManage,
  isGlobalAdmin,
  onAssign,
  onOpenChange,
  onRemove,
  onRemoveFromEdition,
  open,
  volunteer,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  canManage: boolean;
  isGlobalAdmin: boolean;
  onAssign: (volunteer: VolunteerRosterItem) => void;
  onOpenChange: (open: boolean) => void;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  onRemoveFromEdition: (volunteer: VolunteerRosterItem) => void;
  open: boolean;
  volunteer: VolunteerRosterItem | null;
}) {
  const handleAddRole = useEventCallback(() => {
    if (volunteer) {
      onAssign(volunteer);
    }
  });
  const handleRemoveFromEdition = useEventCallback(() => {
    if (volunteer) {
      onRemoveFromEdition(volunteer);
    }
  });
  const canAssignRole =
    canManage && volunteer ? canAssignKalakritiVolunteerRole(volunteer) : false;
  const canRemoveFromEdition =
    canManage &&
    (isGlobalAdmin ||
      volunteer?.assignments.every((assignment) =>
        canManageKalakritiResponsibility(
          actorResponsibilities,
          assignment.responsibility
        )
      ));

  if (!volunteer) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{volunteer.snapshotName}</SheetTitle>
          <SheetDescription>
            Volunteer contact details and Edition responsibilities.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <PersonQrPanel enabled={open} id={volunteer.id} type="volunteer" />

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Contact</h3>
            <div className="grid gap-3">
              <DetailRow label="Email" value={volunteer.snapshotEmail} />
              <DetailRow label="Phone" value={volunteer.snapshotPhone} />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Responsibilities</h3>
              {canAssignRole ? (
                <Button
                  onClick={handleAddRole}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  Add role
                </Button>
              ) : null}
            </div>
            {volunteer.assignments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Unassigned — no responsibilities yet.
              </p>
            ) : (
              <ul className="grid gap-2">
                {volunteer.assignments.map((assignment) => (
                  <VolunteerAssignmentDetailRow
                    actorResponsibilities={actorResponsibilities}
                    assignment={assignment}
                    canManage={canManage}
                    isFinalAssignment={volunteer.assignments.length === 1}
                    isGlobalAdmin={isGlobalAdmin}
                    key={assignment.id}
                    onRemove={onRemove}
                    volunteerName={volunteer.snapshotName}
                  />
                ))}
              </ul>
            )}
          </div>

          {canRemoveFromEdition ? (
            <Button
              onClick={handleRemoveFromEdition}
              type="button"
              variant="destructive"
            >
              Remove from Edition
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VolunteerAssignmentDetailRow({
  actorResponsibilities,
  assignment,
  canManage,
  isFinalAssignment,
  isGlobalAdmin,
  onRemove,
  volunteerName,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  assignment: VolunteerRosterItem["assignments"][number];
  canManage: boolean;
  isFinalAssignment: boolean;
  isGlobalAdmin: boolean;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  volunteerName: string;
}) {
  const handleRemove = useEventCallback(() => {
    onRemove({
      assignmentId: assignment.id,
      isFinalAssignment,
      responsibility: assignment.responsibility,
      volunteerName,
    });
  });
  const canRemove =
    canManage &&
    (isGlobalAdmin ||
      canManageKalakritiResponsibility(
        actorResponsibilities,
        assignment.responsibility
      ));

  return (
    <li className="flex items-center justify-between gap-3">
      <Badge variant="outline">
        {formatKalakritiVolunteerAssignment(assignment)}
      </Badge>
      {canRemove ? (
        <Button
          aria-label={`Remove ${KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility]} from ${volunteerName}`}
          onClick={handleRemove}
          size="xs"
          type="button"
          variant="ghost"
        >
          Remove
        </Button>
      ) : null}
    </li>
  );
}
