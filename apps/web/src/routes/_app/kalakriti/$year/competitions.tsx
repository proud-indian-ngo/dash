import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  CompetitionCategoryFormDialog,
  type CompetitionCategoryFormValue,
} from "@/components/kalakriti/competition-category-form-dialog";
import {
  CompetitionCatalogSection,
  type CompetitionCategoryView,
  type CompetitionView,
  type ConfigurationDeletePayload,
  type ConfigurationStatePayload,
  ScheduleSection,
  VenueSection,
  type VenueView,
} from "@/components/kalakriti/competition-configuration-sections";
import {
  CompetitionFormDialog,
  type CompetitionFormValue,
} from "@/components/kalakriti/competition-form-dialog";
import {
  CompetitionSessionFormDialog,
  type CompetitionSessionFormValue,
} from "@/components/kalakriti/competition-session-form-dialog";
import {
  VenueFormDialog,
  type VenueFormValue,
} from "@/components/kalakriti/venue-form-dialog";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute("/_app/kalakriti/$year/competitions")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (access.edition.lifecycle === "archived" && !access.isGlobalAdmin) {
      throw notFound();
    }
    const canView =
      access.isGlobalAdmin ||
      access.membership?.responsibilities.some(
        (responsibility) =>
          responsibility === "edition_admin" ||
          responsibility === "overall_events_lead" ||
          responsibility === "competition_category_lead"
      );
    if (!canView) {
      throw notFound();
    }
  },
  component: KalakritiCompetitionsPage,
});

function KalakritiCompetitionsPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [categories, categoryResult] = useQuery(
    queries.kalakritiCompetition.categories({ editionId: edition.id })
  );
  const [competitions, competitionResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id })
  );
  const [venues, venueResult] = useQuery(
    queries.kalakritiCompetition.venues({ editionId: edition.id })
  );
  const [sessions, sessionResult] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId: edition.id })
  );
  const [ageCategories, ageCategoryResult] = useQuery(
    queries.kalakritiEligibility.ageCategories({ editionId: edition.id })
  );
  const responsibilities = access.membership?.responsibilities ?? [];
  const actorCanManage =
    access.isGlobalAdmin ||
    responsibilities.includes("edition_admin") ||
    responsibilities.includes("overall_events_lead");
  const fullyLocked =
    edition.lifecycle === "live" || edition.lifecycle === "archived";
  const structuralLocked =
    edition.lifecycle === "registration_locked" || fullyLocked;
  const canManage = actorCanManage && !structuralLocked;
  const canManageCancellations = actorCanManage && !fullyLocked;

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CompetitionCategoryFormValue | null>(null);
  const [competitionDialogOpen, setCompetitionDialogOpen] = useState(false);
  const [editingCompetition, setEditingCompetition] =
    useState<CompetitionFormValue | null>(null);
  const [venueDialogOpen, setVenueDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueFormValue | null>(null);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] =
    useState<CompetitionSessionFormValue | null>(null);

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
      if (payload.kind === "category") {
        return zero.mutate(mutators.kalakritiCompetition.deleteCategory(args))
          .server;
      }
      if (payload.kind === "competition") {
        return zero.mutate(
          mutators.kalakritiCompetition.deleteCompetition(args)
        ).server;
      }
      if (payload.kind === "venue") {
        return zero.mutate(mutators.kalakritiCompetition.deleteVenue(args))
          .server;
      }
      return zero.mutate(mutators.kalakritiCompetition.deleteSession(args))
        .server;
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
      if (payload.kind === "category_retired") {
        return zero.mutate(
          mutators.kalakritiCompetition.setCategoryRetired(args)
        ).server;
      }
      if (payload.kind === "competition_cancelled") {
        return zero.mutate(
          mutators.kalakritiCompetition.setCompetitionCancelled(args)
        ).server;
      }
      if (payload.kind === "competition_retired") {
        return zero.mutate(
          mutators.kalakritiCompetition.setCompetitionRetired(args)
        ).server;
      }
      if (payload.kind === "venue_retired") {
        return zero.mutate(mutators.kalakritiCompetition.setVenueRetired(args))
          .server;
      }
      return zero.mutate(
        mutators.kalakritiCompetition.setSessionCancelled(args)
      ).server;
    },
  });

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
  const handleAddCategory = useEventCallback(() => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  });
  const handleEditCategory = useEventCallback(
    (category: CompetitionCategoryFormValue) => {
      setEditingCategory(category);
      setCategoryDialogOpen(true);
    }
  );
  const handleCategoryDialogChange = useEventCallback((open: boolean) => {
    setCategoryDialogOpen(open);
    if (!open) {
      setEditingCategory(null);
    }
  });
  const handleAddCompetition = useEventCallback(() => {
    setEditingCompetition(null);
    setCompetitionDialogOpen(true);
  });
  const handleEditCompetition = useEventCallback(
    (competition: CompetitionFormValue) => {
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
  const handleAddVenue = useEventCallback(() => {
    setEditingVenue(null);
    setVenueDialogOpen(true);
  });
  const handleEditVenue = useEventCallback((venue: VenueFormValue) => {
    setEditingVenue(venue);
    setVenueDialogOpen(true);
  });
  const handleVenueDialogChange = useEventCallback((open: boolean) => {
    setVenueDialogOpen(open);
    if (!open) {
      setEditingVenue(null);
    }
  });
  const handleAddSession = useEventCallback(() => {
    setEditingSession(null);
    setSessionDialogOpen(true);
  });
  const handleEditSession = useEventCallback(
    (session: CompetitionSessionFormValue) => {
      setEditingSession(session);
      setSessionDialogOpen(true);
    }
  );
  const handleSessionDialogChange = useEventCallback((open: boolean) => {
    setSessionDialogOpen(open);
    if (!open) {
      setEditingSession(null);
    }
  });
  const retryQueries = useEventCallback(() => {
    for (const result of [
      categoryResult,
      competitionResult,
      venueResult,
      sessionResult,
      ageCategoryResult,
    ]) {
      if (result.type === "error") {
        result.retry();
      }
    }
  });

  const queryResults = [
    categoryResult,
    competitionResult,
    venueResult,
    sessionResult,
    ageCategoryResult,
  ];
  if (queryResults.some((result) => result.type === "error")) {
    return (
      <div className="space-y-3 pt-6" role="alert">
        <p className="font-medium">
          Competition configuration could not be loaded.
        </p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
        <Button onClick={retryQueries} variant="outline">
          Retry
        </Button>
      </div>
    );
  }
  if (queryResults.some((result) => result.type !== "complete")) {
    return (
      <div
        aria-label="Loading Competition configuration"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }

  const categoryViews = categories as CompetitionCategoryView[];
  const competitionViews = competitions as CompetitionView[];
  const venueViews = venues as VenueView[];
  const sessionViews = sessions as CompetitionSessionFormValue[];
  const nextCategorySortOrder =
    categoryViews.reduce(
      (maximum, category) => Math.max(maximum, category.sortOrder),
      -1
    ) + 1;
  const ageCategoryNames = new Map(
    ageCategories.map((category) => [category.id, category.name])
  );
  const competitionNames = new Map(
    competitionViews.map((competition) => [competition.id, competition.name])
  );
  const venueNames = new Map(venueViews.map((venue) => [venue.id, venue.name]));
  const dialogOptions = {
    ageCategories: ageCategories.map((category) => ({
      id: category.id,
      name: category.name,
      unavailable: false,
    })),
    competitions: competitionViews.map((competition) => ({
      id: competition.id,
      name: competition.name,
      unavailable:
        competition.retiredAt !== null || competition.cancelledAt !== null,
    })),
    venues: venueViews.map((venue) => ({
      id: venue.id,
      name: venue.name,
      unavailable: venue.retiredAt !== null,
    })),
  };

  return (
    <div className="space-y-10 pt-6">
      <div>
        <h2 className="font-display font-semibold text-2xl">
          Competitions and schedule
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {actorCanManage
            ? "Configure the Competition catalog, Venues, and one-day schedule."
            : "Read-only configuration for your assigned Competition Categories."}
        </p>
        {structuralLocked ? (
          <p className="mt-2 text-muted-foreground text-sm">
            {edition.lifecycle === "registration_locked"
              ? "Competition, Category, Venue, and Session structure is locked. You can still update existing Session times and Venues, or cancel and restore Competitions and Sessions."
              : `Configuration is locked while this Edition is ${edition.lifecycle}.`}
          </p>
        ) : null}
      </div>

      <CompetitionCatalogSection
        canManage={canManage}
        canManageCancellations={canManageCancellations}
        categories={categoryViews}
        competitions={competitionViews}
        onAddCategory={handleAddCategory}
        onAddCompetition={handleAddCompetition}
        onDelete={deleteAction.trigger}
        onEditCategory={handleEditCategory}
        onEditCompetition={handleEditCompetition}
        onSetState={stateAction.trigger}
      />
      <VenueSection
        canManage={canManage}
        onAdd={handleAddVenue}
        onDelete={deleteAction.trigger}
        onEdit={handleEditVenue}
        onSetState={stateAction.trigger}
        venues={venueViews}
      />
      <ScheduleSection
        ageCategoryNames={ageCategoryNames}
        canManage={canManageCancellations}
        competitionNames={competitionNames}
        onAdd={handleAddSession}
        onDelete={deleteAction.trigger}
        onEdit={handleEditSession}
        onSetState={stateAction.trigger}
        sessions={sessionViews}
        structuralLocked={structuralLocked}
        timeZone={edition.timezone}
        venueNames={venueNames}
      />

      <CompetitionCategoryFormDialog
        category={editingCategory}
        editionId={edition.id}
        nextSortOrder={nextCategorySortOrder}
        onOpenChange={handleCategoryDialogChange}
        open={categoryDialogOpen}
      />
      <CompetitionFormDialog
        categories={categoryViews}
        competition={editingCompetition}
        editionId={edition.id}
        onOpenChange={handleCompetitionDialogChange}
        open={competitionDialogOpen}
      />
      <VenueFormDialog
        editionId={edition.id}
        onOpenChange={handleVenueDialogChange}
        open={venueDialogOpen}
        venue={editingVenue}
      />
      <CompetitionSessionFormDialog
        ageCategories={dialogOptions.ageCategories}
        competitions={dialogOptions.competitions}
        editionId={edition.id}
        eventDate={edition.eventDate}
        onOpenChange={handleSessionDialogChange}
        open={sessionDialogOpen}
        session={editingSession}
        sessions={sessionViews}
        structuralLocked={edition.lifecycle === "registration_locked"}
        timeZone={edition.timezone}
        venues={dialogOptions.venues}
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
