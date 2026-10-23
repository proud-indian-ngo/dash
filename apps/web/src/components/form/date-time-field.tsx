import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { ScrollArea } from "@pi-dash/design-system/components/ui/scroll-area";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Calendar } from "@/components/shared/calendar";
import { ResponsivePicker } from "@/components/shared/responsive-picker";
import { DATE_TIME } from "@/lib/date-formats";

import { CustomField } from "./custom-field";
import { applyTimeChange } from "./date-time-utils";
import type { FieldValidatorConfig, FormInstance } from "./form-context";
import { getFieldErrorState, useResolvedForm } from "./form-context";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function getAmPm(date: Date): "AM" | "PM" {
  return date.getHours() >= 12 ? "PM" : "AM";
}

function scrollToSelected(container: HTMLDivElement | null, index: number) {
  if (!container) {
    return;
  }
  const viewport = container.querySelector(
    '[data-slot="scroll-area-viewport"]'
  );
  if (!viewport) {
    return;
  }
  const buttons = viewport.querySelectorAll("button");
  const target = buttons[index];
  if (target) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function TimeButton({
  children,
  disabled,
  isSelected,
  onTimeChange,
  type,
  value,
}: {
  children: ReactNode;
  disabled: boolean;
  isSelected: boolean;
  onTimeChange: (type: "hour" | "minute" | "ampm", val: string) => void;
  type: "hour" | "minute" | "ampm";
  value: string;
}) {
  const handleClick = useEventCallback(() => onTimeChange(type, value));

  return (
    <Button
      className="aspect-square shrink-0 sm:w-full"
      disabled={disabled}
      onClick={handleClick}
      size="icon"
      type="button"
      variant={isSelected ? "default" : "ghost"}
    >
      {children}
    </Button>
  );
}

interface DateTimeFieldProps {
  description?: ReactNode;
  disabled?: boolean;
  form?: FormInstance;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  maxDate?: Date;
  minDate?: Date;
  name: string;
  placeholder?: string;
  validators?: FieldValidatorConfig<Date | undefined>;
}

interface DateTimePickerProps {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  disabled: boolean;
  id: string;
  maxDate?: Date;
  minDate?: Date;
  onBlur: () => void;
  onChange: (value: Date | undefined) => void;
  placeholder: string;
  title: string;
  value: Date | undefined;
}

function DateTimePicker({
  ariaDescribedBy,
  ariaInvalid = false,
  disabled,
  id,
  maxDate,
  minDate,
  onBlur,
  onChange,
  placeholder,
  title,
  value,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState<Date>(value ?? new Date());
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setMonth(value);
    }
  }, [value]);

  // Scroll to selected hour/minute when popover opens with a value
  useEffect(() => {
    if (!(isOpen && value)) {
      return;
    }
    const hourIndex = HOURS.indexOf(value.getHours() % 12 || 12);
    const minuteIndex = MINUTES.indexOf(value.getMinutes());
    // Defer to next frame so the popover content is rendered
    requestAnimationFrame(() => {
      scrollToSelected(hourRef.current, hourIndex);
      scrollToSelected(minuteRef.current, minuteIndex);
    });
  }, [isOpen, value]);

  const handleDateSelect = useEventCallback(
    (selectedDate: Date | undefined) => {
      if (!selectedDate) {
        return;
      }
      const merged = new Date(selectedDate);
      if (value) {
        merged.setHours(value.getHours(), value.getMinutes());
      }
      onChange(merged);
    }
  );

  const handleTimeChange = useCallback(
    (type: "hour" | "minute" | "ampm", val: string) => {
      if (!value) {
        return;
      }
      onChange(applyTimeChange(value, type, val));
    },
    [value, onChange]
  );

  const hasDate = value !== undefined;
  const currentHour = value ? value.getHours() % 12 || 12 : undefined;
  const currentMinute = value ? value.getMinutes() : undefined;
  const currentAmPm = value ? getAmPm(value) : undefined;
  const disabledDates = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <ResponsivePicker
      onOpenChange={setIsOpen}
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
          onBlur={onBlur}
          type="button"
          variant="outline"
        >
          {value === undefined ? placeholder : format(value, DATE_TIME)}
          <HugeiconsIcon
            className="size-4 opacity-60"
            icon={Calendar01Icon}
            strokeWidth={2}
          />
        </Button>
      }
    >
      <div className="sm:flex">
        <Calendar
          autoFocus
          captionLayout="dropdown"
          defaultMonth={value}
          disabled={disabledDates.length > 0 ? disabledDates : undefined}
          mode="single"
          month={month}
          onMonthChange={setMonth}
          onSelect={handleDateSelect}
          selected={value}
        />
        <div
          className={cn(
            "flex flex-col divide-y sm:h-[300px] sm:flex-row sm:divide-x sm:divide-y-0",
            !hasDate && "pointer-events-none opacity-40"
          )}
        >
          <ScrollArea className="w-full sm:w-auto" ref={hourRef}>
            <div className="grid grid-cols-6 gap-1 p-2 sm:flex sm:flex-col sm:gap-0">
              {HOURS.map((hour) => (
                <TimeButton
                  disabled={!hasDate}
                  isSelected={currentHour === hour}
                  key={hour}
                  onTimeChange={handleTimeChange}
                  type="hour"
                  value={hour.toString()}
                >
                  {hour}
                </TimeButton>
              ))}
            </div>
          </ScrollArea>
          <ScrollArea className="w-full sm:w-auto" ref={minuteRef}>
            <div className="grid grid-cols-6 gap-1 p-2 sm:flex sm:flex-col sm:gap-0">
              {MINUTES.map((minute) => (
                <TimeButton
                  disabled={!hasDate}
                  isSelected={currentMinute === minute}
                  key={minute}
                  onTimeChange={handleTimeChange}
                  type="minute"
                  value={minute.toString()}
                >
                  {minute.toString().padStart(2, "0")}
                </TimeButton>
              ))}
            </div>
          </ScrollArea>
          <div className="flex p-2 sm:flex-col">
            {(["AM", "PM"] as const).map((ampm) => (
              <TimeButton
                disabled={!hasDate}
                isSelected={currentAmPm === ampm}
                key={ampm}
                onTimeChange={handleTimeChange}
                type="ampm"
                value={ampm}
              >
                {ampm}
              </TimeButton>
            ))}
          </div>
        </div>
      </div>
    </ResponsivePicker>
  );
}

export function DateTimeField({
  description,
  disabled = false,
  form,
  hideLabel = false,
  isRequired = false,
  label,
  maxDate,
  minDate,
  name,
  placeholder = "Pick date and time",
  validators,
}: DateTimeFieldProps) {
  useResolvedForm(form, "DateTimeField");
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
          <DateTimePicker
            ariaDescribedBy={hasError ? errorMessageId : undefined}
            ariaInvalid={hasError}
            disabled={disabled}
            id={field.name}
            maxDate={maxDate}
            minDate={minDate}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
            placeholder={placeholder}
            title={label}
            value={field.state.value}
          />
        );
      }}
    </CustomField>
  );
}
