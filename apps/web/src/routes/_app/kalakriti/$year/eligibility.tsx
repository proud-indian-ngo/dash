import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  AgeCategoryFormDialog,
  type AgeCategoryFormValue,
} from "@/components/kalakriti/age-category-form-dialog";
import {
  CenterAgeQuotaDialog,
  type CenterAgeQuotaSelection,
} from "@/components/kalakriti/center-age-quota-dialog";
import {
  EligibilityCategoryCard,
  type EligibilityQuota,
} from "@/components/kalakriti/eligibility-category-card";
import { Loader } from "@/components/loader";
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
  id: string;
  maximumAge: number;
  maxCompetitionsPerCategory: number;
  maxTotalCompetitions: number;
  minimumAge: number;
  name: string;
  sortOrder: number;
}): AgeCategoryFormValue {
  return category;
}

function KalakritiEligibilityPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [categories, categoryResult] = useQuery(
    queries.kalakritiEligibility.ageCategories({ editionId: edition.id })
  );
  const [quotas, quotaResult] = useQuery(
    queries.kalakritiEligibility.quotas({ editionId: edition.id })
  );
  const [centers, centerResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const configurationLocked =
    edition.lifecycle === "live" || edition.lifecycle === "archived";
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<AgeCategoryFormValue | null>(null);
  const [quotaSelection, setQuotaSelection] =
    useState<CenterAgeQuotaSelection | null>(null);

  const deleteCategoryAction = useConfirmAction<AgeCategoryFormValue>({
    mutationMeta: {
      entityId: (category) => category.id,
      errorMsg: "Age Category has quotas or could not be deleted",
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
  const deleteQuotaAction = useConfirmAction<EligibilityQuota>({
    mutationMeta: {
      entityId: (quota) => quota.id,
      errorMsg: "Failed to remove Center quota",
      mutation: "kalakritiEligibility.deleteQuota",
      successMsg: "Center quota removed",
    },
    onConfirm: (quota) =>
      zero.mutate(
        mutators.kalakritiEligibility.deleteQuota({
          auditEntryId: uuidv7(),
          id: quota.id,
          now: Date.now(),
        })
      ).server,
  });
  const closeDeleteCategory = useEventCallback((open: boolean) => {
    if (!open) {
      deleteCategoryAction.cancel();
    }
  });
  const closeDeleteQuota = useEventCallback((open: boolean) => {
    if (!open) {
      deleteQuotaAction.cancel();
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
  const handleQuotaDialogChange = useEventCallback((open: boolean) => {
    if (!open) {
      setQuotaSelection(null);
    }
  });
  const handleEditCategory = useEventCallback(
    (category: AgeCategoryFormValue) => {
      setEditingCategory(category);
      setCategoryDialogOpen(true);
    }
  );
  const handleEditQuota = useEventCallback(
    (selection: CenterAgeQuotaSelection) => setQuotaSelection(selection)
  );
  const retryQueries = useEventCallback(() => {
    if (categoryResult.type === "error") {
      categoryResult.retry();
    }
    if (quotaResult.type === "error") {
      quotaResult.retry();
    }
    if (centerResult.type === "error") {
      centerResult.retry();
    }
  });

  const queryFailed =
    categoryResult.type === "error" ||
    quotaResult.type === "error" ||
    centerResult.type === "error";
  if (queryFailed) {
    return (
      <div className="space-y-3 pt-6" role="alert">
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

  if (
    categoryResult.type !== "complete" ||
    quotaResult.type !== "complete" ||
    centerResult.type !== "complete"
  ) {
    return (
      <div
        aria-label="Loading eligibility configuration"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-2xl">Eligibility</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Ages are calculated on {edition.ageCutoffDate}. Configure inclusive
            ranges before setting Center limits.
          </p>
        </div>
        {configurationLocked ? null : (
          <Button onClick={handleAddCategory}>Add Age Category</Button>
        )}
      </div>

      {configurationLocked ? (
        <p className="text-muted-foreground text-sm">
          Eligibility configuration is locked while this Edition is{" "}
          {edition.lifecycle}.
        </p>
      ) : null}

      {categories.length === 0 ? (
        <div className="border border-dashed px-4 py-12 text-center">
          <p className="font-medium">No Age Categories configured</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Add inclusive age ranges and Competition limits for this Edition.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <EligibilityCategoryCard
              category={categoryValue(category)}
              centers={centers}
              configurationLocked={configurationLocked}
              key={category.id}
              onDelete={deleteCategoryAction.trigger}
              onEdit={handleEditCategory}
              onEditQuota={handleEditQuota}
              onRemoveQuota={deleteQuotaAction.trigger}
              quotas={quotas}
            />
          ))}
        </div>
      )}

      <AgeCategoryFormDialog
        category={editingCategory}
        editionId={edition.id}
        existingCategories={categories.map(categoryValue)}
        onOpenChange={handleCategoryDialogChange}
        open={categoryDialogOpen}
      />
      <CenterAgeQuotaDialog
        editionId={edition.id}
        onOpenChange={handleQuotaDialogChange}
        open={quotaSelection !== null}
        selection={quotaSelection}
      />
      <ConfirmDialog
        confirmLabel="Delete Age Category"
        description="Delete this Age Category? Remove its Center quotas first."
        loading={deleteCategoryAction.isLoading}
        onConfirm={deleteCategoryAction.confirm}
        onOpenChange={closeDeleteCategory}
        open={deleteCategoryAction.isOpen}
        title="Delete Age Category?"
      />
      <ConfirmDialog
        confirmLabel="Remove Quota"
        description="Remove this Center and Age Category quota?"
        loading={deleteQuotaAction.isLoading}
        onConfirm={deleteQuotaAction.confirm}
        onOpenChange={closeDeleteQuota}
        open={deleteQuotaAction.isOpen}
        title="Remove Center quota?"
      />
    </div>
  );
}
