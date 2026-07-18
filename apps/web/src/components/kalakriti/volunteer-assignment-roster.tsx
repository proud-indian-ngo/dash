import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  canManageKalakritiResponsibility,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import { useCallback } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";

export interface RemoveAssignmentPayload {
  assignmentId: string;
  isFinalAssignment: boolean;
  responsibility: KalakritiResponsibility;
  volunteerName: string;
}

interface VolunteerAssignment {
  competitionCategoryId: string | null;
  competitionId: string | null;
  id: string;
  isPrimary: boolean | null;
  responsibility: KalakritiResponsibility;
}

interface AssignmentScope {
  id: string;
  name: string;
}

interface VolunteerMembership {
  assignments: readonly VolunteerAssignment[];
  id: string;
  snapshotEmail: string | null;
  snapshotName: string;
}

function VolunteerAssignmentRow({
  actorResponsibilities,
  assignment,
  competitionCategories,
  competitions,
  isFinalAssignment,
  isGlobalAdmin,
  onRemove,
  volunteerName,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  assignment: VolunteerAssignment;
  competitionCategories: readonly AssignmentScope[];
  competitions: readonly AssignmentScope[];
  isFinalAssignment: boolean;
  isGlobalAdmin: boolean;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  volunteerName: string;
}) {
  const handleRemove = useCallback(() => {
    onRemove({
      assignmentId: assignment.id,
      isFinalAssignment,
      responsibility: assignment.responsibility,
      volunteerName,
    });
  }, [assignment, isFinalAssignment, onRemove, volunteerName]);
  const canRemove =
    isGlobalAdmin ||
    canManageKalakritiResponsibility(
      actorResponsibilities,
      assignment.responsibility
    );
  const scopeName = assignment.competitionCategoryId
    ? competitionCategories.find(
        (category) => category.id === assignment.competitionCategoryId
      )?.name
    : competitions.find(
        (competition) => competition.id === assignment.competitionId
      )?.name;

  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline">
        {KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility]}
        {scopeName ? ` · ${scopeName}` : ""}
        {assignment.isPrimary ? " · Primary" : ""}
      </Badge>
      {canRemove ? (
        <Button
          aria-label={`Remove ${KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility]} from ${volunteerName}`}
          onClick={handleRemove}
          size="xs"
          variant="ghost"
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
}

export function VolunteerAssignmentRoster({
  actorResponsibilities,
  competitionCategories,
  competitions,
  isGlobalAdmin,
  memberships,
  onRemove,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  competitionCategories: readonly AssignmentScope[];
  competitions: readonly AssignmentScope[];
  isGlobalAdmin: boolean;
  memberships: readonly VolunteerMembership[];
  onRemove: (payload: RemoveAssignmentPayload) => void;
}) {
  if (memberships.length === 0) {
    return (
      <div className="border border-dashed p-4 text-muted-foreground text-sm">
        No central volunteers are assigned yet.
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {memberships.map((membership) => (
        <li
          className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
          key={membership.id}
        >
          <div className="flex min-w-0 gap-3">
            <UserAvatar
              className="size-9 shrink-0"
              user={{ name: membership.snapshotName }}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{membership.snapshotName}</p>
              <p className="truncate text-muted-foreground text-sm">
                {membership.snapshotEmail}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {membership.assignments.map((assignment) => (
                  <VolunteerAssignmentRow
                    actorResponsibilities={actorResponsibilities}
                    assignment={assignment}
                    competitionCategories={competitionCategories}
                    competitions={competitions}
                    isFinalAssignment={membership.assignments.length === 1}
                    isGlobalAdmin={isGlobalAdmin}
                    key={assignment.id}
                    onRemove={onRemove}
                    volunteerName={membership.snapshotName}
                  />
                ))}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
