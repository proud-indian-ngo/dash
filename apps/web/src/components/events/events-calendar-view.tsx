import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Calendar,
  CalendarDayButton,
} from "@pi-dash/design-system/components/ui/calendar";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cityValues } from "@pi-dash/shared/constants";
import type { EventInterest } from "@pi-dash/zero/schema";
import {
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";
import capitalize from "lodash/capitalize";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { EventDateGroup } from "@/components/events/event-date-group";
import { MobileWeekStrip } from "@/components/events/mobile-week-strip";
import {
  buildPublicDisplayRows,
  type PublicDisplayRow,
  type PublicEventRow,
} from "@/components/events/public-events-table";

const DatesWithEventsContext = React.createContext<Set<string>>(new Set());

interface EventsCalendarViewProps {
  data: PublicEventRow[];
  isLoading?: boolean;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  userId: string;
}

type EventFilter = "all" | "my-teams" | "public";

const FILTERS: { label: string; value: EventFilter }[] = [
  { label: "All", value: "all" },
  { label: "My Teams", value: "my-teams" },
  { label: "Public", value: "public" },
];

type TimeScope = "all" | "this-week" | "this-month";

const TIME_SCOPES: { label: string; value: TimeScope }[] = [
  { label: "All", value: "all" },
  { label: "This Week", value: "this-week" },
  { label: "This Month", value: "this-month" },
];

function parseLocalDate(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date());
}

function searchRow(row: PublicDisplayRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.location ?? "", row.team?.name ?? "", row.city ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function EventCalendarDayButton({
  children,
  day,
  ...props
}: React.ComponentProps<typeof CalendarDayButton>) {
  const datesWithEvents = React.useContext(DatesWithEventsContext);
  const isoDate = format(day.date, "yyyy-MM-dd");
  const hasEvents = datesWithEvents.has(isoDate);

  return (
    <CalendarDayButton day={day} {...props}>
      {children}
      {hasEvents && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary opacity-100!"
        />
      )}
    </CalendarDayButton>
  );
}

const CALENDAR_COMPONENTS = { DayButton: EventCalendarDayButton };

function groupRowsByDate(
  rows: PublicDisplayRow[]
): Map<string, PublicDisplayRow[]> {
  const map = new Map<string, PublicDisplayRow[]>();
  for (const row of rows) {
    const key = format(row.startTime, "yyyy-MM-dd");
    const existing = map.get(key);
    if (existing) {
      existing.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

function timeScopeLabel(scope: TimeScope): string {
  if (scope === "this-week") {
    return "this week";
  }
  if (scope === "this-month") {
    return "this month";
  }
  return "this month";
}

function emptyMessage(filter: EventFilter, scope: TimeScope): string {
  const period = timeScopeLabel(scope);
  if (filter === "my-teams") {
    return `No events from your teams ${period}.`;
  }
  if (filter === "public") {
    return `No public events ${period}.`;
  }
  return `No events ${period}.`;
}

export function EventsCalendarView({
  data,
  isLoading,
  myInterests,
  myTeamIds,
  userId,
}: EventsCalendarViewProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [timeScope, setTimeScope] = useState<TimeScope>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const calendarRangeStart = useMemo(
    () => subWeeks(startOfMonth(selectedMonth), 1).getTime(),
    [selectedMonth]
  );
  const calendarRangeEnd = useMemo(
    () => addWeeks(endOfMonth(selectedMonth), 1).getTime(),
    [selectedMonth]
  );

  const now = useMemo(() => new Date(), []);

  const [rangeStart, rangeEnd] = useMemo(() => {
    if (timeScope === "this-week") {
      return [
        startOfWeek(now, { weekStartsOn: 1 }).getTime(),
        endOfWeek(now, { weekStartsOn: 1 }).getTime(),
      ];
    }
    if (timeScope === "this-month") {
      return [startOfMonth(now).getTime(), endOfMonth(now).getTime()];
    }
    return [calendarRangeStart, calendarRangeEnd];
  }, [timeScope, now, calendarRangeStart, calendarRangeEnd]);

  const allDisplayRows = useMemo(
    () => buildPublicDisplayRows(data, rangeStart, rangeEnd),
    [data, rangeStart, rangeEnd]
  );

  const hasMultipleCities =
    new Set(allDisplayRows.map((r) => r.city).filter(Boolean)).size > 1;

  const displayRows = useMemo(() => {
    let rows = allDisplayRows;
    if (filter === "my-teams") {
      rows = rows.filter((r) => myTeamIds.has(r.teamId));
    } else if (filter === "public") {
      rows = rows.filter((r) => r.isPublic);
    }
    if (cityFilter !== "all") {
      rows = rows.filter((r) => r.city === cityFilter);
    }
    if (search.trim()) {
      rows = rows.filter((r) => searchRow(r, search));
    }
    return rows;
  }, [allDisplayRows, filter, cityFilter, myTeamIds, search]);

  const datesWithEvents = useMemo(
    () => new Set(displayRows.map((r) => format(r.startTime, "yyyy-MM-dd"))),
    [displayRows]
  );

  const groupedRows = useMemo(
    () => groupRowsByDate(displayRows),
    [displayRows]
  );

  const dateRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleDateSelect = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    setTimeout(() => {
      dateRefs.current
        .get(dateStr)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const handleCalendarDayClick = useCallback(
    (date: Date) => {
      handleDateSelect(format(date, "yyyy-MM-dd"));
    },
    [handleDateSelect]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="hidden md:block md:w-[280px] md:shrink-0">
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="flex-1 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list
            <Skeleton className="h-20 w-full" key={i} />
          ))}
        </div>
      </div>
    );
  }

  const dateEntries = Array.from(groupedRows.entries());
  const nowMs = Date.now();
  const pastIndex = dateEntries.findIndex(
    ([, rows]) => (rows[0]?.startTime ?? 0) < nowMs
  );
  const upcomingEntries =
    pastIndex === -1 ? dateEntries : dateEntries.slice(0, pastIndex);
  const pastEntries = pastIndex === -1 ? [] : dateEntries.slice(pastIndex);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden space-y-3 md:block md:w-[280px] md:shrink-0">
        <DatesWithEventsContext.Provider value={datesWithEvents}>
          <Calendar
            components={CALENDAR_COMPONENTS}
            month={selectedMonth}
            onDayClick={handleCalendarDayClick}
            onMonthChange={setSelectedMonth}
            selected={selectedDate ? parseLocalDate(selectedDate) : undefined}
          />
        </DatesWithEventsContext.Provider>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Show</p>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(({ label, value }) => (
              <Button
                key={value}
                onClick={() => setFilter(value)}
                size="sm"
                variant={filter === value ? "default" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Time</p>
          <div className="flex flex-wrap gap-1">
            {TIME_SCOPES.map(({ label, value }) => (
              <Button
                key={value}
                onClick={() => setTimeScope(value)}
                size="sm"
                variant={timeScope === value ? "default" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        {hasMultipleCities ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">City</p>
            <div className="flex flex-wrap gap-1">
              <Button
                onClick={() => setCityFilter("all")}
                size="sm"
                variant={cityFilter === "all" ? "default" : "ghost"}
              >
                All
              </Button>
              {cityValues.map((city) => (
                <Button
                  key={city}
                  onClick={() => setCityFilter(city)}
                  size="sm"
                  variant={cityFilter === city ? "default" : "ghost"}
                >
                  {capitalize(city)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      {/* Mobile week strip + filters */}
      <div className="space-y-3 md:hidden">
        <MobileWeekStrip
          datesWithEvents={datesWithEvents}
          onDateSelect={handleDateSelect}
          onMonthChange={setSelectedMonth}
          selectedDate={selectedDate}
        />
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Show</p>
          <div className="flex gap-1">
            {FILTERS.map(({ label, value }) => (
              <Button
                key={value}
                onClick={() => setFilter(value)}
                size="sm"
                variant={filter === value ? "default" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Time</p>
          <div className="flex gap-1">
            {TIME_SCOPES.map(({ label, value }) => (
              <Button
                key={value}
                onClick={() => setTimeScope(value)}
                size="sm"
                variant={timeScope === value ? "default" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        {hasMultipleCities ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">City</p>
            <div className="flex gap-1">
              <Button
                onClick={() => setCityFilter("all")}
                size="sm"
                variant={cityFilter === "all" ? "default" : "ghost"}
              >
                All
              </Button>
              {cityValues.map((city) => (
                <Button
                  key={city}
                  onClick={() => setCityFilter(city)}
                  size="sm"
                  variant={cityFilter === city ? "default" : "ghost"}
                >
                  {capitalize(city)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Event card list */}
      <main className="min-w-0 flex-1 space-y-4">
        <Input
          className="max-w-sm"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events..."
          type="search"
          value={search}
        />
        {dateEntries.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {emptyMessage(filter, timeScope)}
          </p>
        ) : (
          <div className="space-y-6">
            {upcomingEntries.map(([dateStr, rows]) => (
              <EventDateGroup
                date={parseLocalDate(dateStr)}
                groupRef={(el) => {
                  if (el) {
                    dateRefs.current.set(dateStr, el);
                  } else {
                    dateRefs.current.delete(dateStr);
                  }
                }}
                key={dateStr}
                myInterests={myInterests}
                myTeamIds={myTeamIds}
                rows={rows}
                userId={userId}
              />
            ))}
            {pastEntries.length > 0 && (
              <>
                <h2 className="border-t pt-4 font-medium text-muted-foreground text-sm">
                  Past Events
                </h2>
                {pastEntries.map(([dateStr, rows]) => (
                  <EventDateGroup
                    date={parseLocalDate(dateStr)}
                    groupRef={(el) => {
                      if (el) {
                        dateRefs.current.set(dateStr, el);
                      } else {
                        dateRefs.current.delete(dateStr);
                      }
                    }}
                    key={dateStr}
                    myInterests={myInterests}
                    myTeamIds={myTeamIds}
                    rows={rows}
                    userId={userId}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
