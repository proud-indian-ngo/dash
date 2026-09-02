import {
  ArrowLeft01Icon,
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
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { uuidv7 } from "uuidv7";

import {
  CenterAssignments,
  type CenterPersonAssignment,
} from "@/components/kalakriti/center-assignments";
import { CenterFormDialog } from "@/components/kalakriti/center-form-dialog";
import { CenterRegistrationDialog } from "@/components/kalakriti/center-registration-dialog";
import type { CenterListItem } from "@/components/kalakriti/centers-table";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PickerUser } from "@/functions/users-for-picker";
import { useConfirmAction } from "@/hooks/use-confirm-action";

function RegistrationAccess({
  description,
  enabled,
  label,
}: {
  description: string;
  enabled: boolean;
  label: string;
}) {
  return (
    <div className="space-y-2 border-l-2 pl-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{label}</h4>
        <Badge variant={enabled ? "secondary" : "outline"}>
          {enabled ? "Open" : "Closed"}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

export function CenterDetail({
  capabilities,
  center,
  configurationLocked,
  editionId,
  editionLifecycle,
  guardianAssignments,
  guardianOptions,
  liaisonAssignments,
  onDeleted,
  onRetryVolunteers,
  volunteerOptions,
  volunteerOptionsError,
  year,
}: {
  capabilities: {
    configureCenters: boolean;
    manageCenters: boolean;
    manageGuardians: boolean;
    manageLiaisons: boolean;
    manageRegistrationControls: boolean;
  };
  center: CenterListItem;
  configurationLocked: boolean;
  editionId: string;
  editionLifecycle: string;
  guardianAssignments: readonly CenterPersonAssignment[];
  guardianOptions: readonly { id: string; name: string }[];
  liaisonAssignments: readonly CenterPersonAssignment[];
  onDeleted: () => void;
  onRetryVolunteers: () => void;
  volunteerOptions: readonly PickerUser[];
  volunteerOptionsError: boolean;
  year: string;
}) {
  const {
    configureCenters,
    manageCenters,
    manageGuardians,
    manageLiaisons,
    manageRegistrationControls,
  } = capabilities;
  const zero = useZero();
  const [editOpen, setEditOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const isRetired = center.retiredAt !== null;
  const retireAction = useConfirmAction<CenterListItem>({
    mutationMeta: {
      entityId: (item) => item.id,
      errorMsg: "Failed to retire Center",
      mutation: "kalakritiCenter.retire",
      successMsg: "Center retired",
    },
    onConfirm: (item) =>
      zero.mutate(
        mutators.kalakritiCenter.retire({
          auditEntryId: uuidv7(),
          centerId: item.id,
          now: Date.now(),
        })
      ).server,
  });
  const deleteAction = useConfirmAction<CenterListItem>({
    mutationMeta: {
      entityId: (item) => item.id,
      errorMsg: "Center has assignments or could not be deleted",
      mutation: "kalakritiCenter.delete",
      successMsg: "Center deleted",
    },
    onConfirm: (item) =>
      zero.mutate(
        mutators.kalakritiCenter.delete({
          auditEntryId: uuidv7(),
          centerId: item.id,
          now: Date.now(),
        })
      ).server,
    onSuccess: onDeleted,
  });
  const closeRetire = useCallback(
    (open: boolean) => {
      if (!open) {
        retireAction.cancel();
      }
    },
    [retireAction]
  );
  const closeDelete = useCallback(
    (open: boolean) => {
      if (!open) {
        deleteAction.cancel();
      }
    },
    [deleteAction]
  );
  const handleEdit = useEventCallback(() => setEditOpen(true));
  const handleControls = useEventCallback(() => setControlsOpen(true));
  const handleRetire = useEventCallback(() => retireAction.trigger(center));
  const handleDelete = useEventCallback(() => deleteAction.trigger(center));

  return (
    <div className="space-y-6">
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 text-sm"
        params={{ year }}
        to="/kalakriti/$year/centers"
      >
        <HugeiconsIcon
          className="size-4"
          icon={ArrowLeft01Icon}
          strokeWidth={2}
        />
        Back to Centers
      </Link>

      <KalakritiPageHeader
        actions={
          configureCenters || manageRegistrationControls ? (
            <div className="flex flex-wrap gap-2">
              {isRetired ? null : (
                <>
                  {manageRegistrationControls ? (
                    <Button
                      onClick={handleControls}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Registration controls
                    </Button>
                  ) : null}
                  {configureCenters ? (
                    <>
                      <Button
                        onClick={handleEdit}
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
                        onClick={handleRetire}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Retire
                      </Button>
                    </>
                  ) : null}
                </>
              )}
              {configureCenters ? (
                <Button
                  onClick={handleDelete}
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
              ) : null}
            </div>
          ) : undefined
        }
        badge={
          <Badge variant={isRetired ? "outline" : "secondary"}>
            {isRetired ? "Retired" : "Active"}
          </Badge>
        }
        kicker="Center"
        title={center.name}
      />

      {manageCenters && configurationLocked ? (
        <KalakritiLockNotice>
          Center configuration is locked while this Edition is{" "}
          {editionLifecycle}. Assignments remain available; registration
          controls remain available until the Edition goes live.
        </KalakritiLockNotice>
      ) : null}

      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium">Registration access</h3>
          <CardDescription>
            Student registration and competition participation are controlled
            independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <RegistrationAccess
            description="Guardians can add and update students for this Center."
            enabled={center.studentRegistrationEnabled}
            label="Student registration"
          />
          <RegistrationAccess
            description="Registered students can be entered into competitions."
            enabled={center.competitionEntryRegistrationEnabled}
            label="Participation registration"
          />
        </CardContent>
      </Card>

      {manageGuardians || manageLiaisons ? (
        <div className="space-y-4">
          <h3 className="font-display text-xl font-semibold">Assignments</h3>
          <CenterAssignments
            allowNewAssignments={!isRetired}
            canManageGuardians={manageGuardians}
            canManageLiaisons={manageLiaisons}
            centerId={center.id}
            editionId={editionId}
            guardianAssignments={guardianAssignments}
            guardianOptions={guardianOptions}
            liaisonAssignments={liaisonAssignments}
            onRetryVolunteers={onRetryVolunteers}
            volunteerOptions={volunteerOptions}
            volunteerOptionsError={volunteerOptionsError}
          />
        </div>
      ) : null}

      <CenterFormDialog
        center={center}
        editionId={editionId}
        onOpenChange={setEditOpen}
        open={editOpen}
      />
      <CenterRegistrationDialog
        center={center}
        onOpenChange={setControlsOpen}
        open={controlsOpen}
      />
      <ConfirmDialog
        confirmLabel="Retire Center"
        description={`Retire ${center.name}? Both registration controls will close and it cannot receive new assignments.`}
        loading={retireAction.isLoading}
        loadingLabel="Retiring..."
        onConfirm={retireAction.confirm}
        onOpenChange={closeRetire}
        open={retireAction.isOpen}
        title="Retire Center?"
      />
      <ConfirmDialog
        confirmLabel="Delete Center"
        description={`Permanently delete ${center.name}? Centers with assignments cannot be deleted.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDelete}
        open={deleteAction.isOpen}
        title="Delete Center?"
      />
    </div>
  );
}
