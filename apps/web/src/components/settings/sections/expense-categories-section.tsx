import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { ExpenseCategory } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
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
      onBlur: categorySchema,
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

export function ExpenseCategoriesSection() {
  const zero = useZero();
  const [categories] = useQuery(queries.expenseCategory.all());
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);
  const [rowAction, setRowAction] = useState<RowAction>(null);

  const categoryList = categories ?? [];

  const handleCreate = (values: CategoryFormValues) => {
    zero.mutate(
      mutators.expenseCategory.create({
        id: uuidv7(),
        name: values.name,
        description: values.description,
      })
    );
    toast.success("Category created");
    setInlineMode(null);
  };

  const handleUpdate = (values: CategoryFormValues) => {
    if (inlineMode?.kind !== "edit") {
      return;
    }
    zero.mutate(
      mutators.expenseCategory.update({
        id: inlineMode.category.id,
        name: values.name,
        description: values.description,
      })
    );
    toast.success("Category updated");
    setInlineMode(null);
  };

  const handleDelete = () => {
    if (rowAction?.kind !== "delete") {
      return;
    }
    zero.mutate(mutators.expenseCategory.delete({ id: rowAction.category.id }));
    toast.success("Category deleted");
    setRowAction(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-xs">Expense categories</p>
        {inlineMode ? null : (
          <Button
            onClick={() => setInlineMode({ kind: "create" })}
            size="sm"
            type="button"
            variant="outline"
          >
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
            initialValues={{ name: "", description: "" }}
            onCancel={() => setInlineMode(null)}
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
                      name: category.name,
                      description: category.description ?? "",
                    }}
                    key={`edit-${category.id}`}
                    onCancel={() => setInlineMode(null)}
                    onSubmit={handleUpdate}
                  />
                </div>
              ) : (
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
                      onClick={() => setInlineMode({ kind: "edit", category })}
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
                      onClick={() => setRowAction({ kind: "delete", category })}
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

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRowAction(null);
          }
        }}
        open={rowAction?.kind === "delete"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {rowAction?.kind === "delete"
                ? `"${rowAction.category.name}" will be permanently deleted. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
