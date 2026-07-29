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
import { CompetitionCategoriesTable } from "@/components/kalakriti/competition-categories-table";
import { CompetitionCategoryDetailSheet } from "@/components/kalakriti/competition-category-detail-sheet";
import {
  CompetitionCategoryFormDialog,
  type CompetitionCategoryFormValue,
} from "@/components/kalakriti/competition-category-form-dialog";
import type {
  CompetitionCategoryTableRow,
  CompetitionCategoryView,
  CompetitionView,
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
} from "@/components/kalakriti/competition-config-types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute(
  "/_app/kalakriti/$year/competitions/categories"
)({
  component: CompetitionCategoriesPage,
});

function CompetitionCategoriesPage() {
  const zero = useZero();
  const {
    kalakritiCompetitionAccess: { actorCanManage, canManage },
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
  const competitionCounts = new Map<string, number>();
  for (const competition of competitionViews) {
    competitionCounts.set(
      competition.competitionCategoryId,
      (competitionCounts.get(competition.competitionCategoryId) ?? 0) + 1
    );
  }
  const rows: CompetitionCategoryTableRow[] = categoryViews.map((category) => ({
    ...category,
    competitionCount: competitionCounts.get(category.id) ?? 0,
  }));
  const isLoading =
    rows.length === 0 &&
    (categoryResult.type !== "complete" ||
      competitionResult.type !== "complete");
  const nextSortOrder =
    categoryViews.reduce(
      (maximum, category) => Math.max(maximum, category.sortOrder),
      -1
    ) + 1;

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const selectedCategory =
    rows.find((category) => category.id === selectedCategoryId) ?? null;
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CompetitionCategoryFormValue | null>(null);

  const deleteAction = useConfirmAction<ConfigurationDeletePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Category is referenced or could not be deleted",
      mutation: "kalakritiCompetition.deleteCategory",
      successMsg: "Competition Category deleted",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiCompetition.deleteCategory({
          auditEntryId: uuidv7(),
          id: payload.id,
          now: Date.now(),
        })
      ).server,
  });
  const stateAction = useConfirmAction<ConfigurationStatePayload>({
    mutationMeta: {
      entityId: (payload) => payload.id,
      errorMsg: "Failed to update Category state",
      mutation: "kalakritiCompetition.setCategoryRetired",
      successMsg: "Competition Category state updated",
    },
    onConfirm: (payload) =>
      zero.mutate(
        mutators.kalakritiCompetition.setCategoryRetired({
          auditEntryId: uuidv7(),
          enabled: payload.enabled,
          id: payload.id,
          now: Date.now(),
        })
      ).server,
  });

  const handleAdd = useEventCallback(() => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  });
  const handleView = useEventCallback((category: CompetitionCategoryTableRow) =>
    setSelectedCategoryId(category.id)
  );
  const handleEdit = useEventCallback(
    (category: CompetitionCategoryFormValue) => {
      setSelectedCategoryId(null);
      setEditingCategory(category);
      setCategoryDialogOpen(true);
    }
  );
  const handleDialogChange = useEventCallback((open: boolean) => {
    setCategoryDialogOpen(open);
    if (!open) {
      setEditingCategory(null);
    }
  });
  const handleSheetChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedCategoryId(null);
    }
  });
  const handleDelete = useEventCallback(
    (payload: ConfigurationDeletePayload) => {
      setSelectedCategoryId(null);
      deleteAction.trigger(payload);
    }
  );
  const handleSetState = useEventCallback(
    (payload: ConfigurationStatePayload) => {
      setSelectedCategoryId(null);
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
        <h1 className="font-display font-semibold text-2xl">
          Competition Categories
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {actorCanManage
            ? "Manage Competition groupings and Category Lead scope."
            : "Read-only Categories assigned to you as a Category Lead."}
        </p>
      </div>

      <CompetitionCategoriesTable
        canManage={canManage}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onSetState={handleSetState}
        onView={handleView}
        toolbarActions={
          canManage ? (
            <Button onClick={handleAdd} size="sm">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add Category
            </Button>
          ) : null
        }
      />

      <CompetitionCategoryDetailSheet
        canManage={canManage}
        category={selectedCategory}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onOpenChange={handleSheetChange}
        onSetState={handleSetState}
        open={selectedCategory !== null}
      />
      <CompetitionCategoryFormDialog
        category={editingCategory}
        editionId={edition.id}
        nextSortOrder={nextSortOrder}
        onOpenChange={handleDialogChange}
        open={categoryDialogOpen}
      />
      <ConfirmDialog
        confirmLabel="Delete"
        description={`Delete ${deleteAction.payload?.name ?? "this Category"}? Categories with Competitions must be retired instead.`}
        loading={deleteAction.isLoading}
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDeleteDialog}
        open={deleteAction.isOpen}
        title="Delete Competition Category?"
      />
      <ConfirmDialog
        confirmLabel={`Confirm ${(stateAction.payload?.action ?? "change").toLowerCase()}`}
        description={`This will ${(stateAction.payload?.action ?? "change").toLowerCase()} ${stateAction.payload?.name ?? "this Category"}.`}
        loading={stateAction.isLoading}
        onConfirm={stateAction.confirm}
        onOpenChange={closeStateDialog}
        open={stateAction.isOpen}
        title={`${stateAction.payload?.action ?? "Change"} ${stateAction.payload?.name ?? "Category"}?`}
      />
    </div>
  );
}
