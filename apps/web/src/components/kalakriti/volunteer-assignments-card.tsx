import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES,
  KALAKRITI_RESPONSIBILITY_LABELS,
} from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { VolunteerAssignmentForm } from "@/components/kalakriti/volunteer-assignment-form";
import {
  type RemoveAssignmentPayload,
  VolunteerAssignmentRoster,
} from "@/components/kalakriti/volunteer-assignment-roster";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import {
  getKalakritiVolunteersForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";
import { useConfirmAction } from "@/hooks/use-confirm-action";

interface PickerData {
  editionId: string;
  state: "error" | "ready";
  users: PickerUser[];
}

function PickerContent({
  editionId,
  pickerState,
  responsibilities,
  users,
}: {
  editionId: string;
  pickerState: "idle" | "loading" | "ready" | "error";
  responsibilities: readonly (typeof KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES)[number][];
  users: readonly PickerUser[];
}) {
  if (pickerState === "loading" || pickerState === "idle") {
    return (
      <div
        aria-label="Loading central volunteers"
        className="flex min-h-24 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }
  if (pickerState === "error") {
    return (
      <p className="text-destructive text-sm" role="alert">
        Central volunteers could not be loaded. Refresh and try again.
      </p>
    );
  }
  return (
    <VolunteerAssignmentForm
      editionId={editionId}
      key={responsibilities.join(":")}
      responsibilities={responsibilities}
      users={users}
    />
  );
}

export function VolunteerAssignmentsCard({ editionId }: { editionId: string }) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const [myAccess] = useQuery(
    queries.kalakritiAssignment.myAccess({ editionId })
  );
  const actorResponsibilityValues =
    myAccess?.assignments.map((assignment) => assignment.responsibility) ?? [];
  const actorResponsibilities = new Set(actorResponsibilityValues);
  const isGlobalAdmin = hasPermission("kalakriti.admin");
  const isEditionAdmin = actorResponsibilities.has("edition_admin");
  const isVolunteerCoordinator = actorResponsibilities.has(
    "volunteer_coordinator"
  );
  const canManage = isGlobalAdmin || isEditionAdmin || isVolunteerCoordinator;
  const availableResponsibilities =
    isGlobalAdmin || isEditionAdmin
      ? KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES
      : (["overall_events_lead"] as const);
  const [roster, rosterResult] = useQuery(
    queries.kalakritiAssignment.roster({ editionId }),
    { enabled: canManage }
  );
  const [pickerData, setPickerData] = useState<PickerData | null>(null);
  const pickerIsCurrent = pickerData?.editionId === editionId;
  const pickerState = pickerIsCurrent ? pickerData.state : "loading";
  const pickerUsers = pickerIsCurrent ? pickerData.users : [];

  useEffect(() => {
    if (!canManage) {
      return;
    }
    let active = true;
    getKalakritiVolunteersForPicker({ data: { editionId } })
      .then((users) => {
        if (active) {
          setPickerData({ editionId, state: "ready", users });
        }
      })
      .catch(() => {
        if (active) {
          setPickerData({ editionId, state: "error", users: [] });
        }
      });
    return () => {
      active = false;
    };
  }, [canManage, editionId]);

  const removeAction = useConfirmAction<RemoveAssignmentPayload>({
    mutationMeta: {
      entityId: (payload) => payload.assignmentId,
      errorMsg: "Failed to remove responsibility",
      mutation: "kalakritiAssignment.remove",
      successMsg: "Responsibility removed",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiAssignment.remove({
          assignmentId: payload.assignmentId,
          auditEntryId: uuidv7(),
          now: Date.now(),
        })
      ).server,
  });
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        removeAction.cancel();
      }
    },
    [removeAction]
  );

  if (!canManage) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Volunteer assignments</CardTitle>
        <CardDescription>
          Assign central volunteers explicitly for this Edition. Linked event
          access follows their active responsibilities.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rosterResult.type === "complete" ? (
          <VolunteerAssignmentRoster
            actorResponsibilities={actorResponsibilityValues}
            isGlobalAdmin={isGlobalAdmin}
            memberships={roster}
            onRemove={removeAction.trigger}
          />
        ) : (
          <div
            aria-label="Loading volunteer assignments"
            className="flex min-h-24 items-center justify-center"
            role="status"
          >
            <Loader />
          </div>
        )}

        <div className="border-t pt-6">
          <h3 className="font-medium text-base">Add responsibility</h3>
          <p className="mt-1 mb-4 text-muted-foreground text-sm">
            External Guardians are intentionally excluded from this picker.
          </p>
          <PickerContent
            editionId={editionId}
            pickerState={pickerState}
            responsibilities={availableResponsibilities}
            users={pickerUsers}
          />
        </div>
      </CardContent>

      <ConfirmDialog
        confirmLabel="Remove responsibility"
        description={
          removeAction.payload?.isFinalAssignment
            ? `This is ${removeAction.payload.volunteerName}'s final responsibility. Removing it also revokes Edition and linked-event access.`
            : `Remove ${KALAKRITI_RESPONSIBILITY_LABELS[removeAction.payload?.responsibility ?? "overall_events_lead"]} from ${removeAction.payload?.volunteerName ?? "this volunteer"}?`
        }
        loading={removeAction.isLoading}
        loadingLabel="Removing..."
        onConfirm={removeAction.confirm}
        onOpenChange={handleDialogOpenChange}
        open={removeAction.isOpen}
        title="Remove volunteer responsibility?"
      />
    </Card>
  );
}
