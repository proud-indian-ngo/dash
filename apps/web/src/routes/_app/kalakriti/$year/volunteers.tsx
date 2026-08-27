import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { KalakritiAddVolunteersDialog } from "@/components/kalakriti/kalakriti-add-volunteers-dialog";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { KalakritiRoleAssignmentDialog } from "@/components/kalakriti/kalakriti-role-assignment-dialog";
import { VolunteerDetailSheet } from "@/components/kalakriti/volunteer-detail-sheet";
import {
  type RemoveAssignmentPayload,
  type VolunteerRosterItem,
  VolunteersTable,
} from "@/components/kalakriti/volunteers-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  getKalakritiAddVolunteersForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { canManageKalakritiVolunteers } from "@/lib/kalakriti-volunteer-policy";

interface PickerData {
  editionId: string;
  state: "error" | "ready";
  users: PickerUser[];
}

interface AssignmentScope {
  id: string;
  name: string;
  retiredAt?: number | null;
}

export const Route = createFileRoute("/_app/kalakriti/$year/volunteers")({
  beforeLoad: ({ context }) => {
    if (!canManageKalakritiVolunteers(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: KalakritiVolunteersPage,
});

function resolveScopeName(
  assignment: {
    centerId: string | null;
    competitionCategoryId: string | null;
    competitionId: string | null;
  },
  centers: readonly AssignmentScope[],
  categories: readonly AssignmentScope[],
  competitions: readonly AssignmentScope[]
): string | null {
  if (assignment.centerId) {
    return (
      centers.find((center) => center.id === assignment.centerId)?.name ?? null
    );
  }
  if (assignment.competitionCategoryId) {
    return (
      categories.find(
        (category) => category.id === assignment.competitionCategoryId
      )?.name ?? null
    );
  }
  if (assignment.competitionId) {
    return (
      competitions.find(
        (competition) => competition.id === assignment.competitionId
      )?.name ?? null
    );
  }
  return null;
}

function KalakritiVolunteersPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition, isGlobalAdmin } = access;
  const actorResponsibilities = (access.membership?.responsibilities ??
    []) as KalakritiResponsibility[];
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(
    null
  );
  const [roster, rosterResult] = useQuery(
    queries.kalakritiAssignment.roster({ editionId: edition.id })
  );
  const [centers] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const [competitionCategories, competitionCategoriesResult] = useQuery(
    queries.kalakritiCompetition.categories({ editionId: edition.id })
  );
  const [competitions, competitionsResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id })
  );
  const [pickerData, setPickerData] = useState<PickerData | null>(null);
  const pickerIsCurrent =
    pickerData !== null && pickerData.editionId === edition.id;
  const pickerState = pickerIsCurrent ? pickerData.state : "loading";
  const pickerUsers = pickerIsCurrent ? pickerData.users : [];

  useEffect(() => {
    let active = true;
    getKalakritiAddVolunteersForPicker({ data: { editionId: edition.id } })
      .then((users) => {
        if (active) {
          setPickerData({ editionId: edition.id, state: "ready", users });
        }
      })
      .catch(() => {
        if (active) {
          setPickerData({ editionId: edition.id, state: "error", users: [] });
        }
      });
    return () => {
      active = false;
    };
  }, [edition.id]);

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

  const removeVolunteerAction = useConfirmAction<VolunteerRosterItem>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Failed to remove volunteer from Edition",
      mutation: "kalakritiAssignment.removeVolunteer",
      successMsg: "Volunteer removed from Edition",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiAssignment.removeVolunteer({
          auditEntryId: uuidv7(),
          membershipId: payload.id,
          now: Date.now(),
        })
      ).server,
  });

  const volunteerRows: VolunteerRosterItem[] = roster.map((membership) => ({
    assignments: membership.assignments.map((assignment) => ({
      centerId: assignment.centerId,
      competitionCategoryId: assignment.competitionCategoryId,
      competitionId: assignment.competitionId,
      id: assignment.id,
      isPrimary: assignment.isPrimary,
      responsibility: assignment.responsibility,
      scopeName: resolveScopeName(
        assignment,
        centers,
        competitionCategories,
        competitions
      ),
    })),
    id: membership.id,
    snapshotEmail: membership.snapshotEmail,
    snapshotName: membership.snapshotName,
    snapshotPhone: membership.snapshotPhone,
    userId: membership.userId as string,
    userRole: membership.user?.role ?? null,
  }));
  const selectedVolunteer =
    volunteerRows.find((volunteer) => volunteer.id === selectedVolunteerId) ??
    null;
  const isLoading =
    volunteerRows.length === 0 && rosterResult.type !== "complete";

  const handleAssignOpen = useEventCallback((userId?: string | null) => {
    setAssignUserId(userId ?? null);
    setAssignOpen(true);
  });
  const handleAssignOpenChange = useEventCallback((open: boolean) => {
    setAssignOpen(open);
    if (!open) {
      setAssignUserId(null);
    }
  });
  const handleAddOpen = useEventCallback(() => setAddOpen(true));
  const handleAddOpenChange = useEventCallback((open: boolean) => {
    setAddOpen(open);
  });
  const handleViewVolunteer = useEventCallback(
    (volunteer: VolunteerRosterItem) => {
      setSelectedVolunteerId(volunteer.id);
    }
  );
  const handleVolunteerSheetOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedVolunteerId(null);
    }
  });
  const handleRemoveOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      removeAction.cancel();
    }
  });
  const handleRemove = useEventCallback((payload: RemoveAssignmentPayload) => {
    setSelectedVolunteerId(null);
    removeAction.trigger(payload);
  });
  const handleRemoveFromEdition = useEventCallback(
    (volunteer: VolunteerRosterItem) => {
      setSelectedVolunteerId(null);
      removeVolunteerAction.trigger(volunteer);
    }
  );
  const handleRemoveFromEditionOpenChange = useEventCallback(
    (open: boolean) => {
      if (!open) {
        removeVolunteerAction.cancel();
      }
    }
  );
  const handleAssignFromSheet = useEventCallback(
    (volunteer: VolunteerRosterItem) => {
      setSelectedVolunteerId(null);
      handleAssignOpen(volunteer.userId);
    }
  );

  if (volunteerRows.length === 0 && rosterResult.type === "error") {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
        <p role="alert">Volunteers could not be loaded.</p>
        <Button onClick={rosterResult.retry} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Volunteers"
      />

      <VolunteersTable
        actorResponsibilities={actorResponsibilities}
        data={volunteerRows}
        isGlobalAdmin={isGlobalAdmin}
        isLoading={isLoading}
        onAssignRole={handleAssignFromSheet}
        onRemove={handleRemove}
        onRemoveFromEdition={handleRemoveFromEdition}
        onView={handleViewVolunteer}
        toolbarActions={
          <Button onClick={handleAddOpen} type="button">
            Add volunteers
          </Button>
        }
      />

      <VolunteerDetailSheet
        actorResponsibilities={actorResponsibilities}
        isGlobalAdmin={isGlobalAdmin}
        onAssign={handleAssignFromSheet}
        onOpenChange={handleVolunteerSheetOpenChange}
        onRemove={handleRemove}
        onRemoveFromEdition={handleRemoveFromEdition}
        open={selectedVolunteer !== null}
        volunteer={selectedVolunteer}
      />
      <KalakritiAddVolunteersDialog
        editionId={edition.id}
        excludeUserIds={new Set(volunteerRows.map((row) => row.userId))}
        onOpenChange={handleAddOpenChange}
        open={addOpen}
        pickerState={pickerState}
        users={pickerUsers}
      />
      <KalakritiRoleAssignmentDialog
        actorResponsibilities={actorResponsibilities}
        categories={competitionCategories}
        categoriesState={competitionCategoriesResult.type}
        centers={centers}
        competitions={competitions}
        competitionsState={competitionsResult.type}
        editionId={edition.id}
        initialUserId={assignUserId}
        isGlobalAdmin={isGlobalAdmin}
        lockedVolunteerName={
          volunteerRows.find((row) => row.userId === assignUserId)
            ?.snapshotName ?? null
        }
        onOpenChange={handleAssignOpenChange}
        open={assignOpen}
        pickerState="ready"
        users={[]}
      />
      <ConfirmDialog
        confirmLabel="Remove responsibility"
        description={
          removeAction.payload?.isFinalAssignment
            ? `This is ${removeAction.payload.volunteerName}'s final responsibility. They stay on the Edition roster as Unassigned.`
            : `Remove ${KALAKRITI_RESPONSIBILITY_LABELS[removeAction.payload?.responsibility ?? "overall_events_lead"]} from ${removeAction.payload?.volunteerName ?? "this volunteer"}?`
        }
        loading={removeAction.isLoading}
        loadingLabel="Removing..."
        onConfirm={removeAction.confirm}
        onOpenChange={handleRemoveOpenChange}
        open={removeAction.isOpen}
        title="Remove volunteer responsibility?"
      />
      <ConfirmDialog
        confirmLabel="Remove from Edition"
        description={`Remove ${removeVolunteerAction.payload?.snapshotName ?? "this volunteer"} from this Edition? They lose linked-event access.`}
        loading={removeVolunteerAction.isLoading}
        loadingLabel="Removing..."
        onConfirm={removeVolunteerAction.confirm}
        onOpenChange={handleRemoveFromEditionOpenChange}
        open={removeVolunteerAction.isOpen}
        title="Remove volunteer from Edition?"
      />
    </div>
  );
}
