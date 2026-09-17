import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "@pi-dash/design-system/components/reui/alert";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import type {
  CompetitionCategoryView,
  CompetitionTableRow,
  CompetitionView,
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
} from "@/components/kalakriti/competition-config-types";
import { CompetitionDetailSheet } from "@/components/kalakriti/competition-detail-sheet";
import { CompetitionEntries } from "@/components/kalakriti/competition-entries";
import {
  CompetitionFormDialog,
  type CompetitionFormValue,
} from "@/components/kalakriti/competition-form-dialog";
import { CompetitionPageSummary } from "@/components/kalakriti/competition-page-summary";
import { CompetitionReadinessSummary } from "@/components/kalakriti/competition-readiness-summary";
import { CompetitionsTable } from "@/components/kalakriti/competitions-table";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { useResultSnapshot } from "@/components/kalakriti/use-result-snapshot";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { getKalakritiCompetitionStatuses } from "@/functions/kalakriti-competition-status";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { dashboardAccessKey } from "@/lib/kalakriti-dashboard";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/kalakriti/$year/competitions/")({
  component: CompetitionCatalogPage,
  validateSearch: z.object({
    center: z.string().optional(),
    competition: z.string().optional(),
  }),
  loader: ({ context, abortController }) => {
    const editionId = context.kalakritiEditionAccess.edition.id;
    preloadRouteQuery(
      context.zero,
      queries.kalakritiEntry.visible({ editionId }),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.kalakritiEntry.availableDivisions({ editionId }),
      abortController.signal
    );
  },
});

function CompetitionCatalogPage() {
  const zero = useZero();
  const { center, competition: selectedDivisionId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const {
    kalakritiCompetitionAccess: {
      canManage,
      canViewConfiguration,
      canEditSchedule,
      canManageCancellations,
      structuralLocked,
    },
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const { user } = useApp();
  const statuses = useResultSnapshot(
    dashboardAccessKey(access, user.id),
    () => getKalakritiCompetitionStatuses({ data: { year: edition.year } }),
    !selectedDivisionId
  );
  const statusByDivision = new Map(
    statuses.data?.map((row) => [row.divisionId, row.status])
  );
  const [categories, categoryResult] = useQuery(
    queries.kalakritiCompetition.categories({ editionId: edition.id }),
    { enabled: canViewConfiguration }
  );
  const [competitions, competitionResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id }),
    { enabled: canViewConfiguration }
  );
  const [ageCategories, ageCategoryResult] = useQuery(
    queries.kalakritiEligibility.ageCategories({ editionId: edition.id }),
    { enabled: canEditSchedule }
  );
  const [venues, venueResult] = useQuery(
    queries.kalakritiCompetition.venues({ editionId: edition.id }),
    { enabled: canViewConfiguration }
  );
  const [schedule, scheduleResult] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId: edition.id }),
    { enabled: canViewConfiguration }
  );
  const [divisions, divisionResult] = useQuery(
    queries.kalakritiEntry.availableDivisions({ editionId: edition.id })
  );
  const [entries, entryResult] = useQuery(
    queries.kalakritiEntry.visible({ editionId: edition.id })
  );
  const categoryViews = categories as CompetitionCategoryView[];
  const categoryNames = new Map(
    categoryViews.map((category) => [category.id, category.name])
  );
  const visibleDivisions = [
    ...new Map(
      [
        ...divisions,
        ...entries.flatMap((entry) => (entry.division ? [entry.division] : [])),
      ].map((division) => [division.id, division])
    ).values(),
  ];
  const competitionViews: CompetitionView[] = canViewConfiguration
    ? competitions.map((competition) => ({
        ...competition,
        musicUploadEnabled: competition.musicUploadEnabled === true,
      }))
    : [
        ...new Map(
          visibleDivisions.flatMap((division) =>
            division.competition
              ? [[division.competition.id, division.competition] as const]
              : []
          )
        ).values(),
      ].map((competition) => ({
        ...competition,
        musicUploadEnabled: competition.musicUploadEnabled === true,
        divisions: visibleDivisions.filter(
          (division) => division.competition?.id === competition.id
        ),
      }));
  const countsReady =
    entryResult.type === "complete" &&
    (canViewConfiguration
      ? scheduleResult.type === "complete"
      : divisionResult.type === "complete");
  const scheduleFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        timeZone: edition.timezone,
        hour: "numeric",
        hour12: true,
        minute: "2-digit",
      }),
    [edition.timezone]
  );
  const rows: CompetitionTableRow[] = competitionViews.flatMap(
    (competition) => {
      const categoryName =
        categoryNames.get(competition.competitionCategoryId) ??
        visibleDivisions.find(
          (division) => division.competition?.id === competition.id
        )?.competition?.category?.name ??
        "Category unavailable";
      return (
        competition.divisions.length ? competition.divisions : [undefined]
      ).map((division) => {
        const session = canViewConfiguration
          ? schedule.find((item) => item.divisionId === division?.id)
          : visibleDivisions.find((item) => item.id === division?.id)
              ?.sessions[0];
        const visibleSession = visibleDivisions.find(
          (item) => item.id === division?.id
        )?.sessions[0];
        return {
          ...competition,
          categoryName,
          divisionId: division?.id,
          status: division
            ? statusByDivision.get(division.id)
            : "not_scheduled",
          ageCategoryId: division?.ageCategoryId,
          ageCategoryName: division?.ageCategory?.name ?? "No age category",
          venueName: session
            ? (venues.find((venue) => venue.id === session.venueId)?.name ??
              visibleSession?.venue?.name ??
              "Venue unavailable")
            : "Not scheduled",
          scheduleLabel: session
            ? `${scheduleFormatter.format(session.startAt)} – ${scheduleFormatter.format(session.endAt)}`
            : "Not scheduled",
          entryCount: countsReady
            ? entries.filter((entry) => entry.divisionId === division?.id)
                .length
            : undefined,
          scheduledDivisions: countsReady
            ? Number(Boolean(session && session.cancelledAt === null))
            : undefined,
        };
      });
    }
  );
  const editorReady =
    canEditSchedule &&
    [ageCategoryResult, categoryResult, venueResult, scheduleResult].every(
      (result) => result.type === "complete"
    );
  const pageResults = canViewConfiguration
    ? [
        competitionResult,
        categoryResult,
        scheduleResult,
        venueResult,
        entryResult,
      ]
    : [divisionResult, entryResult];
  const isLoading =
    rows.length === 0 &&
    pageResults.some((result) => result.type !== "complete");
  const summaryError = pageResults.some((result) => result.type === "error");
  const summaryLoading = pageResults.some(
    (result) => result.type !== "complete"
  );
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<
    string | null
  >(null);
  const selectedCompetition =
    rows.find((competition) => competition.id === selectedCompetitionId) ??
    null;
  const [competitionDialogOpen, setCompetitionDialogOpen] = useState(false);
  const [editingCompetition, setEditingCompetition] =
    useState<CompetitionFormValue | null>(null);

  const deleteAction = useConfirmAction<ConfigurationDeletePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Configuration is referenced or could not be deleted",
      mutation: "kalakritiCompetition.delete",
      successMsg: "Configuration deleted",
    },
    onConfirm: (payload) => {
      const args = {
        auditEntryId: uuidv7(),
        id: payload.id,
        now: Date.now(),
      };
      return zero.mutate(
        payload.kind === "session"
          ? mutators.kalakritiCompetition.deleteSession(args)
          : mutators.kalakritiCompetition.deleteCompetition(args)
      ).server;
    },
  });
  const stateAction = useConfirmAction<ConfigurationStatePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Failed to update configuration state",
      mutation: "kalakritiCompetition.setState",
      successMsg: "Configuration state updated",
    },
    onConfirm: (payload) => {
      const args = {
        auditEntryId: uuidv7(),
        enabled: payload.enabled,
        id: payload.id,
        now: Date.now(),
      };
      if (payload.kind === "session_cancelled")
        return zero.mutate(
          mutators.kalakritiCompetition.setSessionCancelled(args)
        ).server;
      if (payload.kind === "competition_cancelled") {
        return zero.mutate(
          mutators.kalakritiCompetition.setCompetitionCancelled(args)
        ).server;
      }
      return zero.mutate(
        mutators.kalakritiCompetition.setCompetitionRetired(args)
      ).server;
    },
  });

  const handleAddCompetition = useEventCallback(() => {
    setEditingCompetition(null);
    setCompetitionDialogOpen(true);
  });
  const handleViewCompetition = useEventCallback(
    (competition: CompetitionTableRow) => {
      if (competition.divisionId) {
        void navigate({
          search: { center, competition: competition.divisionId },
        });
      } else {
        setSelectedCompetitionId(competition.id);
      }
    }
  );
  const handleViewConfiguration = useEventCallback(
    (competition: CompetitionTableRow) =>
      setSelectedCompetitionId(competition.id)
  );
  const handleBack = useEventCallback(() => {
    void navigate({ search: { center } });
  });
  const handleEditCompetition = useEventCallback(
    (competition: CompetitionFormValue) => {
      setSelectedCompetitionId(null);
      setEditingCompetition(competition);
      setCompetitionDialogOpen(true);
    }
  );
  const handleCompetitionDialogChange = useEventCallback((open: boolean) => {
    setCompetitionDialogOpen(open);
    if (!open) {
      setEditingCompetition(null);
    }
  });
  const handleSheetChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedCompetitionId(null);
    }
  });
  const handleDelete = useEventCallback(
    (payload: ConfigurationDeletePayload) => {
      setSelectedCompetitionId(null);
      deleteAction.trigger(payload);
    }
  );
  const handleSetState = useEventCallback(
    (payload: ConfigurationStatePayload) => {
      setSelectedCompetitionId(null);
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

  if (selectedDivisionId) {
    return (
      <CompetitionEntries
        key={selectedDivisionId}
        access={access}
        divisionId={selectedDivisionId}
        year={String(edition.year)}
        center={center}
        onBack={handleBack}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Competitions"
        meta={
          <p>
            Each age-specific Competition is listed separately. Open a row to
            manage its Entries and results.
          </p>
        }
      />
      <CompetitionPageSummary
        error={summaryError}
        isLoading={summaryLoading}
        metrics={[
          {
            label: "Active",
            value: rows.filter(
              (competition) =>
                competition.cancelledAt === null &&
                competition.retiredAt === null
            ).length,
          },
          {
            label: "Cancelled",
            value: rows.filter(
              (competition) => competition.cancelledAt !== null
            ).length,
          },
          {
            label: "Retired",
            value: rows.filter(
              (competition) =>
                competition.cancelledAt === null &&
                competition.retiredAt !== null
            ).length,
          },
          {
            label: "Active without Divisions",
            value: rows.filter(
              (competition) =>
                competition.cancelledAt === null &&
                competition.retiredAt === null &&
                competition.divisions.length === 0
            ).length,
          },
        ]}
        onRetry={() => {
          for (const result of pageResults)
            if (result.type === "error") result.retry();
        }}
        title="Competition status"
      />
      {structuralLocked && canViewConfiguration ? (
        <KalakritiLockNotice>
          {edition.lifecycle === "registration_locked" ||
          edition.lifecycle === "live"
            ? "Competition structure is locked. Existing Competitions can still be cancelled or restored; schedule editing follows the Edition phase."
            : `Configuration is locked while this Edition is ${edition.lifecycle}.`}
        </KalakritiLockNotice>
      ) : null}

      {statuses.error ||
      (statuses.data && !statuses.fresh) ||
      statuses.data === null ? (
        <Alert>
          <AlertTitle>
            {statuses.data
              ? "Competition statuses may be out of date"
              : "Competition statuses unavailable"}
          </AlertTitle>
          <AlertDescription>
            Refresh to check attendance and published results.
          </AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void statuses.refresh()}
            >
              Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <CompetitionsTable
        canManageCancellations={canManageCancellations}
        canEdit={editorReady}
        canManageStructure={canManage}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEditCompetition}
        onSetState={handleSetState}
        onView={handleViewCompetition}
        onDetails={handleViewConfiguration}
        toolbarActions={
          canManage ? (
            <Button
              disabled={
                categoryViews.length === 0 ||
                ageCategoryResult.type !== "complete" ||
                venueResult.type !== "complete"
              }
              onClick={handleAddCompetition}
              size="sm"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add Competition
            </Button>
          ) : null
        }
      />

      {canViewConfiguration ? (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="outline" />}>
            Readiness and results
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <CompetitionReadinessSummary access={access} />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <CompetitionDetailSheet
        editionId={edition.id}
        year={edition.year}
        center={center}
        availableDivisionIds={divisions.map((division) => division.id)}
        timeZone={edition.timezone}
        sessions={
          canViewConfiguration
            ? schedule.map((session) => ({
                ...session,
                venueName:
                  venues.find((venue) => venue.id === session.venueId)?.name ??
                  "Venue unavailable",
              }))
            : visibleDivisions.flatMap((division) =>
                division.sessions.map((session) => ({
                  ...session,
                  venueName: session.venue?.name ?? "Venue unavailable",
                }))
              )
        }
        entries={entries}
        countsReady={countsReady}
        canViewJudges={canViewConfiguration}
        canManageCancellations={canManageCancellations}
        canEdit={editorReady}
        canManageStructure={canManage}
        competition={selectedCompetition}
        onDelete={handleDelete}
        onEdit={handleEditCompetition}
        onOpenChange={handleSheetChange}
        onSetState={handleSetState}
        open={selectedCompetition !== null}
      />
      <CompetitionFormDialog
        ageCategories={ageCategories}
        categories={categoryViews}
        competition={editingCompetition}
        editionId={edition.id}
        eventDate={edition.eventDate}
        timeZone={edition.timezone}
        sessions={schedule}
        venues={venues}
        structuralLocked={structuralLocked}
        onOpenChange={handleCompetitionDialogChange}
        open={competitionDialogOpen}
      />
      <ConfirmDialog
        confirmLabel="Delete"
        description={`Delete ${deleteAction.payload?.name ?? "this configuration"}? Referenced records must be retired or cancelled instead.`}
        loading={deleteAction.isLoading}
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDeleteDialog}
        open={deleteAction.isOpen}
        title="Delete configuration?"
      />
      <ConfirmDialog
        confirmLabel={`Confirm ${(stateAction.payload?.action ?? "change").toLowerCase()}`}
        description={`This will ${(stateAction.payload?.action ?? "change").toLowerCase()} ${stateAction.payload?.name ?? "this configuration"}.`}
        loading={stateAction.isLoading}
        onConfirm={stateAction.confirm}
        onOpenChange={closeStateDialog}
        open={stateAction.isOpen}
        title={`${stateAction.payload?.action ?? "Change"} ${stateAction.payload?.name ?? "configuration"}?`}
      />
    </div>
  );
}
