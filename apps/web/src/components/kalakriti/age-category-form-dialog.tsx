import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { findKalakritiAgeCategoryOverlap } from "@pi-dash/shared/kalakriti";
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

const ageCategoryValuesSchema = z
  .object({
    maxCompetitionsPerCategory: z.number().int().min(1),
    maximumAge: z.number().int().min(0).max(100),
    maxTotalCompetitions: z.number().int().min(1),
    minimumAge: z.number().int().min(0).max(100),
    name: z.string().trim().min(2).max(120),
    sortOrder: z.number().int().min(0),
  })
  .refine((value) => value.maximumAge >= value.minimumAge, {
    message: "Maximum age must be at least the minimum age",
    path: ["maximumAge"],
  })
  .refine(
    (value) => value.maxCompetitionsPerCategory <= value.maxTotalCompetitions,
    {
      message: "Cannot exceed the total Competition limit",
      path: ["maxCompetitionsPerCategory"],
    }
  );

export interface AgeCategoryFormValue {
  id: string;
  maxCompetitionsPerCategory: number;
  maximumAge: number;
  maxTotalCompetitions: number;
  minimumAge: number;
  name: string;
  sortOrder: number;
}

interface AgeCategoryFormDialogProps {
  category: AgeCategoryFormValue | null;
  editionId: string;
  existingCategories: readonly AgeCategoryFormValue[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function createAgeCategoryFormSchema(
  categories: readonly AgeCategoryFormValue[],
  editingId: string | undefined
) {
  return ageCategoryValuesSchema.superRefine((value, context) => {
    const overlap = findKalakritiAgeCategoryOverlap([
      ...categories.filter((category) => category.id !== editingId),
      { ...value, id: editingId ?? "new-age-category" },
    ]);
    if (overlap) {
      const otherName = overlap.find((name) => name !== value.name);
      context.addIssue({
        code: "custom",
        message: `Age range overlaps ${otherName ?? "another category"}`,
        path: ["maximumAge"],
      });
    }
  });
}

function AgeCategoryForm({
  category,
  editionId,
  existingCategories,
  onOpenChange,
}: Omit<AgeCategoryFormDialogProps, "open">) {
  const zero = useZero();
  const nextSortOrder =
    existingCategories.reduce(
      (maximum, existingCategory) =>
        Math.max(maximum, existingCategory.sortOrder),
      -1
    ) + 1;
  const formSchema = createAgeCategoryFormSchema(
    existingCategories,
    category?.id
  );
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      maxCompetitionsPerCategory: category?.maxCompetitionsPerCategory ?? 1,
      maximumAge: category?.maximumAge ?? 10,
      maxTotalCompetitions: category?.maxTotalCompetitions ?? 2,
      minimumAge: category?.minimumAge ?? 6,
      name: category?.name ?? "",
      sortOrder: category?.sortOrder ?? nextSortOrder,
    },
    onSubmit: async ({ value }) => {
      const ageCategoryId = category?.id ?? uuidv7();
      const common = {
        ...value,
        ageCategoryId,
        auditEntryId: uuidv7(),
        now: Date.now(),
      };
      const result = category
        ? await zero.mutate(
            mutators.kalakritiEligibility.updateAgeCategory(common)
          ).server
        : await zero.mutate(
            mutators.kalakritiEligibility.createAgeCategory({
              ...common,
              editionId,
            })
          ).server;
      handleMutationResult(result, {
        entityId: ageCategoryId,
        errorMsg: category
          ? "Failed to update Age Category"
          : "Failed to create Age Category",
        mutation: category
          ? "kalakritiEligibility.updateAgeCategory"
          : "kalakritiEligibility.createAgeCategory",
        successMsg: category ? "Age Category updated" : "Age Category created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: formSchema,
      onSubmit: formSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        autoFocus
        isRequired
        label="Category name"
        name="name"
        placeholder="Junior"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          isRequired
          label="Minimum age"
          name="minimumAge"
          type="number"
        />
        <InputField
          isRequired
          label="Maximum age"
          name="maximumAge"
          type="number"
        />
        <InputField
          isRequired
          label="Display order"
          name="sortOrder"
          type="number"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          description="Maximum Competitions a Student may enter."
          isRequired
          label="Total Competition limit"
          name="maxTotalCompetitions"
          type="number"
        />
        <InputField
          description="Maximum from any one Competition Category."
          isRequired
          label="Per-category limit"
          name="maxCompetitionsPerCategory"
          type="number"
        />
      </div>
      <FormActions
        onCancel={handleCancel}
        submitLabel={category ? "Save Category" : "Create Category"}
        submittingLabel={category ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function AgeCategoryFormDialog(props: AgeCategoryFormDialogProps) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (open) {
      setFormKey((key) => key + 1);
    }
    props.onOpenChange(open);
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={props.open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {props.category ? "Edit Age Category" : "Add Age Category"}
          </DialogTitle>
          <DialogDescription>
            Ages are inclusive on the Edition cutoff date. Gaps are allowed, but
            ranges cannot overlap.
          </DialogDescription>
        </DialogHeader>
        <AgeCategoryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
