import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { handleMutationResult } from "@/lib/mutation-result";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  sortOrder: z.number().int().min(0),
});

export interface CompetitionCategoryFormValue {
  id: string;
  name: string;
  sortOrder: number;
}

function CategoryForm({
  category,
  editionId,
  nextSortOrder,
  onOpenChange,
}: {
  category: CompetitionCategoryFormValue | null;
  editionId: string;
  nextSortOrder: number;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      name: category ? category.name : "",
      sortOrder: category ? category.sortOrder : nextSortOrder,
    },
    onSubmit: async ({ value }) => {
      const categoryId = category ? category.id : uuidv7();
      const common = {
        ...value,
        auditEntryId: uuidv7(),
        categoryId,
        now: Date.now(),
      };
      const result = category
        ? await zero.mutate(
            mutators.kalakritiCompetition.updateCategory(common)
          ).server
        : await zero.mutate(
            mutators.kalakritiCompetition.createCategory({
              ...common,
              editionId,
            })
          ).server;
      handleMutationResult(result, {
        entityId: categoryId,
        errorMsg: category
          ? "Failed to update Competition Category"
          : "Failed to create Competition Category",
        mutation: category
          ? "kalakritiCompetition.updateCategory"
          : "kalakritiCompetition.createCategory",
        successMsg: category
          ? "Competition Category updated"
          : "Competition Category created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: categorySchema, onSubmit: categorySchema },
  });
  return (
    <FormLayout form={form}>
      <InputField autoFocus isRequired label="Category name" name="name" />
      <InputField
        isRequired
        label="Display order"
        name="sortOrder"
        type="number"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel={category ? "Save Category" : "Create Category"}
        submittingLabel={category ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function CompetitionCategoryFormDialog({
  category,
  editionId,
  nextSortOrder,
  onOpenChange,
  open,
}: {
  category: CompetitionCategoryFormValue | null;
  editionId: string;
  nextSortOrder: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category
              ? "Edit Competition Category"
              : "Add Competition Category"}
          </DialogTitle>
          <DialogDescription>
            Categories group Competitions and define the scope for Category
            Leads.
          </DialogDescription>
        </DialogHeader>
        <CategoryForm
          category={category}
          editionId={editionId}
          key={formKey}
          nextSortOrder={nextSortOrder}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
