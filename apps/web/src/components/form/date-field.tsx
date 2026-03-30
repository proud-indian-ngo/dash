import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import { cn } from "@pi-dash/design-system/lib/utils";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LONG_DATE } from "@/lib/date-formats";

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
  value,
}: DateInputPickerProps) {
  const [month, setMonth] = useState<Date>(value ?? endMonth);

  useEffect(() => {
    if (value) {
      setMonth(value);
    }
  }, [value]);

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          onBlur();
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            className={cn(
              "w-full justify-between rounded-none border-input font-normal",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
            id={id}
            type="button"
            variant="outline"
          >
            {value ? format(value, LONG_DATE) : placeholder}
            <HugeiconsIcon
              className="size-4 opacity-60"
              icon={Calendar01Icon}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          autoFocus
          captionLayout="dropdown"
          defaultMonth={value ?? endMonth}
          disabled={maxDate ? { after: maxDate } : undefined}
          endMonth={endMonth}
          mode="single"
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => onChange(date ?? undefined)}
          selected={value}
          startMonth={startMonth}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateField({
  description,
  disabled = false,
  endMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  form,
  hideLabel = false,
  isRequired = false,
  label,
  maxDate,
  name,
  placeholder = "Pick a date",
  startMonth = new Date(1900, 0, 1),
  validators,
}: DateFieldProps) {
  const resolvedForm = useResolvedForm(form, "DateField");
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
      {(field) => {
        const submitted = resolvedForm.state.submissionAttempts > 0;
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
            onChange={(value) => field.handleChange(value)}
            placeholder={placeholder}
            startMonth={startMonth}
            value={field.state.value}
          />
        );
      }}
    </CustomField>
  );
}
