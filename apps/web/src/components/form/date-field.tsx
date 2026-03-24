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
import { ISO_DATE, LONG_DATE } from "@/lib/date-formats";

import { CustomField } from "./custom-field";
import type { FieldValidatorConfig, FormInstance } from "./form-context";
import { getFieldErrorState } from "./form-context";

const parseDateInputValue = (value: string): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!(year && month && day)) {
    return undefined;
  }

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.valueOf())) {
    return undefined;
  }

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }

  return parsed;
};

const formatDateInputValue = (date: Date): string => {
  return format(date, ISO_DATE);
};

const formatDateLabel = (value: string, fallback: string): string => {
  const date = parseDateInputValue(value);
  if (!date) {
    return fallback;
  }

  return format(date, LONG_DATE);
};

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
  validators?: FieldValidatorConfig<string>;
}

interface DateInputPickerProps {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  disabled: boolean;
  endMonth: Date;
  id: string;
  maxDate?: Date;
  onBlur: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  startMonth: Date;
  value: string;
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
  const selectedDate = parseDateInputValue(value);
  const [month, setMonth] = useState<Date>(selectedDate ?? endMonth);

  useEffect(() => {
    const nextSelectedDate = parseDateInputValue(value);
    if (!nextSelectedDate) {
      return;
    }

    setMonth(nextSelectedDate);
  }, [value]);

  return (
    <Popover>
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
            onBlur={onBlur}
            type="button"
            variant="outline"
          >
            {formatDateLabel(value, placeholder)}
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
          defaultMonth={selectedDate ?? endMonth}
          disabled={maxDate ? { after: maxDate } : undefined}
          endMonth={endMonth}
          mode="single"
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => onChange(date ? formatDateInputValue(date) : "")}
          selected={selectedDate}
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
  return (
    <CustomField<string>
      description={description}
      form={form}
      hideLabel={hideLabel}
      isRequired={isRequired}
      label={label}
      name={name}
      validators={validators}
    >
      {(field) => {
        const { hasError, errorMessageId } = getFieldErrorState(field);

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
            value={field.state.value ?? ""}
          />
        );
      }}
    </CustomField>
  );
}
