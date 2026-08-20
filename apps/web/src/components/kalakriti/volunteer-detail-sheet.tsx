import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  canManageKalakritiResponsibility,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import {
  formatKalakritiVolunteerAssignment,
  type RemoveAssignmentPayload,
  type VolunteerRosterItem,
} from "@/components/kalakriti/volunteers-table";

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
  isGlobalAdmin,
  onOpenChange,
  onRemove,
  open,
  volunteer,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  isGlobalAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  open: boolean;
  volunteer: VolunteerRosterItem | null;
}) {
  if (!volunteer) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{volunteer.snapshotName}</SheetTitle>
          <SheetDescription>
            Central volunteer contact details and Edition responsibilities.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-4">
            <h3 className="font-medium text-sm">Contact</h3>
            <div className="grid gap-3">
              <DetailRow label="Email" value={volunteer.snapshotEmail} />
              <DetailRow label="Phone" value={volunteer.snapshotPhone} />
            </div>
          </div>

          <div className="grid gap-3">
            <h3 className="font-medium text-sm">Responsibilities</h3>
            {volunteer.assignments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No responsibilities assigned.
              </p>
            ) : (
              <ul className="grid gap-2">
                {volunteer.assignments.map((assignment) => (
                  <VolunteerAssignmentDetailRow
                    actorResponsibilities={actorResponsibilities}
                    assignment={assignment}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VolunteerAssignmentDetailRow({
  actorResponsibilities,
  assignment,
  isFinalAssignment,
  isGlobalAdmin,
  onRemove,
  volunteerName,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  assignment: VolunteerRosterItem["assignments"][number];
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
    isGlobalAdmin ||
    canManageKalakritiResponsibility(
      actorResponsibilities,
      assignment.responsibility
    );

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
