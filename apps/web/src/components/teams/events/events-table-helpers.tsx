import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  expandSeries,
  parseRecurrenceRule,
  type RecurrenceRule,
  type VirtualOccurrence,
} from "@pi-dash/shared/rrule-expand";
import { rruleToLabel } from "@pi-dash/zero/rrule-utils";
import type {
  TeamEvent,
  TeamEventMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import { addWeeks, format } from "date-fns";
import upperFirst from "lodash/upperFirst";
import { parseRuleUntil } from "./rrule-until";

export type EventRow = TeamEvent & {
  exceptions: ReadonlyArray<
    TeamEvent & {
      members: ReadonlyArray<TeamEventMember & { user: User | undefined }>;
      whatsappGroup: WhatsappGroup | undefined;
    }
  >;
  members: ReadonlyArray<TeamEventMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

/** A display row in the events table — can be a real event or a virtual occurrence. */
export interface EventDisplayRow {
  /** The effective end time for display. */
  endTime: number | null;
  /** The underlying event (series parent for virtual, the event itself for real). */
  event: EventRow;
  /** The actual event ID for this row (exception's own ID, or parent ID for virtual/standalone). */
  eventId: string;
  /** Whether this row represents a virtual (non-materialized) occurrence. */
  isVirtual: boolean;
  /** Unique display key for React/table row ID. */
  key: string;
  /** Members to display (exception's own members, or inherited from series). */
  members: ReadonlyArray<TeamEventMember & { user: User | undefined }>;
  /** The original date for this occurrence (for edits/cancels). */
  originalDate: string | null;
  /** The series parent (if this row is part of a series). */
  seriesId: string | null;
  /** The effective start time for display (virtual startTime or real startTime). */
  startTime: number;
  /** For virtual occurrences: the computed start/end times and ISO date. */
  virtual?: VirtualOccurrence;
}

/**
 * Expand series events into a flat list of display rows.
 * Combines real events (standalone + exceptions) with virtual RRULE-expanded occurrences.
 */
/** Expand a single series event into display rows (virtual + materialized exceptions). */
function expandSeriesEvent(
  event: EventRow,
  rule: RecurrenceRule,
  rangeStartMs: number,
  rangeEndMs: number
): EventDisplayRow[] {
  const rows: EventDisplayRow[] = [];

  const exceptionDates = new Set<string>();
  for (const exc of event.exceptions) {
    if (exc.originalDate) {
      exceptionDates.add(exc.originalDate);
    }
  }

  const virtualOccs = expandSeries(
    rule,
    event.startTime,
    event.endTime,
    rangeStartMs,
    rangeEndMs,
    exceptionDates
  );

  // The first RRULE occurrence matching the series parent's start date
  // IS the series parent — not a virtual occurrence.
  const seriesStartDate = format(new Date(event.startTime), "yyyy-MM-dd");

  for (const occ of virtualOccs) {
    const isSeriesParent = occ.date === seriesStartDate;
    rows.push({
      key: isSeriesParent ? event.id : `${event.id}:${occ.date}`,
      event,
      eventId: event.id,
      virtual: isSeriesParent ? undefined : occ,
      startTime: occ.startTime,
      endTime: occ.endTime,
      members: event.members,
      isVirtual: !isSeriesParent,
      seriesId: isSeriesParent ? null : event.id,
      originalDate: isSeriesParent ? null : occ.date,
    });
  }

  // No upper bound on exceptions: "this and following" splits do not migrate
  // exceptions whose originalDate >= splitDate to the new series, so orphaned
  // exceptions that now fall past the old parent's truncated UNTIL must still
  // render here — otherwise they become invisible across the whole app.
  for (const exc of event.exceptions) {
    if (exc.cancelledAt) {
      continue;
    }
    if (exc.startTime < rangeStartMs) {
      continue;
    }
    rows.push({
      key: exc.id,
      event,
      eventId: exc.id,
      startTime: exc.startTime,
      endTime: exc.endTime,
      members: exc.members,
      isVirtual: false,
      seriesId: event.id,
      originalDate: exc.originalDate,
    });
  }

  return rows;
}

export function buildEventDisplayRows(
  events: readonly EventRow[],
  rangeEnd: Date
): EventDisplayRow[] {
  const rows: EventDisplayRow[] = [];
  const rangeEndMs = rangeEnd.getTime();

  for (const event of events) {
    const rule = parseRecurrenceRule(event.recurrenceRule);

    if (!rule) {
      // Standalone events: always include (no range filter — let the table sort handle visibility)
      rows.push({
        key: event.id,
        event,
        eventId: event.id,
        startTime: event.startTime,
        endTime: event.endTime,
        members: event.members,
        isVirtual: false,
        seriesId: null,
        originalDate: null,
      });
      continue;
    }

    // Per-series bounds: start at the series parent's own DTSTART; end at the
    // rule's UNTIL (if bounded) or the caller's rangeEnd (for unbounded rules).
    const seriesRangeStart = event.startTime;
    const ruleUntil = parseRuleUntil(rule.rrule);
    const seriesRangeEnd = ruleUntil ?? rangeEndMs;
    rows.push(
      ...expandSeriesEvent(event, rule, seriesRangeStart, seriesRangeEnd)
    );
  }

  // Upcoming events first (ascending), then past events (most recent first)
  const now = Date.now();
  rows.sort((a, b) => {
    const aUpcoming = a.startTime >= now;
    const bUpcoming = b.startTime >= now;
    if (aUpcoming && !bUpcoming) {
      return -1;
    }
    if (!aUpcoming && bUpcoming) {
      return 1;
    }
    if (aUpcoming) {
      return a.startTime - b.startTime;
    }
    return b.startTime - a.startTime;
  });
  return rows;
}

/** Default range: from today to 4 weeks out. */
export function getDefaultDateRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end: addWeeks(start, 4) };
}

export type EventStatusKey = "upcoming" | "past" | "cancelled";

export function getEventStatusKey(row: EventDisplayRow): EventStatusKey {
  if (row.event.cancelledAt) {
    return "cancelled";
  }
  const eventEnd = row.endTime ?? row.startTime;
  if (new Date(eventEnd) < new Date()) {
    return "past";
  }
  return "upcoming";
}

const EVENT_STATUS_MAP: Record<
  EventStatusKey,
  {
    label: string;
    variant: "destructive" | "outline" | "secondary" | "success-outline";
  }
> = {
  cancelled: { label: "Cancelled", variant: "destructive" },
  past: { label: "Past", variant: "secondary" },
  upcoming: { label: "Upcoming", variant: "success-outline" },
};

export function getEventStatus(row: EventDisplayRow): {
  label: string;
  variant: "destructive" | "outline" | "secondary" | "success-outline";
} {
  return EVENT_STATUS_MAP[getEventStatusKey(row)];
}

export function getRecurrenceLabel(
  rule: { rrule: string } | null | undefined
): string {
  if (!rule) {
    return "One-time";
  }
  return upperFirst(rruleToLabel(rule.rrule));
}

export function searchDisplayRow(row: EventDisplayRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const e = row.event;
  return [e.name, e.description ?? "", e.location ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/** Apply occurrence date to a series parent's start/end times, preserving time-of-day and duration. */
export function applyOccurrenceDate(
  startTime: number,
  endTime: number | null,
  occDate: string
): { startTime: number; endTime: number | null } {
  const seriesStart = new Date(startTime);
  const occStart = new Date(occDate);
  occStart.setHours(
    seriesStart.getHours(),
    seriesStart.getMinutes(),
    seriesStart.getSeconds(),
    seriesStart.getMilliseconds()
  );
  const newStart = occStart.getTime();
  const duration = endTime == null ? null : endTime - startTime;
  const newEnd = duration == null ? null : newStart + duration;
  return { startTime: newStart, endTime: newEnd };
}

export const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
export const SKELETON_DATETIME = <Skeleton className="h-5 w-40" />;
export const SKELETON_LOCATION = <Skeleton className="h-5 w-28" />;
export const SKELETON_BADGE = <Skeleton className="h-5 w-16" />;
export const SKELETON_COUNT = <Skeleton className="h-5 w-10" />;
