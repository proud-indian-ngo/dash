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
  CompetitionCategoryView,
  CompetitionTableRow,
  CompetitionView,
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
} from "@/components/kalakriti/competition-config-types";
import { CompetitionDetailSheet } from "@/components/kalakriti/competition-detail-sheet";
import {
  CompetitionFormDialog,
  type CompetitionFormValue,
} from "@/components/kalakriti/competition-form-dialog";
import { CompetitionsTable } from "@/components/kalakriti/competitions-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute(
  "/_app/kalakriti/$year/competitions/catalog"
)({
  component: CompetitionCatalogPage,
});

function CompetitionCatalogPage() {
  const zero = useZero();
  const {
    kalakritiCompetitionAccess: {
      actorCanManage,
      canManage,
      canManageCancellations,
      structuralLocked,
    },
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const [categories, categoryResult] = useQuery(
    queries.kalakritiCompetition.categories({ editionId: edition.id })
  );
  const [competitions, competitionResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id })
  );
  const categoryViews = categories as CompetitionCategoryView[];
  const competitionViews = competitions as CompetitionView[];
  const categoryNames = new Map(
    categoryViews.map((category) => [category.id, category.name])
  );
  const rows: CompetitionTableRow[] = competitionViews.map((competition) => ({
    ...competition,
    categoryName:
      categoryNames.get(competition.competitionCategoryId) ??
      "Unknown Category",
  }));
  const isLoading =
    rows.length === 0 &&
    (categoryResult.type !== "complete" ||
      competitionResult.type !== "complete");
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
      return zero.mutate(mutators.kalakritiCompetition.deleteCompetition(args))
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
    (competition: CompetitionTableRow) =>
      setSelectedCompetitionId(competition.id)
  );
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-semibold text-2xl">Competitions</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {actorCanManage
            ? "Manage participation rules and Competition lifecycle."
            : "Read-only Competitions in your assigned Categories."}
        </p>
        {structuralLocked ? (
          <p className="mt-2 text-muted-foreground text-sm">
            {edition.lifecycle === "registration_locked"
              ? "Competition structure is locked. Existing Competitions can still be cancelled or restored."
              : `Configuration is locked while this Edition is ${edition.lifecycle}.`}
          </p>
        ) : null}
      </div>

      <CompetitionsTable
        canManageCancellations={canManageCancellations}
        canManageStructure={canManage}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEditCompetition}
        onSetState={handleSetState}
        onView={handleViewCompetition}
        toolbarActions={
          canManage ? (
            <Button
              disabled={categoryViews.length === 0}
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

      <CompetitionDetailSheet
        canManageCancellations={canManageCancellations}
        canManageStructure={canManage}
        competition={selectedCompetition}
        onDelete={handleDelete}
        onEdit={handleEditCompetition}
        onOpenChange={handleSheetChange}
        onSetState={handleSetState}
        open={selectedCompetition !== null}
      />
      <CompetitionFormDialog
        categories={categoryViews}
        competition={editingCompetition}
        editionId={edition.id}
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
