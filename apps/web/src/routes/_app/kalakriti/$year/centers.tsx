import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import type { CenterPersonAssignment } from "@/components/kalakriti/center-assignments";
import {
  CenterCard,
  type CenterListItem,
} from "@/components/kalakriti/center-card";
import { CenterFormDialog } from "@/components/kalakriti/center-form-dialog";
import { CenterRegistrationDialog } from "@/components/kalakriti/center-registration-dialog";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  getKalakritiVolunteersForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute("/_app/kalakriti/$year/centers")({
  component: KalakritiCentersPage,
});

const CENTER_STRUCTURE_LOCKED_LIFECYCLES = new Set([
  "archived",
  "live",
  "registration_locked",
]);
const CENTER_CONTROLS_LOCKED_LIFECYCLES = new Set(["archived", "live"]);

function CenterPageActions({
  canConfigureCenters,
  canManageRegistrationControls,
  hasOpenRegistration,
  onCreate,
  onLockAll,
}: {
  canConfigureCenters: boolean;
  canManageRegistrationControls: boolean;
  hasOpenRegistration: boolean;
  onCreate: () => void;
  onLockAll: () => void;
}) {
  if (!(canManageRegistrationControls || canConfigureCenters)) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {canManageRegistrationControls ? (
        <Button
          disabled={!hasOpenRegistration}
          onClick={onLockAll}
          variant="outline"
        >
          {hasOpenRegistration
            ? "Lock all registrations"
            : "All registrations locked"}
        </Button>
      ) : null}
      {canConfigureCenters ? (
        <Button onClick={onCreate}>Add Center</Button>
      ) : null}
    </div>
  );
}

function emptyStateDescription({
  canConfigureCenters,
  canManageCenters,
  centerStructureLocked,
}: {
  canConfigureCenters: boolean;
  canManageCenters: boolean;
  centerStructureLocked: boolean;
}): string {
  if (canConfigureCenters) {
    return "Add the first Center for this Edition.";
  }
  if (canManageCenters && centerStructureLocked) {
    return "Center configuration is locked for this Edition.";
  }
  return "You have not been assigned to a Center.";
}

function KalakritiCentersPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const responsibilities = new Set(access.membership?.responsibilities ?? []);
  const canManageCenters =
    access.isGlobalAdmin || responsibilities.has("edition_admin");
  const canManageGuardians = canManageCenters;
  const canManageLiaisons =
    canManageCenters || responsibilities.has("volunteer_coordinator");
  const centerStructureLocked = CENTER_STRUCTURE_LOCKED_LIFECYCLES.has(
    edition.lifecycle
  );
  const registrationControlsLocked = CENTER_CONTROLS_LOCKED_LIFECYCLES.has(
    edition.lifecycle
  );
  const canConfigureCenters = canManageCenters && !centerStructureLocked;
  const canManageRegistrationControls =
    canManageCenters && !registrationControlsLocked;
  const [centers, centerResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const [guardianAssignments] = useQuery(
    queries.kalakritiCenter.guardianAssignments({ editionId: edition.id }),
    { enabled: canManageGuardians }
  );
  const [liaisonAssignments] = useQuery(
    queries.kalakritiCenter.liaisonAssignments({ editionId: edition.id }),
    { enabled: canManageLiaisons }
  );
  const [guardians] = useQuery(
    queries.kalakritiGuardian.roster({ editionId: edition.id }),
    { enabled: canManageGuardians }
  );
  const [volunteerOptions, setVolunteerOptions] = useState<PickerUser[]>([]);
  const [volunteerOptionsError, setVolunteerOptionsError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CenterListItem | null>(
    null
  );
  const [controlsCenter, setControlsCenter] = useState<CenterListItem | null>(
    null
  );

  const loadVolunteerOptions = useCallback(
    () =>
      getKalakritiVolunteersForPicker({
        data: { editionId: edition.id },
      })
        .then((users) => {
          setVolunteerOptions(users);
          setVolunteerOptionsError(false);
        })
        .catch(() => {
          setVolunteerOptions([]);
          setVolunteerOptionsError(true);
        }),
    [edition.id]
  );

  useEffect(() => {
    if (!canManageLiaisons) {
      return;
    }
    loadVolunteerOptions();
  }, [canManageLiaisons, loadVolunteerOptions]);

  const retireAction = useConfirmAction<CenterListItem>({
    mutationMeta: {
      entityId: (center) => center.id,
      errorMsg: "Failed to retire Center",
      mutation: "kalakritiCenter.retire",
      successMsg: "Center retired",
    },
    onConfirm: (center) =>
      zero.mutate(
        mutators.kalakritiCenter.retire({
          auditEntryId: uuidv7(),
          centerId: center.id,
          now: Date.now(),
        })
      ).server,
  });
  const deleteAction = useConfirmAction<CenterListItem>({
    mutationMeta: {
      entityId: (center) => center.id,
      errorMsg: "Center has assignments or could not be deleted",
      mutation: "kalakritiCenter.delete",
      successMsg: "Center deleted",
    },
    onConfirm: (center) =>
      zero.mutate(
        mutators.kalakritiCenter.delete({
          auditEntryId: uuidv7(),
          centerId: center.id,
          now: Date.now(),
        })
      ).server,
  });
  const lockAllAction = useConfirmAction({
    mutationMeta: {
      entityId: edition.id,
      errorMsg: "Failed to lock Center registrations",
      mutation: "kalakritiCenter.lockAllRegistration",
      successMsg: "All Center registrations locked",
    },
    onConfirm: () =>
      zero.mutate(
        mutators.kalakritiCenter.lockAllRegistration({
          auditEntryId: uuidv7(),
          confirmLock: true,
          editionId: edition.id,
          now: Date.now(),
        })
      ).server,
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
  const closeLockAll = useCallback(
    (open: boolean) => {
      if (!open) {
        lockAllAction.cancel();
      }
    },
    [lockAllAction]
  );
  const handleCreate = useEventCallback(() => setCreateOpen(true));
  const handleVolunteerRetry = useEventCallback(() => {
    loadVolunteerOptions();
  });
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setEditingCenter(null);
    }
  });
  const handleControlsOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setControlsCenter(null);
    }
  });

  const guardianRows: CenterPersonAssignment[] = guardianAssignments.map(
    (item) => ({
      centerId: item.centerId,
      id: item.id,
      membershipId: item.membershipId,
      name: item.membership?.snapshotName ?? "Unknown Guardian",
    })
  );
  const liaisonRows: CenterPersonAssignment[] = liaisonAssignments.map(
    (item) => ({
      centerId: item.centerId ?? "",
      id: item.id,
      membershipId: item.membershipId,
      name: item.membership?.snapshotName ?? "Unknown Liaison",
    })
  );

  const isLoading = centers.length === 0 && centerResult.type !== "complete";
  if (isLoading) {
    return (
      <div
        aria-label="Loading Centers"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }
  const hasOpenRegistration = centers.some(
    (center) =>
      center.studentRegistrationEnabled ||
      center.competitionEntryRegistrationEnabled
  );
  const emptyDescription = emptyStateDescription({
    canConfigureCenters,
    canManageCenters,
    centerStructureLocked,
  });

  return (
    <div className="space-y-4 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-2xl">Centers</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Registration access and operational assignments are scoped to this
            Edition.
          </p>
        </div>
        <CenterPageActions
          canConfigureCenters={canConfigureCenters}
          canManageRegistrationControls={canManageRegistrationControls}
          hasOpenRegistration={hasOpenRegistration}
          onCreate={handleCreate}
          onLockAll={lockAllAction.trigger}
        />
      </div>

      {canManageCenters && centerStructureLocked ? (
        <p className="text-muted-foreground text-sm">
          Center structure is locked while this Edition is {edition.lifecycle}.
          Assignments remain available; registration controls remain available
          until the Edition goes live.
        </p>
      ) : null}

      {centers.length === 0 ? (
        <div className="border border-dashed px-4 py-12 text-center">
          <p className="font-medium">No Centers available</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {emptyDescription}
          </p>
        </div>
      ) : (
        centers.map((centerRow) => {
          const center: CenterListItem = {
            ...centerRow,
            competitionEntryRegistrationEnabled: Boolean(
              centerRow.competitionEntryRegistrationEnabled
            ),
            studentRegistrationEnabled: Boolean(
              centerRow.studentRegistrationEnabled
            ),
          };
          const assignedGuardianIds = new Set(
            guardianRows
              .filter((item) => item.centerId === center.id)
              .map((item) => item.membershipId)
          );
          return (
            <CenterCard
              center={center}
              editionId={edition.id}
              guardianAssignments={guardianRows.filter(
                (item) => item.centerId === center.id
              )}
              guardianOptions={guardians
                .filter(
                  (guardian) =>
                    guardian.state === "active" &&
                    !assignedGuardianIds.has(guardian.id)
                )
                .map((guardian) => ({
                  id: guardian.id,
                  name: guardian.snapshotName,
                }))}
              key={center.id}
              liaisonAssignments={liaisonRows.filter(
                (item) => item.centerId === center.id
              )}
              onDelete={deleteAction.trigger}
              onEdit={setEditingCenter}
              onRegistrationControls={setControlsCenter}
              onRetire={retireAction.trigger}
              onRetryVolunteers={handleVolunteerRetry}
              permissions={{
                manageGuardians: canManageGuardians,
                manageLiaisons: canManageLiaisons,
                manageRegistrationControls: canManageRegistrationControls,
                manageStructure: canConfigureCenters,
              }}
              volunteerOptions={volunteerOptions}
              volunteerOptionsError={volunteerOptionsError}
            />
          );
        })
      )}

      <CenterFormDialog
        editionId={edition.id}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
      <CenterFormDialog
        center={editingCenter ?? undefined}
        editionId={edition.id}
        onOpenChange={handleEditOpenChange}
        open={editingCenter !== null}
      />
      <CenterRegistrationDialog
        center={controlsCenter}
        onOpenChange={handleControlsOpenChange}
        open={controlsCenter !== null}
      />
      <ConfirmDialog
        confirmLabel="Retire Center"
        description={`Retire ${retireAction.payload?.name ?? "this Center"}? Both registration controls will close and it cannot receive new assignments.`}
        loading={retireAction.isLoading}
        loadingLabel="Retiring..."
        onConfirm={retireAction.confirm}
        onOpenChange={closeRetire}
        open={retireAction.isOpen}
        title="Retire Center?"
      />
      <ConfirmDialog
        confirmLabel="Delete Center"
        description={`Permanently delete ${deleteAction.payload?.name ?? "this Center"}? Centers with assignments cannot be deleted.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDelete}
        open={deleteAction.isOpen}
        title="Delete Center?"
      />
      <ConfirmDialog
        confirmLabel="Lock all registrations"
        description="Close student and event participation registration for every Center in this Edition? Individual Centers can be reopened later with an audited confirmation."
        loading={lockAllAction.isLoading}
        loadingLabel="Locking..."
        onConfirm={lockAllAction.confirm}
        onOpenChange={closeLockAll}
        open={lockAllAction.isOpen}
        title="Lock all Center registrations?"
        variant="default"
      />
    </div>
  );
}
