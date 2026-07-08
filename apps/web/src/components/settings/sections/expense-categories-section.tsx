import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { ExpenseCategory } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const categorySchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1, "Name is required"),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

function CategoryForm({
  initialValues,
  onCancel,
  onSubmit,
}: {
  initialValues: CategoryFormValues;
  onCancel: () => void;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: {
      onChange: categorySchema,
      onSubmit: categorySchema,
    },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField isRequired label="Name" name="name" />
        <TextareaField label="Description" name="description" />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type RowAction = { kind: "delete"; category: ExpenseCategory } | null;

type InlineMode =
  | { kind: "create" }
  | { kind: "edit"; category: ExpenseCategory }
  | null;

function ExpenseCategoryDisplayRow({
  category,
  onDelete,
  onEdit,
}: {
  category: ExpenseCategory;
  onDelete: (category: ExpenseCategory) => void;
  onEdit: (category: ExpenseCategory) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(category));
  const handleDelete = useEventCallback(() => onDelete(category));

  return (
    <div className="flex items-start justify-between rounded-md border p-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-sm">{category.name}</span>
        {category.description ? (
          <span className="text-muted-foreground text-xs">
            {category.description}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Edit category"
          onClick={handleEdit}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={PencilEdit01Icon}
            strokeWidth={2}
          />
        </Button>
        <Button
          aria-label="Delete category"
          onClick={handleDelete}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={Delete02Icon}
            strokeWidth={2}
          />
        </Button>
      </div>
    </div>
  );
}

export function ExpenseCategoriesSection() {
  const zero = useZero();
  const [categories] = useQuery(queries.expenseCategory.all());
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);
  const [rowAction, setRowAction] = useState<RowAction>(null);

  const categoryList = categories ?? [];

  const handleCreate = useEventCallback(async (values: CategoryFormValues) => {
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.expenseCategory.create({
        description: values.description,
        id,
        name: values.name,
      })
    ).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Failed to create category",
      mutation: "expenseCategory.create",
      successMsg: "Category created",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleUpdate = useEventCallback(async (values: CategoryFormValues) => {
    if (inlineMode?.kind !== "edit") {
      return;
    }
    const res = await zero.mutate(
      mutators.expenseCategory.update({
        description: values.description,
        id: inlineMode.category.id,
        name: values.name,
      })
    ).server;
    handleMutationResult(res, {
      entityId: inlineMode.category.id,
      errorMsg: "Failed to update category",
      mutation: "expenseCategory.update",
      successMsg: "Category updated",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleDelete = useEventCallback(async () => {
    if (rowAction?.kind !== "delete") {
      return;
    }
    const res = await zero.mutate(
      mutators.expenseCategory.delete({ id: rowAction.category.id })
    ).server;
    handleMutationResult(res, {
      entityId: rowAction.category.id,
      errorMsg: "Failed to delete category",
      mutation: "expenseCategory.delete",
      successMsg: "Category deleted",
    });
    if (res.type !== "error") {
      setRowAction(null);
    }
  });
  const stableOnClick0 = useEventCallback(() =>
    setInlineMode({ kind: "create" })
  );
  const stableOnCancel1 = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((category: ExpenseCategory) =>
    setInlineMode({ category, kind: "edit" })
  );
  const handleDeleteRequest = useEventCallback((category: ExpenseCategory) =>
    setRowAction({ category, kind: "delete" })
  );
  const stableOnOpenChange2 = useEventCallback((open: boolean) => {
    if (!open) {
      setRowAction(null);
    }
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-xs">Expense categories</p>
        {inlineMode ? null : (
          <Button onClick={stableOnClick0} size="sm" type="button">
            <HugeiconsIcon
              className="size-3.5"
              icon={PlusSignIcon}
              strokeWidth={2}
            />
            Add category
          </Button>
        )}
      </div>

      {inlineMode?.kind === "create" ? (
        <div className="rounded-md border p-3">
          <p className="mb-3 font-medium text-sm">Add Category</p>
          <CategoryForm
            initialValues={{ description: "", name: "" }}
            onCancel={stableOnCancel1}
            onSubmit={handleCreate}
          />
        </div>
      ) : null}

      {categoryList.length > 0 ? (
        <div className="flex flex-col gap-2">
          {categoryList.map((category) => (
            <div key={category.id}>
              {inlineMode?.kind === "edit" &&
              inlineMode.category.id === category.id ? (
                <div className="rounded-md border p-3">
                  <p className="mb-3 font-medium text-sm">Edit Category</p>
                  <CategoryForm
                    initialValues={{
                      description: category.description ?? "",
                      name: category.name,
                    }}
                    key={`edit-${category.id}`}
                    onCancel={stableOnCancel1}
                    onSubmit={handleUpdate}
                  />
                </div>
              ) : (
                <ExpenseCategoryDisplayRow
                  category={category}
                  onDelete={handleDeleteRequest}
                  onEdit={handleEditRequest}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {categoryList.length === 0 && !inlineMode ? (
        <>
          <Separator />
          <p className="text-center text-muted-foreground text-xs">
            No expense categories yet.
          </p>
        </>
      ) : null}

      <ConfirmDialog
        confirmLabel="Delete"
        description={
          rowAction?.kind === "delete"
            ? `"${rowAction.category.name}" will be permanently deleted. Existing submissions using this category won't be affected. This cannot be undone.`
            : ""
        }
        onConfirm={handleDelete}
        onOpenChange={stableOnOpenChange2}
        open={rowAction?.kind === "delete"}
        title="Delete category?"
      />
    </div>
  );
}
