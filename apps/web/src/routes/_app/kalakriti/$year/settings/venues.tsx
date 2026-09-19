import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import type {
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  VenueTableRow,
  VenueView,
} from "@/components/kalakriti/competition-config-types";
import { CompetitionPageSummary } from "@/components/kalakriti/competition-page-summary";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { VenueDetailSheet } from "@/components/kalakriti/venue-detail-sheet";
import {
  VenueFormDialog,
  type VenueFormValue,
} from "@/components/kalakriti/venue-form-dialog";
import { VenuesTable } from "@/components/kalakriti/venues-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { countScheduledSessionsByVenue } from "@/lib/kalakriti-competition-page-metrics";

export const Route = createFileRoute("/_app/kalakriti/$year/settings/venues")({
  component: VenuesPage,
});

function VenuesPage() {
  const zero = useZero();
  const { setQuery } = useDataTableFilters();
  const {
    kalakritiCompetitionAccess: { canEditVenues, canManage, structuralLocked },
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const [venues, venueResult] = useQuery(
    queries.kalakritiCompetition.venues({ editionId: edition.id })
  );
  const [sessions, sessionResult] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId: edition.id })
  );
  const venueViews = venues as VenueView[];
  const sessionCounts = countScheduledSessionsByVenue(sessions);
  const rows: VenueTableRow[] = venueViews.map((venue) => ({
    ...venue,
    sessionCount: sessionCounts.get(venue.id) ?? 0,
  }));
  const isLoading = rows.length === 0 && venueResult.type !== "complete";
  const summaryLoading =
    venueResult.type !== "complete" || sessionResult.type !== "complete";
  const summaryError =
    venueResult.type === "error" || sessionResult.type === "error";
  const retrySummary = () => {
    if (venueResult.type === "error") venueResult.retry();
    if (sessionResult.type === "error") sessionResult.retry();
  };
  const activeVenues = rows.filter((venue) => venue.retiredAt === null);
  const unusedVenues = activeVenues.filter((venue) => venue.sessionCount === 0);
  const showUnused = () =>
    setQuery(
      createFilterQuery<unknown>([
        createFilterRule<unknown>({
          id: "venue-active",
          path: ["status"],
          operator: "is",
          value: "Active",
        }),
        createFilterRule<unknown>({
          id: "venue-unused",
          path: ["sessionCount"],
          operator: "eq",
          value: 0,
        }),
      ])
    );
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const selectedVenue =
    rows.find((venue) => venue.id === selectedVenueId) ?? null;
  const [venueDialogOpen, setVenueDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueFormValue | null>(null);

  const deleteAction = useConfirmAction<ConfigurationDeletePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Venue is referenced or could not be deleted",
      mutation: "kalakritiCompetition.deleteVenue",
      successMsg: "Venue deleted",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiCompetition.deleteVenue({
          auditEntryId: uuidv7(),
          id: payload.id,
          now: Date.now(),
        })
      ).server,
  });
  const stateAction = useConfirmAction<ConfigurationStatePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Failed to update Venue state",
      mutation: "kalakritiCompetition.setVenueRetired",
      successMsg: "Venue state updated",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiCompetition.setVenueRetired({
          auditEntryId: uuidv7(),
          enabled: payload.enabled,
          id: payload.id,
          now: Date.now(),
        })
      ).server,
  });

  const handleAdd = useEventCallback(() => {
    setEditingVenue(null);
    setVenueDialogOpen(true);
  });
  const handleView = useEventCallback((venue: VenueTableRow) =>
    setSelectedVenueId(venue.id)
  );
  const handleEdit = useEventCallback((venue: VenueFormValue) => {
    setSelectedVenueId(null);
    setEditingVenue(venue);
    setVenueDialogOpen(true);
  });
  const handleDialogChange = useEventCallback((open: boolean) => {
    setVenueDialogOpen(open);
    if (!open) {
      setEditingVenue(null);
    }
  });
  const handleSheetChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedVenueId(null);
    }
  });
  const handleDelete = useEventCallback(
    (payload: ConfigurationDeletePayload) => {
      setSelectedVenueId(null);
      deleteAction.trigger(payload);
    }
  );
  const handleSetState = useEventCallback(
    (payload: ConfigurationStatePayload) => {
      setSelectedVenueId(null);
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

  return (
    <div className="space-y-6">
      <CompetitionPageSummary
        error={summaryError}
        isLoading={summaryLoading}
        metrics={[
          { label: "Active Venues", value: activeVenues.length },
          {
            label: "Unused Active Venues",
            onClick: showUnused,
            value: unusedVenues.length,
          },
          {
            label: "Scheduled Sessions",
            value: rows.reduce((total, venue) => total + venue.sessionCount, 0),
          },
          {
            label: "Retired Venues",
            value: rows.length - activeVenues.length,
          },
        ]}
        onRetry={retrySummary}
        title="Venue coverage"
      />
      {structuralLocked && canEditVenues ? (
        <KalakritiLockNotice>
          Venue names can still be added and corrected. Retiring or deleting
          Venues is locked while this Edition is {edition.lifecycle}.
        </KalakritiLockNotice>
      ) : null}
      <VenuesTable
        canEdit={canEditVenues}
        canManage={canManage}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onSetState={handleSetState}
        onView={handleView}
        toolbarActions={
          canEditVenues ? (
            <Button onClick={handleAdd} size="sm">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add Venue
            </Button>
          ) : null
        }
      />

      <VenueDetailSheet
        canEdit={canEditVenues}
        canManage={canManage}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onOpenChange={handleSheetChange}
        onSetState={handleSetState}
        open={selectedVenue !== null}
        venue={selectedVenue}
      />
      <VenueFormDialog
        editionId={edition.id}
        onOpenChange={handleDialogChange}
        open={venueDialogOpen}
        venue={editingVenue}
      />
      <ConfirmDialog
        confirmLabel="Delete Venue"
        description={`Delete ${deleteAction.payload?.name ?? "this Venue"}? Scheduled Venues must be retired instead.`}
        loading={deleteAction.isLoading}
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDeleteDialog}
        open={deleteAction.isOpen}
        title="Delete Venue?"
      />
      <ConfirmDialog
        confirmLabel={`Confirm ${(stateAction.payload?.action ?? "change").toLowerCase()}`}
        description={`This will ${(stateAction.payload?.action ?? "change").toLowerCase()} ${stateAction.payload?.name ?? "this Venue"}.`}
        loading={stateAction.isLoading}
        onConfirm={stateAction.confirm}
        onOpenChange={closeStateDialog}
        open={stateAction.isOpen}
        title={`${stateAction.payload?.action ?? "Change"} Venue?`}
      />
    </div>
  );
}
