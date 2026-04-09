import type { EventInterest } from "@pi-dash/zero/schema";
import { format, isToday, isTomorrow } from "date-fns";
import { EventCard } from "@/components/events/event-card";
import type { PublicDisplayRow } from "@/components/events/public-events-table";

interface EventDateGroupProps {
  date: Date;
  groupRef: (el: HTMLDivElement | null) => void;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  rows: PublicDisplayRow[];
  userId: string;
}

function formatGroupDate(date: Date): string {
  const currentYear = new Date().getFullYear();
  const datePattern =
    date.getFullYear() === currentYear ? "EEE, MMM d" : "EEE, MMM d, yyyy";
  if (isToday(date)) {
    return `Today · ${format(date, datePattern)}`;
  }
  if (isTomorrow(date)) {
    return `Tomorrow · ${format(date, datePattern)}`;
  }
  return format(date, datePattern);
}

export function EventDateGroup({
  date,
  groupRef,
  myInterests,
  myTeamIds,
  rows,
  userId,
}: EventDateGroupProps) {
  return (
    <div ref={groupRef}>
      <h2 className="sticky top-0 z-10 bg-background/95 px-1 py-2 font-medium text-muted-foreground text-sm backdrop-blur">
        {formatGroupDate(date)}
      </h2>
      <div className="flex flex-col gap-2 pt-px">
        {rows.map((row) => (
          <EventCard
            key={`${row.eventId}-${row.startTime}`}
            myInterests={myInterests}
            myTeamIds={myTeamIds}
            row={row}
            userId={userId}
          />
        ))}
      </div>
    </div>
  );
}
