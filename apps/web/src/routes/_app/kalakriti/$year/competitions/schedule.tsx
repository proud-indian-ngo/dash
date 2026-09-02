import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import type {
  CompetitionView,
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  ScheduleTableRow,
  VenueView,
} from "@/components/kalakriti/competition-config-types";
import { CompetitionSessionDetailSheet } from "@/components/kalakriti/competition-session-detail-sheet";
import {
  CompetitionSessionFormDialog,
  type CompetitionSessionFormValue,
} from "@/components/kalakriti/competition-session-form-dialog";
import { CompetitionSessionsTable } from "@/components/kalakriti/competition-sessions-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute(
  "/_app/kalakriti/$year/competitions/schedule"
)({
  component: CompetitionSchedulePage,
});

function CompetitionSchedulePage() {
  const zero = useZero();
  const {
    kalakritiCompetitionAccess: {
      canManage,
      canManageCancellations,
      structuralLocked,
    },
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const [sessions, sessionResult] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId: edition.id })
  );
  const [competitions, competitionResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id })
  );
  const [venues, venueResult] = useQuery(
    queries.kalakritiCompetition.venues({ editionId: edition.id })
  );
  const sessionViews = sessions as CompetitionSessionFormValue[];
  const competitionViews = competitions as CompetitionView[];
  const venueViews = venues as VenueView[];
  const competitionNames = new Map(
    competitionViews.map((competition) => [competition.id, competition.name])
  );
  const venueNames = new Map(venueViews.map((venue) => [venue.id, venue.name]));
  const divisions = competitionViews.flatMap((competition) =>
    competition.divisions.map((division) => ({
      ...division,
      competition,
    }))
  );
  const divisionById = new Map(
    divisions.map((division) => [division.id, division])
  );
  const rows: ScheduleTableRow[] = sessionViews.map((session) => ({
    ...session,
    ageCategoryName:
      divisionById.get(session.divisionId)?.ageCategory?.name ??
      "Unknown Age Category",
    competitionName:
      competitionNames.get(
        divisionById.get(session.divisionId)?.competitionId ?? ""
      ) ?? "Unknown Competition",
    venueName: venueNames.get(session.venueId) ?? "Unknown Venue",
  }));
  const isLoading =
    rows.length === 0 &&
    [sessionResult, competitionResult, venueResult].some(
      (result) => result.type !== "complete"
    );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const selectedSession =
    rows.find((session) => session.id === selectedSessionId) ?? null;
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] =
    useState<CompetitionSessionFormValue | null>(null);

  const deleteAction = useConfirmAction<ConfigurationDeletePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Competition Session could not be deleted",
      mutation: "kalakritiCompetition.deleteSession",
      successMsg: "Competition Session deleted",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiCompetition.deleteSession({
          auditEntryId: uuidv7(),
          id: payload.id,
          now: Date.now(),
        })
      ).server,
  });
  const stateAction = useConfirmAction<ConfigurationStatePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Failed to update Competition Session",
      mutation: "kalakritiCompetition.setSessionCancelled",
      successMsg: "Competition Session updated",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiCompetition.setSessionCancelled({
          auditEntryId: uuidv7(),
          enabled: payload.enabled,
          id: payload.id,
          now: Date.now(),
        })
      ).server,
  });

  const handleAdd = useEventCallback(() => {
    setEditingSession(null);
    setSessionDialogOpen(true);
  });
  const handleView = useEventCallback((session: ScheduleTableRow) =>
    setSelectedSessionId(session.id)
  );
  const handleEdit = useEventCallback(
    (session: CompetitionSessionFormValue) => {
      setSelectedSessionId(null);
      setEditingSession(session);
      setSessionDialogOpen(true);
    }
  );
  const handleDialogChange = useEventCallback((open: boolean) => {
    setSessionDialogOpen(open);
    if (!open) {
      setEditingSession(null);
    }
  });
  const handleSheetChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedSessionId(null);
    }
  });
  const handleDelete = useEventCallback(
    (payload: ConfigurationDeletePayload) => {
      setSelectedSessionId(null);
      deleteAction.trigger(payload);
    }
  );
  const handleSetState = useEventCallback(
    (payload: ConfigurationStatePayload) => {
      setSelectedSessionId(null);
      stateAction.trigger(payload);
    }
  );
  const closeDeleteDialog = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });
  const closeStateDialog = useEventCallback((open: boolean) => {
    if (!open) {
      stateAction.cancel();
    }
  });
  const dialogOptions = {
    divisions: divisions.map((division) => ({
      id: division.id,
      name: `${division.competition.name} · ${division.ageCategory?.name ?? "Unknown Age Category"}`,
      unavailable:
        division.competition.retiredAt !== null ||
        division.competition.cancelledAt !== null ||
        sessionViews.some((session) => session.divisionId === division.id),
    })),
    venues: venueViews.map((venue) => ({
      id: venue.id,
      name: venue.name,
      unavailable: venue.retiredAt !== null,
    })),
  };
  const canAdd =
    canManage &&
    dialogOptions.divisions.some((option) => !option.unavailable) &&
    dialogOptions.venues.some((option) => !option.unavailable);

  return (
    <div className="space-y-6">
      <CompetitionSessionsTable
        canDelete={canManage}
        canManage={canManageCancellations}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onSetState={handleSetState}
        onView={handleView}
        timeZone={edition.timezone}
        toolbarActions={
          canManage ? (
            <Button disabled={!canAdd} onClick={handleAdd} size="sm">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add Session
            </Button>
          ) : null
        }
      />

      <CompetitionSessionDetailSheet
        canDelete={canManage}
        canManage={canManageCancellations}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onOpenChange={handleSheetChange}
        onSetState={handleSetState}
        open={selectedSession !== null}
        session={selectedSession}
        timeZone={edition.timezone}
      />
      <CompetitionSessionFormDialog
        divisions={dialogOptions.divisions}
        editionId={edition.id}
        eventDate={edition.eventDate}
        onOpenChange={handleDialogChange}
        open={sessionDialogOpen}
        session={editingSession}
        sessions={sessionViews}
        structuralLocked={structuralLocked}
        timeZone={edition.timezone}
        venues={dialogOptions.venues}
      />
      <ConfirmDialog
        confirmLabel="Delete Session"
        description={`Delete ${deleteAction.payload?.name ?? "this Session"}?`}
        loading={deleteAction.isLoading}
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDeleteDialog}
        open={deleteAction.isOpen}
        title="Delete Competition Session?"
      />
      <ConfirmDialog
        confirmLabel={`Confirm ${(stateAction.payload?.action ?? "change").toLowerCase()}`}
        description={`This will ${(stateAction.payload?.action ?? "change").toLowerCase()} ${stateAction.payload?.name ?? "this Session"}.`}
        loading={stateAction.isLoading}
        onConfirm={stateAction.confirm}
        onOpenChange={closeStateDialog}
        open={stateAction.isOpen}
        title={`${stateAction.payload?.action ?? "Change"} Session?`}
      />
    </div>
  );
}
