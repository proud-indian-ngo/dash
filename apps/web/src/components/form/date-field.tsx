import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { ResponsivePicker } from "@/components/shared/responsive-picker";
import { DATE } from "@/lib/date-formats";

import { CustomField } from "./custom-field";
import type { FieldValidatorConfig, FormInstance } from "./form-context";
import { getFieldErrorState, useResolvedForm } from "./form-context";

interface DateFieldProps {
  description?: ReactNode;
  disabled?: boolean;
  endMonth?: Date;
  form?: FormInstance;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  maxDate?: Date;
  name: string;
  placeholder?: string;
  startMonth?: Date;
  validators?: FieldValidatorConfig<Date | undefined>;
}

interface DateInputPickerProps {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  disabled: boolean;
  endMonth: Date;
  id: string;
  maxDate?: Date;
  onBlur: () => void;
  onChange: (value: Date | undefined) => void;
  placeholder: string;
  startMonth: Date;
  title: string;
  value: Date | undefined;
}

function DateInputPicker({
  ariaDescribedBy,
  ariaInvalid = false,
  disabled,
  endMonth,
  id,
  maxDate,
  onBlur,
  onChange,
  placeholder,
  startMonth,
  title,
  value,
}: DateInputPickerProps) {
  const [month, setMonth] = useState<Date>(value ?? maxDate ?? new Date());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (value) {
      setMonth(value);
    }
  }, [value]);

  const stableOnOpenChange0 = useEventCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      onBlur();
    }
  });
  const stableOnSelect1 = useEventCallback((date: Date | undefined) => {
    onChange(date);
    onBlur();
    setIsOpen(false);
  });

  return (
    <ResponsivePicker
      onOpenChange={stableOnOpenChange0}
      open={isOpen}
      title={title}
      trigger={
        <Button
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(
            "border-control dark:border-control dark:aria-invalid:border-destructive hover:not-disabled:not-aria-invalid:not-focus-visible:border-control-strong h-9 w-full justify-between font-normal pointer-coarse:h-10",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
          id={id}
          type="button"
          variant="outline"
        >
          {value === undefined ? placeholder : format(value, DATE)}
          <HugeiconsIcon
            className="size-4 opacity-60"
            icon={Calendar01Icon}
            strokeWidth={2}
          />
        </Button>
      }
    >
      <Calendar
        autoFocus
        captionLayout="dropdown"
        defaultMonth={value}
        disabled={maxDate ? { after: maxDate } : undefined}
        endMonth={endMonth}
        mode="single"
        month={month}
        onMonthChange={setMonth}
        onSelect={stableOnSelect1}
        selected={value}
        startMonth={startMonth}
      />
    </ResponsivePicker>
  );
}

export function DateField({
  description,
  disabled = false,
  endMonth: endMonthProp,
  form,
  hideLabel = false,
  isRequired = false,
  label,
  maxDate,
  name,
  placeholder = "Pick a date",
  startMonth: startMonthProp,
  validators,
}: DateFieldProps) {
  const now = new Date();
  const endMonth =
    endMonthProp ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const startMonth = startMonthProp ?? new Date(1900, 0, 1);
  useResolvedForm(form, "DateField");
  return (
    <CustomField<Date | undefined>
      description={description}
      form={form}
      hideLabel={hideLabel}
      isRequired={isRequired}
      label={label}
      name={name}
      validators={validators}
    >
      {(field, submitted) => {
        const { hasError, errorMessageId } = getFieldErrorState(
          field,
          submitted
        );

        return (
          <DateInputPicker
            ariaDescribedBy={hasError ? errorMessageId : undefined}
            ariaInvalid={hasError}
            disabled={disabled}
            endMonth={endMonth}
            id={field.name}
            maxDate={maxDate}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
            placeholder={placeholder}
            startMonth={startMonth}
            title={label}
            value={field.state.value}
          />
        );
      }}
    </CustomField>
  );
}
