import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { GuardianDetailSheet } from "@/components/kalakriti/guardian-detail-sheet";
import { GuardianEditDialog } from "@/components/kalakriti/guardian-edit-dialog";
import {
  GuardianInviteDialog,
  type GuardianInviteValues,
} from "@/components/kalakriti/guardian-invite-dialog";
import {
  type GuardianRosterItem,
  GuardiansTable,
} from "@/components/kalakriti/guardians-table";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { PeoplePageSummary } from "@/components/kalakriti/people-page-summary";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  archiveKalakritiGuardian,
  inviteKalakritiGuardian,
} from "@/functions/kalakriti-guardian";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  canManageKalakritiGuardians,
  canViewKalakritiGuardians,
} from "@/lib/kalakriti-guardian-policy";

interface ReusePayload extends GuardianInviteValues {
  existingName: string;
}

export const Route = createFileRoute("/_app/kalakriti/$year/guardians")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (!canViewKalakritiGuardians(access)) {
      throw notFound();
    }
  },
  component: KalakritiGuardiansPage,
});

function KalakritiGuardiansPage() {
  const { setQuery } = useDataTableFilters();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const canManage = canManageKalakritiGuardians(access);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string | null>(
    null
  );
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(
    null
  );
  const [guardians, rosterResult] = useQuery(
    queries.kalakritiGuardian.roster({ editionId: edition.id })
  );
  const [assignments, assignmentsResult] = useQuery(
    queries.kalakritiCenter.guardianAssignments({ editionId: edition.id })
  );
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );

  const archiveAction = useConfirmAction<GuardianRosterItem>({
    onConfirm: async (guardian) => {
      try {
        await archiveKalakritiGuardian({
          data: { membershipId: guardian.id },
        });
        return { type: "success" };
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Guardian access could not be archived";
        log.error({
          action: "archiveGuardian",
          component: "KalakritiGuardiansPage",
          editionId: edition.id,
          error: message,
          membershipId: guardian.id,
        });
        return { error: { message }, type: "error" };
      }
    },
    onError: (message) =>
      toast.error(message ?? "Guardian access could not be archived"),
    onSuccess: () => toast.success("Guardian access archived"),
  });

  const reuseAction = useConfirmAction<ReusePayload>({
    onConfirm: async (payload) => {
      try {
        await inviteKalakritiGuardian({
          data: {
            confirmReuse: true,
            editionId: edition.id,
            email: payload.email,
            name: payload.name,
            password: payload.password || undefined,
            phone: payload.phone || undefined,
          },
        });
        return { type: "success" };
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Guardian access could not be reactivated";
        log.error({
          action: "reactivateGuardian",
          component: "KalakritiGuardiansPage",
          editionId: edition.id,
          error: message,
        });
        return { error: { message }, type: "error" };
      }
    },
    onError: (message) =>
      toast.error(message ?? "Guardian access could not be reactivated"),
    onSuccess: () => toast.success("Guardian access reactivated"),
  });

  const handleRequiresConfirmation = useEventCallback(
    (values: GuardianInviteValues, existingName: string) => {
      reuseAction.trigger({ ...values, existingName });
    }
  );
  const handleInviteOpen = useEventCallback(() => setInviteOpen(true));
  const handleViewGuardian = useEventCallback(
    (guardian: GuardianRosterItem) => {
      setSelectedGuardianId(guardian.id);
    }
  );
  const handleEditGuardian = useEventCallback(
    (guardian: GuardianRosterItem) => {
      setSelectedGuardianId(null);
      setEditingGuardianId(guardian.id);
    }
  );
  const handleArchiveGuardian = useEventCallback(
    (guardian: GuardianRosterItem) => {
      setSelectedGuardianId(null);
      setEditingGuardianId(null);
      archiveAction.trigger(guardian);
    }
  );
  const handleGuardianSheetOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedGuardianId(null);
    }
  });
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setEditingGuardianId(null);
    }
  });
  const handleArchiveOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      archiveAction.cancel();
    }
  });
  const handleReuseOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      reuseAction.cancel();
    }
  });

  const guardianRows: GuardianRosterItem[] = guardians.map((guardian) => ({
    assignedCenters: assignments
      .filter(
        (assignment) =>
          assignment.membershipId === guardian.id && assignment.center
      )
      .map((assignment) => assignment.center?.name ?? "")
      .filter(Boolean),
    humanId: guardian.humanId,
    id: guardian.id,
    isExternal: guardian.user?.role === "external_user",
    operations: guardian.operations,
    snapshotEmail: guardian.snapshotEmail,
    snapshotName: guardian.snapshotName,
    snapshotPhone: guardian.snapshotPhone,
    state: guardian.state ?? "active",
  }));
  const selectedGuardian =
    guardianRows.find((guardian) => guardian.id === selectedGuardianId) ?? null;
  const editingGuardian =
    guardianRows.find((guardian) => guardian.id === editingGuardianId) ?? null;
  const isLoading =
    guardianRows.length === 0 && rosterResult.type !== "complete";
  const activeGuardians = guardianRows.filter(
    (guardian) => guardian.state === "active"
  );
  const unassigned = activeGuardians.filter(
    (guardian) => guardian.assignedCenters.length === 0
  ).length;
  const coveredCenterIds = new Set(
    assignments
      .filter((assignment) => assignment.membership?.state === "active")
      .map((assignment) => assignment.centerId)
  );
  const centersWithoutGuardians = centers.filter(
    (center) => center.retiredAt === null && !coveredCenterIds.has(center.id)
  ).length;

  if (
    rosterResult.type === "error" ||
    assignmentsResult.type === "error" ||
    centersResult.type === "error"
  ) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
        <p role="alert">Guardian coverage could not be loaded.</p>
        <Button
          onClick={() => {
            if (rosterResult.type === "error") rosterResult.retry?.();
            if (assignmentsResult.type === "error") assignmentsResult.retry?.();
            if (centersResult.type === "error") centersResult.retry?.();
          }}
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }
  if (
    rosterResult.type !== "complete" ||
    assignmentsResult.type !== "complete" ||
    centersResult.type !== "complete"
  ) {
    return (
      <div
        aria-label="Loading Guardian coverage"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Guardians"
      />

      {rosterResult.type === "complete" &&
      assignmentsResult.type === "complete" &&
      centersResult.type === "complete" ? (
        <PeoplePageSummary
          title="Guardian coverage"
          scope="All Centers and Guardians in this Edition"
          measures={[
            { label: "Active Guardians", value: activeGuardians.length },
            {
              label: "Without Centers",
              value: unassigned,
              onClick: () =>
                void setQuery(
                  createFilterQuery<unknown>([
                    createFilterRule({
                      id: "guardians-without-centers",
                      path: ["assignedCenterCount"],
                      operator: "eq",
                      value: 0,
                    }),
                    createFilterRule({
                      id: "guardians-active",
                      path: ["state"],
                      operator: "is",
                      value: "active",
                    }),
                  ])
                ),
            },
            {
              label: "Centers without Guardians",
              value: centersWithoutGuardians,
            },
          ]}
        />
      ) : null}

      <GuardiansTable
        canManage={canManage}
        data={guardianRows}
        isLoading={isLoading}
        onArchive={handleArchiveGuardian}
        onEdit={handleEditGuardian}
        onView={handleViewGuardian}
        toolbarActions={
          canManage ? (
            <Button onClick={handleInviteOpen}>Invite Guardian</Button>
          ) : undefined
        }
      />

      <GuardianDetailSheet
        access={access}
        canManage={canManage}
        guardian={selectedGuardian}
        onArchive={handleArchiveGuardian}
        onEdit={handleEditGuardian}
        onOpenChange={handleGuardianSheetOpenChange}
        open={selectedGuardian !== null}
      />

      {canManage ? (
        <>
          <GuardianEditDialog
            guardian={editingGuardian}
            onOpenChange={handleEditOpenChange}
            open={editingGuardian !== null}
          />

          <GuardianInviteDialog
            editionId={edition.id}
            onOpenChange={setInviteOpen}
            onRequiresConfirmation={handleRequiresConfirmation}
            open={inviteOpen}
          />
        </>
      ) : null}
      <ConfirmDialog
        confirmLabel="Archive access"
        description={`Archive ${archiveAction.payload?.snapshotName ?? "this Guardian"}'s access to ${edition.name}? A dedicated external account will be blocked if this is its final active Edition; central account access is unchanged.`}
        loading={archiveAction.isLoading}
        loadingLabel="Archiving..."
        onConfirm={archiveAction.confirm}
        onOpenChange={handleArchiveOpenChange}
        open={archiveAction.isOpen}
        title="Archive Guardian access?"
      />
      <ConfirmDialog
        confirmLabel="Reuse account"
        description={`A dormant external account for ${reuseAction.payload?.existingName ?? "this email"} already exists. Reuse its existing credentials and grant access to ${edition.name}?`}
        loading={reuseAction.isLoading}
        loadingLabel="Reactivating..."
        onConfirm={reuseAction.confirm}
        onOpenChange={handleReuseOpenChange}
        open={reuseAction.isOpen}
        title="Reuse dormant Guardian account?"
        variant="default"
      />
    </div>
  );
}
