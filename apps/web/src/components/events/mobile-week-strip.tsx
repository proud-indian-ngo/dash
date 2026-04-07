import { ArrowLeftIcon, ArrowRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  addDays,
  addWeeks,
  format,
  isToday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { useState } from "react";

interface MobileWeekStripProps {
  datesWithEvents: Set<string>;
  onDateSelect: (date: string) => void;
  onMonthChange: (month: Date) => void;
  selectedDate: string | null;
}

export function MobileWeekStrip({
  datesWithEvents,
  onDateSelect,
  onMonthChange,
  selectedDate,
}: MobileWeekStripProps) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handlePrev = () => {
    const newWeekStart = subWeeks(weekStart, 1);
    setWeekStart(newWeekStart);
    onMonthChange(newWeekStart);
  };

  const handleNext = () => {
    const newWeekStart = addWeeks(weekStart, 1);
    setWeekStart(newWeekStart);
    onMonthChange(newWeekStart);
  };

  return (
    <div className="flex items-center gap-1">
      <Button onClick={handlePrev} size="icon" variant="ghost">
        <HugeiconsIcon icon={ArrowLeftIcon} size={16} strokeWidth={2} />
      </Button>
      <div className="flex flex-1 justify-between">
        {days.map((day) => {
          const isoDate = format(day, "yyyy-MM-dd");
          const isSelected = selectedDate === isoDate;
          const hasEvents = datesWithEvents.has(isoDate);
          const isDayToday = isToday(day);

          let dayClass = "hover:bg-muted/60";
          if (isSelected) {
            dayClass = "bg-primary text-primary-foreground";
          } else if (isDayToday) {
            dayClass = "bg-muted font-medium";
          }

          return (
            <button
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                dayClass
              )}
              key={isoDate}
              onClick={() => onDateSelect(isoDate)}
              type="button"
            >
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {format(day, "EEE")}
              </span>
              <span className="font-medium text-sm">{format(day, "d")}</span>
              {hasEvents && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1 rounded-full",
                    isSelected ? "bg-primary-foreground" : "bg-primary"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <Button onClick={handleNext} size="icon" variant="ghost">
        <HugeiconsIcon icon={ArrowRightIcon} size={16} strokeWidth={2} />
      </Button>
    </div>
  );
}
