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
import {
  computeRunningTotal,
  formatINR,
  type LineItem,
  newLineItem,
} from "@/lib/form-schemas";
import type { FormInstance } from "./form-context";
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

interface LineItemsEditorProps {
  categories: ExpenseCategory[];
  form?: FormInstance;
  name?: string;
}

interface LineItemRowProps {
  categoryOptions: { label: string; value: string }[];
  form: FormInstance;
  index: number;
  name: string;
  onRemove: () => void;
}

function subFieldErrorProps(field: SubFieldApi) {
  const hasError = field.state.meta.errors.length > 0;
  const errorId = `${field.name}-error`;
  return { hasError, errorId };
}

function formatFieldError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

function LineItemRow({
  categoryOptions,
  form,
  index,
  name,
  onRemove,
}: LineItemRowProps) {
  return (
    <div className="grid grid-cols-[1fr_100px_32px] items-start gap-2 sm:grid-cols-[1fr_1fr_100px_32px]">
      <form.Field name={`${name}[${index}].categoryId`}>
        {(rawField: unknown) => {
          const field = rawField as SubFieldApi;
          const { hasError, errorId } = subFieldErrorProps(field);
          return (
            <div className="col-span-3 min-w-0 sm:col-span-1">
              <Select
                onValueChange={(selectedValue) =>
                  field.handleChange(selectedValue ?? "")
                }
                value={field.state.value}
              >
                <SelectTrigger
                  aria-describedby={hasError ? errorId : undefined}
                  aria-invalid={hasError || undefined}
                  aria-label={`Category for line item ${index + 1}`}
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
                <p
                  className="mt-1 text-destructive text-xs"
                  id={errorId}
                  role="alert"
                >
                  {formatFieldError(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field name={`${name}[${index}].description`}>
        {(rawField: unknown) => {
          const field = rawField as SubFieldApi;
          const { hasError, errorId } = subFieldErrorProps(field);
          return (
            <div className="min-w-0">
              <Input
                aria-describedby={hasError ? errorId : undefined}
                aria-invalid={hasError || undefined}
                aria-label={`Description for line item ${index + 1}`}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Description"
                value={field.state.value}
              />
              {hasError && (
                <p
                  className="mt-1 text-destructive text-xs"
                  id={errorId}
                  role="alert"
                >
                  {formatFieldError(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field name={`${name}[${index}].amount`}>
        {(rawField: unknown) => {
          const field = rawField as SubFieldApi;
          const { hasError, errorId } = subFieldErrorProps(field);
          return (
            <div className="min-w-0">
              <Input
                aria-describedby={hasError ? errorId : undefined}
                aria-invalid={hasError || undefined}
                aria-label={`Amount for line item ${index + 1}`}
                inputMode="decimal"
                min="0"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={field.state.value}
              />
              {hasError && (
                <p
                  className="mt-1 text-destructive text-xs"
                  id={errorId}
                  role="alert"
                >
                  {formatFieldError(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <Button
        aria-label={`Remove line item ${index + 1}`}
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
  const form = useResolvedForm(formProp, "LineItemsEditor");

  const categoryOptions = categories.map((category) => ({
    label: category.name,
    value: category.id,
  }));

  return (
    <form.Field mode="array" name={name}>
      {(rawField: unknown) => {
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
              <p className="text-destructive text-xs" role="alert">
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
