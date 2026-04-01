import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { expandSeries, type RecurrenceRule } from "@pi-dash/zero/rrule-utils";
import { Link } from "@tanstack/react-router";
import { addWeeks, format } from "date-fns";
import { GhostEmptyState } from "@/components/shared/ghost-empty-state";
import { LONG_DATE_TIME } from "@/lib/date-formats";

interface TeamEventException {
  cancelledAt: number | null;
  originalDate: string | null;
  startTime: number;
}

interface TeamEvent {
  endTime: number | null;
  exceptions: readonly TeamEventException[];
  id: string;
  interests: readonly { id: string }[];
  isPublic: boolean | null;
  name: string;
  recurrenceRule: unknown;
  startTime: number;
  team: { id: string; name: string } | undefined;
}

interface UpcomingItem {
  eventId: string;
  interestCount: number;
  isPublic: boolean | null;
  name: string;
  startTime: number;
  team: { id: string; name: string } | undefined;
}

const MAX_EVENTS = 5;

function UpcomingEventsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-1 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

const GHOST_EVENTS = [
  {
    name: "Orientation Session",
    date: "Next Saturday — 10:00 AM",
    team: "Onboarding",
  },
  {
    name: "Weekend Drive",
    date: "This Sunday — 9:00 AM",
    team: "Outreach",
  },
];

function UpcomingEventsEmpty() {
  return (
    <GhostEmptyState
      ghostContent={GHOST_EVENTS.map((event) => (
        <div className="rounded-md p-2" key={event.name}>
          <p className="truncate font-medium text-sm">{event.name}</p>
          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
            <span>{event.date}</span>
            <span>&middot;</span>
            <span>{event.team}</span>
          </div>
        </div>
      ))}
    >
      <p className="text-muted-foreground text-sm">
        Events you join will appear here
      </p>
      <Link
        className="mt-1.5 inline-block font-medium text-primary text-sm underline underline-offset-4"
        to="/events"
      >
        View events
      </Link>
    </GhostEmptyState>
  );
}

function UpcomingEventsList({ items }: { items: UpcomingItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Link
          className="block rounded-md p-2 transition-colors hover:bg-muted/50"
          key={`${item.eventId}-${item.startTime}`}
          params={{ id: item.eventId }}
          to="/events/$id"
        >
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-sm">{item.name}</p>
            {item.isPublic && (
              <Badge size="xs" variant="info-light">
                Public
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
            <span>{format(item.startTime, LONG_DATE_TIME)}</span>
            {item.team && (
              <>
                <span>&middot;</span>
                <span>{item.team.name}</span>
              </>
            )}
            {item.interestCount > 0 && (
              <>
                <span>&middot;</span>
                <span>{item.interestCount} interested</span>
              </>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function UpcomingEventsContent({
  items,
  isLoading,
}: {
  items: UpcomingItem[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <UpcomingEventsSkeleton />;
  }
  if (items.length === 0) {
    return <UpcomingEventsEmpty />;
  }
  return <UpcomingEventsList items={items} />;
}

function buildUpcomingItems(events: readonly TeamEvent[]): UpcomingItem[] {
  const now = Date.now();
  const rangeEnd = addWeeks(new Date(), 8).getTime();
  const items: UpcomingItem[] = [];

  for (const event of events) {
    const rule = event.recurrenceRule as RecurrenceRule | null;
    const base = {
      eventId: event.id,
      isPublic: event.isPublic,
      name: event.name,
      team: event.team,
      interestCount: event.interests.length,
    };

    if (!rule) {
      if (event.startTime > now) {
        items.push({ ...base, startTime: event.startTime });
      }
      continue;
    }

    const exceptions = event.exceptions ?? [];
    const exceptionDates = new Set<string>();
    for (const exc of exceptions) {
      if (exc.originalDate) {
        exceptionDates.add(exc.originalDate);
      }
    }

    const occs = expandSeries(
      rule,
      event.startTime,
      event.endTime,
      now,
      rangeEnd,
      exceptionDates
    );
    for (const occ of occs) {
      items.push({ ...base, startTime: occ.startTime });
    }

    // Add back non-cancelled materialized exceptions in range
    for (const exc of exceptions) {
      if (
        !exc.cancelledAt &&
        exc.startTime >= now &&
        exc.startTime <= rangeEnd
      ) {
        items.push({ ...base, startTime: exc.startTime });
      }
    }
  }

  items.sort((a, b) => a.startTime - b.startTime);
  return items.slice(0, MAX_EVENTS);
}

export function UpcomingEvents({
  events,
  isLoading,
}: {
  events: readonly TeamEvent[];
  isLoading?: boolean;
}) {
  const upcoming = buildUpcomingItems(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <HugeiconsIcon
            className="size-4 text-purple-500"
            icon={Calendar03Icon}
            strokeWidth={2}
          />
          Upcoming Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        <UpcomingEventsContent isLoading={isLoading} items={upcoming} />
      </CardContent>
    </Card>
  );
}
