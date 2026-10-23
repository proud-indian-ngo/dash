import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar as BaseCalendar,
  CalendarDayButton,
} from "@pi-dash/design-system/components/ui/calendar";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentProps } from "react";

type CalendarProps = ComponentProps<typeof BaseCalendar>;
type CalendarComponents = NonNullable<CalendarProps["components"]>;

// The design-system Calendar declares these inline, so each of its renders
// gives them new identities and React remounts the day grid. A click whose
// press and release straddle a parent re-render then lands on a replaced
// button and is lost. Module-level copies keep the grid mounted.
const STABLE_COMPONENTS: CalendarComponents = {
  Root: ({ className, rootRef, ...props }) => (
    <div className={className} data-slot="calendar" ref={rootRef} {...props} />
  ),
  Chevron: ({ className, orientation, ...props }) => {
    let icon = ArrowDownIcon;
    if (orientation === "left") {
      icon = ArrowLeftIcon;
    } else if (orientation === "right") {
      icon = ArrowRightIcon;
    }
    return (
      <HugeiconsIcon
        className={cn("size-4", className)}
        icon={icon}
        strokeWidth={2}
        {...props}
      />
    );
  },
  DayButton: CalendarDayButton,
  WeekNumber: ({ children, ...props }) => (
    <td {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">
        {children}
      </div>
    </td>
  ),
};

export function Calendar({ components, ...props }: CalendarProps) {
  return (
    <BaseCalendar
      components={{ ...STABLE_COMPONENTS, ...components }}
      {...props}
    />
  );
}
