import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { CompetitionAssignmentDialog } from "@/components/kalakriti/competition-assignment-dialog";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { VolunteerAssignmentDialog } from "@/components/kalakriti/volunteer-assignment-dialog";
import { VolunteerDetailSheet } from "@/components/kalakriti/volunteer-detail-sheet";
import {
  type RemoveAssignmentPayload,
  type VolunteerRosterItem,
  VolunteersTable,
} from "@/components/kalakriti/volunteers-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  getKalakritiVolunteersForPicker,
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
  const isEditionAdmin =
    isGlobalAdmin || actorResponsibilities.includes("edition_admin");
  const availableResponsibilities = isEditionAdmin
    ? KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES
    : (["overall_events_lead"] as const);
  const [assignOpen, setAssignOpen] = useState(false);
  const [competitionAssignOpen, setCompetitionAssignOpen] = useState(false);
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
    getKalakritiVolunteersForPicker({ data: { editionId: edition.id } })
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
  }));
  const selectedVolunteer =
    volunteerRows.find((volunteer) => volunteer.id === selectedVolunteerId) ??
    null;
  const isLoading =
    volunteerRows.length === 0 && rosterResult.type !== "complete";

  const handleAssignOpen = useEventCallback(() => setAssignOpen(true));
  const handleCompetitionAssignOpen = useEventCallback(() =>
    setCompetitionAssignOpen(true)
  );
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
        onRemove={handleRemove}
        onView={handleViewVolunteer}
        toolbarActions={
          <>
            <Button onClick={handleAssignOpen} type="button">
              Assign volunteer
            </Button>
            <Button
              onClick={handleCompetitionAssignOpen}
              type="button"
              variant="outline"
            >
              Assign competition role
            </Button>
          </>
        }
      />

      <VolunteerDetailSheet
        actorResponsibilities={actorResponsibilities}
        isGlobalAdmin={isGlobalAdmin}
        onOpenChange={handleVolunteerSheetOpenChange}
        onRemove={handleRemove}
        open={selectedVolunteer !== null}
        volunteer={selectedVolunteer}
      />
      <VolunteerAssignmentDialog
        editionId={edition.id}
        onOpenChange={setAssignOpen}
        open={assignOpen}
        pickerState={pickerState}
        responsibilities={availableResponsibilities}
        users={pickerUsers}
      />
      <CompetitionAssignmentDialog
        categories={competitionCategories}
        categoriesState={competitionCategoriesResult.type}
        competitions={competitions}
        competitionsState={competitionsResult.type}
        editionId={edition.id}
        onOpenChange={setCompetitionAssignOpen}
        open={competitionAssignOpen}
        pickerState={pickerState}
        users={pickerUsers}
      />
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
        onOpenChange={handleRemoveOpenChange}
        open={removeAction.isOpen}
        title="Remove volunteer responsibility?"
      />
    </div>
  );
}
