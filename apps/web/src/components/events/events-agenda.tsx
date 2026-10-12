import { Calendar03Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Calendar,
  CalendarDayButton,
} from "@pi-dash/design-system/components/ui/calendar";
import { Input } from "@pi-dash/design-system/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cityValues } from "@pi-dash/shared/constants";
import type { EventInterest } from "@pi-dash/zero/schema";
import {
  addDays,
  endOfMonth,
  format,
  isThisYear,
  isToday,
  isTomorrow,
  parse,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";
import capitalize from "lodash/capitalize";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import React, { useMemo, useState } from "react";

import { EventRow } from "@/components/events/event-row";
import { MobileWeekStrip } from "@/components/events/mobile-week-strip";
import {
  buildPublicDisplayRows,
  type PublicDisplayRow,
  type PublicEventFilter,
  type PublicEventRow,
  rowMatchesPublicFilters,
  selectUpcomingPublicKalakritiEvent,
  toPublicDisplayRow,
} from "@/components/events/public-events-table";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { DATE, ISO_DATE } from "@/lib/date-formats";

/** Days of events each tab shows before "Show more". */
const WINDOW_DAYS = 90;

const WHEN_VALUES = ["upcoming", "past"] as const;
type When = (typeof WHEN_VALUES)[number];

const SHOW_OPTIONS: { label: string; value: PublicEventFilter }[] = [
  { label: "All events", value: "all" },
  { label: "My teams", value: "my-teams" },
  { label: "Public", value: "public" },
];

const DatesWithEventsContext = React.createContext<ReadonlySet<string>>(
  new Set()
);

function EventDayButton({
  children,
  day,
  ...props
}: React.ComponentProps<typeof CalendarDayButton>) {
  const datesWithEvents = React.useContext(DatesWithEventsContext);
  return (
    <CalendarDayButton day={day} {...props}>
      {children}
      {datesWithEvents.has(format(day.date, ISO_DATE)) ? (
        <span
          aria-hidden="true"
          className="bg-primary pointer-events-none absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full opacity-100!"
        />
      ) : null}
    </CalendarDayButton>
  );
}

const CALENDAR_COMPONENTS = { DayButton: EventDayButton };

/** "Fri 16 Oct", with the year outside this year and Today/Tomorrow first. */
function formatDayHeading(date: Date): string {
  const label = format(date, isThisYear(date) ? "EEE d MMM" : "EEE d MMM yyyy");
  if (isToday(date)) {
    return `Today · ${label}`;
  }
  if (isTomorrow(date)) {
    return `Tomorrow · ${label}`;
  }
  return label;
}

/** An event belongs to Upcoming until it ends. */
function isUpcoming(row: PublicDisplayRow, anchor: number): boolean {
  return (row.endTime ?? row.startTime) >= anchor;
}

function groupByDay(rows: readonly PublicDisplayRow[]) {
  const groups = new Map<string, PublicDisplayRow[]>();
  for (const row of rows) {
    const key = format(row.startTime, ISO_DATE);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return [...groups.entries()];
}

function emptyMessage(when: When, show: PublicEventFilter): string {
  const scope = {
    all: "events",
    "my-teams": "events from your teams",
    public: "public events",
  }[show];
  return when === "upcoming"
    ? `No upcoming ${scope} in the next ${WINDOW_DAYS} days.`
    : `No past ${scope} in the last ${WINDOW_DAYS} days.`;
}

/** "Show 1 past event", so a search that only matches the other tab says so. */
function otherTabLabel(when: When, count: number): string {
  const noun = count === 1 ? "event" : "events";
  return when === "upcoming"
    ? `Show ${count} past ${noun}`
    : `Show ${count} upcoming ${noun}`;
}

interface EventsAgendaProps {
  data: PublicEventRow[];
  isLoading?: boolean;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  userId: string;
}

/**
 * The events agenda: Upcoming and Past tabs over day headings, each day one
 * framed list of compact rows. Search, team scope and city sit on one toolbar
 * line; the date picker jumps the list to a day.
 */
export function EventsAgenda({
  data,
  isLoading,
  myInterests,
  myTeamIds,
  userId,
}: EventsAgendaProps) {
  const [when, setWhen] = useQueryState(
    "when",
    parseAsStringLiteral(WHEN_VALUES).withDefault("upcoming")
  );
  const [show, setShow] = useQueryState(
    "show",
    parseAsStringLiteral(["all", "my-teams", "public"] as const).withDefault(
      "all"
    )
  );
  const [city, setCity] = useQueryState(
    "city",
    parseAsString.withDefault("all")
  );
  const [search, setSearch] = useQueryState("s", parseAsString.withDefault(""));
  const [from, setFrom] = useQueryState("from", parseAsString);
  const [windows, setWindows] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);

  const now = useMemo(() => Date.now(), []);
  const fromDate = from ? parse(from, ISO_DATE, new Date()) : null;
  const anchor =
    fromDate && !Number.isNaN(fromDate.getTime())
      ? startOfDay(fromDate).getTime()
      : now;
  const span = WINDOW_DAYS * windows;

  const rows = useMemo(
    () =>
      buildPublicDisplayRows(
        data,
        subDays(anchor, span).getTime(),
        addDays(anchor, span).getTime()
      ).filter((row) =>
        rowMatchesPublicFilters(row, show, city, search, myTeamIds)
      ),
    [anchor, city, data, myTeamIds, search, show, span]
  );
  const upcoming = rows
    .filter((row) => isUpcoming(row, anchor))
    .sort((a, b) => a.startTime - b.startTime);
  const past = rows
    .filter((row) => !isUpcoming(row, anchor))
    .sort((a, b) => b.startTime - a.startTime);
  const visible = when === "upcoming" ? upcoming : past;
  const otherCount = when === "upcoming" ? past.length : upcoming.length;

  const hasMultipleCities =
    new Set(data.map((event) => event.city).filter(Boolean)).size > 1;

  const featured = useMemo(() => {
    const event = selectUpcomingPublicKalakritiEvent(data, now);
    if (!event) {
      return null;
    }
    const row = toPublicDisplayRow(event);
    return rowMatchesPublicFilters(row, show, city, search, myTeamIds)
      ? row
      : null;
  }, [city, data, myTeamIds, now, search, show]);
  const showFeatured = Boolean(featured) && when === "upcoming" && !from;

  const datesWithEvents = useMemo(
    () =>
      new Set(
        buildPublicDisplayRows(
          data,
          subDays(startOfMonth(pickerMonth), 7).getTime(),
          addDays(endOfMonth(pickerMonth), 7).getTime()
        )
          .filter((row) =>
            rowMatchesPublicFilters(row, show, city, search, myTeamIds)
          )
          .map((row) => format(row.startTime, ISO_DATE))
      ),
    [city, data, myTeamIds, pickerMonth, search, show]
  );

  const handleWhenChange = useEventCallback((value: unknown) => {
    setWindows(1);
    setWhen(value === "past" ? "past" : null);
  });
  const handleShowChange = useEventCallback((value: string | null) =>
    setShow(value === "all" || !value ? null : (value as PublicEventFilter))
  );
  const handleCityChange = useEventCallback((value: string | null) =>
    setCity(value === "all" || !value ? null : value)
  );
  const handleSearch = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setSearch(event.target.value || null)
  );
  const jumpTo = useEventCallback((iso: string) => {
    setWindows(1);
    setFrom(iso);
    setWhen(null);
    setPickerOpen(false);
  });
  const handleDayClick = useEventCallback((day: Date) =>
    jumpTo(format(day, ISO_DATE))
  );
  const clearFrom = useEventCallback(() => {
    setWindows(1);
    setFrom(null);
  });
  const showMore = useEventCallback(() => setWindows((count) => count + 1));
  const switchTab = useEventCallback(() =>
    handleWhenChange(when === "upcoming" ? "past" : "upcoming")
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="md:hidden">
        <MobileWeekStrip
          datesWithEvents={datesWithEvents}
          onDateSelect={jumpTo}
          onMonthChange={setPickerMonth}
          selectedDate={from}
        />
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 md:border-b">
        <Tabs
          className="border-b md:border-b-0"
          onValueChange={handleWhenChange}
          value={when}
        >
          <TabsList className="h-9 gap-4 px-0" variant="line">
            <TabsTrigger className="flex-none px-0" value="upcoming">
              Upcoming
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {upcoming.length}
              </span>
            </TabsTrigger>
            <TabsTrigger className="flex-none px-0" value="past">
              Past
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {past.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 flex-wrap items-center gap-2 md:justify-end md:pb-1">
          <Input
            aria-label="Search events"
            className="h-8 min-w-40 flex-1 md:w-56 md:flex-none"
            onChange={handleSearch}
            placeholder="Search events..."
            type="search"
            value={search}
          />
          <Select onValueChange={handleShowChange} value={show}>
            <SelectTrigger aria-label="Show" className="h-8">
              <SelectValue>
                {SHOW_OPTIONS.find((option) => option.value === show)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SHOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasMultipleCities ? (
            <Select onValueChange={handleCityChange} value={city}>
              <SelectTrigger aria-label="City" className="h-8">
                <SelectValue>
                  {city === "all" ? "All cities" : capitalize(city)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cityValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {capitalize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {from ? (
            <Button
              aria-label={`Showing from ${format(anchor, DATE)}. Clear date`}
              onClick={clearFrom}
              size="sm"
              variant="secondary"
            >
              From {format(anchor, DATE)}
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          ) : null}
          <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  aria-label="Jump to a date"
                  className="hidden md:inline-flex"
                  size="icon-sm"
                  variant="outline"
                />
              }
            >
              <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-2">
              <DatesWithEventsContext.Provider value={datesWithEvents}>
                <Calendar
                  components={CALENDAR_COMPONENTS}
                  month={pickerMonth}
                  onDayClick={handleDayClick}
                  onMonthChange={setPickerMonth}
                  selected={fromDate ?? undefined}
                />
              </DatesWithEventsContext.Provider>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="flex flex-col gap-5">
          {showFeatured && featured ? (
            <section aria-label="Upcoming Kalakriti" className="space-y-2">
              <h2 className="text-muted-foreground text-sm font-medium">
                Kalakriti · volunteer for the next edition
              </h2>
              <ul className="border-primary/30 bg-primary/5 rounded-lg border">
                <EventRow
                  myInterests={myInterests}
                  myTeamIds={myTeamIds}
                  row={featured}
                  showDate
                  userId={userId}
                />
              </ul>
            </section>
          ) : null}

          {visible.length > 0 ? (
            <ul className="overflow-hidden rounded-lg border">
              {groupByDay(visible).map(([day, dayRows]) => (
                <li className="[&:last-child>ul]:border-b-0" key={day}>
                  <h2 className="bg-muted/60 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
                    {formatDayHeading(parse(day, ISO_DATE, new Date()))}
                  </h2>
                  <ul className="divide-y border-b">
                    {dayRows.map((row) => (
                      <EventRow
                        key={`${row.eventId}-${row.startTime}`}
                        myInterests={myInterests}
                        myTeamIds={myTeamIds}
                        row={row}
                        userId={userId}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}

          {visible.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
              <p>{emptyMessage(when, show)}</p>
              {otherCount > 0 ? (
                <Button onClick={switchTab} size="sm" variant="outline">
                  {otherTabLabel(when, otherCount)}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-center">
            <Button onClick={showMore} size="sm" variant="ghost">
              Show {WINDOW_DAYS} more days
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
