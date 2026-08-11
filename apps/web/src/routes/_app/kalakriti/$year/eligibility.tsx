import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { AgeCategoriesTable } from "@/components/kalakriti/age-categories-table";
import {
  AgeCategoryFormDialog,
  type AgeCategoryFormValue,
} from "@/components/kalakriti/age-category-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export const Route = createFileRoute("/_app/kalakriti/$year/eligibility")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    const canManage =
      access.isGlobalAdmin ||
      access.membership?.responsibilities.includes("edition_admin");
    if (!canManage) {
      throw notFound();
    }
  },
  component: KalakritiEligibilityPage,
});

function categoryValue(category: {
  femaleStudentLimit: number | null;
  id: string;
  maximumAge: number;
  maxCompetitionsPerCategory: number;
  maleStudentLimit: number | null;
  maxTotalCompetitions: number;
  minimumAge: number;
  name: string;
  sortOrder: number;
}): AgeCategoryFormValue {
  return {
    ...category,
    femaleStudentLimit: category.femaleStudentLimit ?? 0,
    maleStudentLimit: category.maleStudentLimit ?? 0,
  };
}

function KalakritiEligibilityPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [categories, categoryResult] = useQuery(
    queries.kalakritiEligibility.ageCategories({ editionId: edition.id })
  );
  const configurationLocked =
    edition.lifecycle === "registration_locked" ||
    edition.lifecycle === "live" ||
    edition.lifecycle === "archived";
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<AgeCategoryFormValue | null>(null);

  const deleteCategoryAction = useConfirmAction<AgeCategoryFormValue>({
    mutationMeta: {
      entityId: (category) => category.id,
      errorMsg: "Age Category could not be deleted",
      mutation: "kalakritiEligibility.deleteAgeCategory",
      successMsg: "Age Category deleted",
    },
    onConfirm: (category) =>
      zero.mutate(
        mutators.kalakritiEligibility.deleteAgeCategory({
          auditEntryId: uuidv7(),
          id: category.id,
          now: Date.now(),
        })
      ).server,
  });
  const closeDeleteCategory = useEventCallback((open: boolean) => {
    if (!open) {
      deleteCategoryAction.cancel();
    }
  });
  const handleAddCategory = useEventCallback(() => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  });
  const handleCategoryDialogChange = useEventCallback((open: boolean) => {
    setCategoryDialogOpen(open);
    if (!open) {
      setEditingCategory(null);
    }
  });
  const handleEditCategory = useEventCallback(
    (category: AgeCategoryFormValue) => {
      setEditingCategory(category);
      setCategoryDialogOpen(true);
    }
  );
  const retryQueries = useEventCallback(() => {
    if (categoryResult.type === "error") {
      categoryResult.retry();
    }
  });

  if (categoryResult.type === "error") {
    return (
      <div className="space-y-3" role="alert">
        <p className="font-medium">
          Eligibility configuration could not be loaded.
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

  const categoryRows = categories.map(categoryValue);
  const isLoading =
    categoryRows.length === 0 && categoryResult.type !== "complete";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-2xl">Eligibility</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Configure inclusive age ranges, shared Student limits for every
            Center, and Competition limits. Ages are calculated on{" "}
            {edition.ageCutoffDate}.
          </p>
        </div>
      </div>

      {configurationLocked ? (
        <p className="text-muted-foreground text-sm">
          Age Categories and Center quotas are locked while registration is
          locked or this Edition is {edition.lifecycle}.
        </p>
      ) : null}

      <AgeCategoriesTable
        canEdit={!configurationLocked}
        data={categoryRows}
        isLoading={isLoading}
        onDelete={deleteCategoryAction.trigger}
        onEdit={handleEditCategory}
        toolbarActions={
          configurationLocked ? null : (
            <Button onClick={handleAddCategory}>Add Age Category</Button>
          )
        }
      />

      <AgeCategoryFormDialog
        category={editingCategory}
        editionId={edition.id}
        existingCategories={categoryRows}
        onOpenChange={handleCategoryDialogChange}
        open={categoryDialogOpen}
      />
      <ConfirmDialog
        confirmLabel="Delete Age Category"
        description={`Delete ${deleteCategoryAction.payload?.name ?? "this Age Category"}?`}
        loading={deleteCategoryAction.isLoading}
        onConfirm={deleteCategoryAction.confirm}
        onOpenChange={closeDeleteCategory}
        open={deleteCategoryAction.isOpen}
        title="Delete Age Category?"
      />
    </div>
  );
}
