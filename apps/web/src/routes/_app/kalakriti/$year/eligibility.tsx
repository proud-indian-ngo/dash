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
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

const ageCutoffFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

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
  const [editionDetails] = useQuery(
    queries.kalakritiEdition.byYear({ year: edition.year })
  );
  const minTotalCompetitions = editionDetails?.minTotalCompetitions ?? 2;
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
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        meta={
          <p>
            Ages are calculated on{" "}
            <time className="tabular-nums" dateTime={edition.ageCutoffDate}>
              {ageCutoffFormatter.format(new Date(edition.ageCutoffDate))}
            </time>
            .
          </p>
        }
        title="Eligibility"
      />

      {configurationLocked ? (
        <KalakritiLockNotice>
          Age Categories and Center quotas are locked while registration is
          locked or this Edition is {edition.lifecycle}.
        </KalakritiLockNotice>
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
        minTotalCompetitions={minTotalCompetitions}
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
