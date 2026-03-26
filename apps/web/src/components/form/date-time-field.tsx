import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import {
  ScrollArea,
  ScrollBar,
} from "@pi-dash/design-system/components/ui/scroll-area";
import { cn } from "@pi-dash/design-system/lib/utils";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHORT_MONTH_DATE_TIME } from "@/lib/date-formats";

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

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      return;
    }
    const merged = new Date(selectedDate);
    if (value) {
      merged.setHours(value.getHours(), value.getMinutes());
    }
    onChange(merged);
  };

  const handleTimeChange = useCallback(
    (type: "hour" | "minute" | "ampm", val: string) => {
      if (!value) {
        return;
      }
      onChange(applyTimeChange(value, type, val));
    },
    [value, onChange]
  );

  const hasDate = value != null;
  const currentHour = value ? value.getHours() % 12 || 12 : undefined;
  const currentMinute = value ? value.getMinutes() : undefined;
  const currentAmPm = value ? getAmPm(value) : undefined;

  const disabledDates = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
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
            {value ? format(value, SHORT_MONTH_DATE_TIME) : placeholder}
            <HugeiconsIcon
              className="size-4 opacity-60"
              icon={Calendar01Icon}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <div className="sm:flex">
          <Calendar
            autoFocus
            captionLayout="dropdown"
            defaultMonth={value ?? new Date()}
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
            <ScrollArea className="w-64 sm:w-auto" ref={hourRef}>
              <div className="flex p-2 sm:flex-col">
                {HOURS.map((hour) => (
                  <Button
                    className="aspect-square shrink-0 sm:w-full"
                    disabled={!hasDate}
                    key={hour}
                    onClick={() => handleTimeChange("hour", hour.toString())}
                    size="icon"
                    type="button"
                    variant={currentHour === hour ? "default" : "ghost"}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
              <ScrollBar className="sm:hidden" orientation="horizontal" />
            </ScrollArea>
            <ScrollArea className="w-64 sm:w-auto" ref={minuteRef}>
              <div className="flex p-2 sm:flex-col">
                {MINUTES.map((minute) => (
                  <Button
                    className="aspect-square shrink-0 sm:w-full"
                    disabled={!hasDate}
                    key={minute}
                    onClick={() =>
                      handleTimeChange("minute", minute.toString())
                    }
                    size="icon"
                    type="button"
                    variant={currentMinute === minute ? "default" : "ghost"}
                  >
                    {minute.toString().padStart(2, "0")}
                  </Button>
                ))}
              </div>
              <ScrollBar className="sm:hidden" orientation="horizontal" />
            </ScrollArea>
            <div className="flex p-2 sm:flex-col">
              {(["AM", "PM"] as const).map((ampm) => (
                <Button
                  className="aspect-square shrink-0 sm:w-full"
                  disabled={!hasDate}
                  key={ampm}
                  onClick={() => handleTimeChange("ampm", ampm)}
                  size="icon"
                  type="button"
                  variant={currentAmPm === ampm ? "default" : "ghost"}
                >
                  {ampm}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
  const resolvedForm = useResolvedForm(form, "DateTimeField");
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
          <DateTimePicker
            ariaDescribedBy={hasError ? errorMessageId : undefined}
            ariaInvalid={hasError}
            disabled={disabled}
            id={field.name}
            maxDate={maxDate}
            minDate={minDate}
            onBlur={field.handleBlur}
            onChange={(value) => field.handleChange(value)}
            placeholder={placeholder}
            value={field.state.value}
          />
        );
      }}
    </CustomField>
  );
}
