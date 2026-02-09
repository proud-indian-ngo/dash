import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import type { ExpenseCategory } from "@pi-dash/zero/schema";
import type { ReactNode } from "react";
import {
  computeRunningTotal,
  formatINR,
  type LineItem,
  newLineItem,
} from "@/lib/form-schemas";
import { useResolvedForm } from "./form-context";

interface ArrayFieldApi {
  pushValue: (value: LineItem) => void;
  removeValue: (index: number) => void;
  state: { value: LineItem[] };
}

interface SubFieldApi {
  handleBlur: () => void;
  handleChange: (value: string) => void;
  name: string;
  state: {
    meta: { errors: unknown[] };
    value: string;
  };
}

interface LineItemForm {
  Field: (props: {
    children: (field: unknown) => ReactNode;
    mode?: "array";
    name: string;
  }) => ReactNode;
  state: { submissionAttempts: number };
}

interface LineItemsEditorProps {
  categories: ExpenseCategory[];
  form?: unknown;
  name?: string;
}

interface LineItemRowProps {
  categoryOptions: { label: string; value: string }[];
  form: LineItemForm;
  index: number;
  name: string;
  onRemove: () => void;
}

function subFieldErrorProps(field: SubFieldApi) {
  const hasError = field.state.meta.errors.length > 0;
  const errorId = `${field.name}-error`;
  return { hasError, errorId };
}

function LineItemRow({
  categoryOptions,
  form,
  index,
  name,
  onRemove,
}: LineItemRowProps) {
  return (
    <div className="grid grid-cols-[1fr_1fr_100px_32px] items-start gap-2">
      <form.Field name={`${name}[${index}].categoryId`}>
        {(rawField) => {
          const field = rawField as SubFieldApi;
          const { hasError, errorId } = subFieldErrorProps(field);
          return (
            <>
              <Select
                onValueChange={(selectedValue) =>
                  field.handleChange(selectedValue ?? "")
                }
                value={field.state.value}
              >
                <SelectTrigger
                  aria-describedby={hasError ? errorId : undefined}
                  aria-invalid={hasError || undefined}
                  className="w-full"
                >
                  <span
                    className="flex flex-1 items-center text-left"
                    data-slot="select-value"
                  >
                    {categoryOptions.find(
                      (option) => option.value === field.state.value
                    )?.label ?? "Category"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasError && (
                <span className="sr-only" id={errorId}>
                  {String(field.state.meta.errors[0])}
                </span>
              )}
            </>
          );
        }}
      </form.Field>

      <form.Field name={`${name}[${index}].description`}>
        {(rawField) => {
          const field = rawField as SubFieldApi;
          const { hasError, errorId } = subFieldErrorProps(field);
          return (
            <>
              <Input
                aria-describedby={hasError ? errorId : undefined}
                aria-invalid={hasError || undefined}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Description"
                value={field.state.value}
              />
              {hasError && (
                <span className="sr-only" id={errorId}>
                  {String(field.state.meta.errors[0])}
                </span>
              )}
            </>
          );
        }}
      </form.Field>

      <form.Field name={`${name}[${index}].amount`}>
        {(rawField) => {
          const field = rawField as SubFieldApi;
          const { hasError, errorId } = subFieldErrorProps(field);
          return (
            <>
              <Input
                aria-describedby={hasError ? errorId : undefined}
                aria-invalid={hasError || undefined}
                inputMode="decimal"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="0.00"
                value={field.state.value}
              />
              {hasError && (
                <span className="sr-only" id={errorId}>
                  {String(field.state.meta.errors[0])}
                </span>
              )}
            </>
          );
        }}
      </form.Field>

      <Button
        aria-label="Remove line item"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon className="size-4" icon={Delete02Icon} strokeWidth={2} />
      </Button>
    </div>
  );
}

export function LineItemsEditor({
  categories,
  form: formProp,
  name = "lineItems",
}: LineItemsEditorProps) {
  const form = useResolvedForm(
    formProp,
    "LineItemsEditor"
  ) as unknown as LineItemForm;

  const categoryOptions = categories.map((category) => ({
    label: category.name,
    value: category.id,
  }));

  return (
    <form.Field mode="array" name={name}>
      {(rawField) => {
        const arrayField = rawField as ArrayFieldApi;
        const total = computeRunningTotal(arrayField.state.value);

        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="font-medium text-sm">Line items</Label>
                <span className="text-destructive text-xs"> *</span>
              </div>
              <span className="text-muted-foreground text-xs">
                Total: {formatINR(total)}
              </span>
            </div>

            {arrayField.state.value.length > 0 ? (
              <div className="flex flex-col gap-2">
                {arrayField.state.value.map((item, index) => (
                  <LineItemRow
                    categoryOptions={categoryOptions}
                    form={form}
                    index={index}
                    key={item.id}
                    name={name}
                    onRemove={() => arrayField.removeValue(index)}
                  />
                ))}
              </div>
            ) : (
              <p className="py-2 text-center text-muted-foreground text-xs">
                No line items yet.
              </p>
            )}

            {form.state.submissionAttempts > 0 &&
            arrayField.state.value.length === 0 ? (
              <p className="text-destructive text-xs">
                At least one line item is required
              </p>
            ) : null}

            <Button
              className="self-start"
              onClick={() => arrayField.pushValue(newLineItem())}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-3.5"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add line item
            </Button>
          </div>
        );
      }}
    </form.Field>
  );
}
