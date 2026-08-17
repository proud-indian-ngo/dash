import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { uuidv7 } from "uuidv7";
import { CenterFormDialog } from "@/components/kalakriti/center-form-dialog";
import { CenterRegistrationDialog } from "@/components/kalakriti/center-registration-dialog";
import {
  type CenterListItem,
  CentersTable,
  type CenterTableRow,
} from "@/components/kalakriti/centers-table";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute("/_app/kalakriti/$year/centers/")({
  component: KalakritiCentersPage,
});

const CENTER_STRUCTURE_LOCKED_LIFECYCLES = new Set([
  "archived",
  "live",
  "registration_locked",
]);
const CENTER_CONTROLS_LOCKED_LIFECYCLES = new Set(["archived", "live"]);

function getEmptyStateDescription({
  canConfigureCenters,
  canManageCenters,
  centerStructureLocked,
}: {
  canConfigureCenters: boolean;
  canManageCenters: boolean;
  centerStructureLocked: boolean;
}) {
  if (canConfigureCenters) {
    return "Add the first Center for this Edition.";
  }
  if (canManageCenters && centerStructureLocked) {
    return "Center configuration is locked for this Edition.";
  }
  return "You have not been assigned to a Center.";
}

function KalakritiCentersPage() {
  const navigate = useNavigate();
  const zero = useZero();
  const { year } = Route.useParams();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CenterListItem | null>(
    null
  );
  const [controlsCenter, setControlsCenter] = useState<CenterListItem | null>(
    null
  );

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
  const handleViewCenter = useEventCallback((center: CenterTableRow) => {
    navigate({
      params: { id: center.id, year },
      to: "/kalakriti/$year/centers/$id",
    });
  });

  const centerRows: CenterTableRow[] = centers.map((center) => ({
    ...center,
    competitionEntryRegistrationEnabled: Boolean(
      center.competitionEntryRegistrationEnabled
    ),
    guardianCount: canManageGuardians
      ? guardianAssignments.filter((item) => item.centerId === center.id).length
      : null,
    liaisonCount: canManageLiaisons
      ? liaisonAssignments.filter((item) => item.centerId === center.id).length
      : null,
    studentRegistrationEnabled: Boolean(center.studentRegistrationEnabled),
  }));
  const isLoading = centers.length === 0 && centerResult.type !== "complete";
  const hasOpenRegistration = centers.some(
    (center) =>
      center.studentRegistrationEnabled ||
      center.competitionEntryRegistrationEnabled
  );
  const emptyStateDescription = getEmptyStateDescription({
    canConfigureCenters,
    canManageCenters,
    centerStructureLocked,
  });
  const toolbarActions =
    canConfigureCenters || canManageRegistrationControls ? (
      <div className="flex flex-wrap gap-2">
        {canManageRegistrationControls ? (
          <Button
            disabled={!hasOpenRegistration}
            onClick={lockAllAction.trigger}
            variant="outline"
          >
            {hasOpenRegistration
              ? "Lock all registrations"
              : "All registrations locked"}
          </Button>
        ) : null}
        {canConfigureCenters ? (
          <Button onClick={handleCreate}>Add Center</Button>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Centers"
      />

      {canManageCenters && centerStructureLocked ? (
        <KalakritiLockNotice>
          Center structure is locked while this Edition is {edition.lifecycle}.
          Assignments remain available; registration controls remain available
          until the Edition goes live.
        </KalakritiLockNotice>
      ) : null}

      <CentersTable
        canConfigureCenters={canConfigureCenters}
        canManageRegistrationControls={canManageRegistrationControls}
        data={centerRows}
        emptyMessage={`No Centers available. ${emptyStateDescription}`}
        isLoading={isLoading}
        onDelete={deleteAction.trigger}
        onEdit={setEditingCenter}
        onRegistrationControls={setControlsCenter}
        onRetire={retireAction.trigger}
        onView={handleViewCenter}
        toolbarActions={toolbarActions}
      />

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
