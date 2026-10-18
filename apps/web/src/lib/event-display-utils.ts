import {
  expandSeries,
  parseRecurrenceRule,
  type RecurrenceRule,
  seriesStartDate,
  type VirtualOccurrence,
} from "@pi-dash/shared/rrule-expand";

export interface ExpandedOccurrence {
  date: string;
  endTime: number | null;
  isSeriesParent: boolean;
  startTime: number;
}

/**
 * The occurrence date an event page shows, or undefined when it shows the
 * row itself. A series parent is its own first session, so its start date
 * opens the parent rather than a virtual occurrence.
 */
export function sessionOccDate(
  event: {
    recurrenceRule: unknown;
    seriesId: string | null;
    startTime: number;
  },
  occDate: string | undefined
): string | undefined {
  if (
    occDate &&
    event.recurrenceRule &&
    !event.seriesId &&
    occDate === seriesStartDate(event.startTime)
  ) {
    return undefined;
  }
  return occDate;
}

/**
 * A saved row on a series' own start date. A "this and following" split
 * moves the split-day session there, and older code could create one. A live
 * row is the first session, so the parent's page points to it; a cancelled
 * one means the first session was cancelled.
 */
export function startDateRow(event: {
  exceptions: readonly {
    cancelledAt: number | null;
    id: string;
    originalDate: string | null;
  }[];
  recurrenceRule: unknown;
  seriesId: string | null;
  startTime: number;
}): { cancelled: boolean; id: string } | undefined {
  if (!event.recurrenceRule || event.seriesId) {
    return undefined;
  }
  const firstDate = seriesStartDate(event.startTime);
  const row = event.exceptions.find((e) => e.originalDate === firstDate);
  return row ? { cancelled: row.cancelledAt !== null, id: row.id } : undefined;
}

export function expandSeriesOccurrences(
  recurrenceRule: unknown,
  startTime: number,
  endTime: number | null,
  exceptions: readonly { originalDate: string | null }[],
  rangeStart: number,
  rangeEnd: number
): {
  occurrences: ExpandedOccurrence[];
  rule: RecurrenceRule;
  seriesStartDate: string;
  virtualOccs: VirtualOccurrence[];
} | null {
  const rule = parseRecurrenceRule(recurrenceRule);
  if (!rule) {
    return null;
  }

  const exceptionDates = new Set<string>();
  for (const exc of exceptions) {
    if (exc.originalDate) {
      exceptionDates.add(exc.originalDate);
    }
  }

  const virtualOccs = expandSeries(
    rule,
    startTime,
    endTime,
    rangeStart,
    rangeEnd,
    exceptionDates
  );

  const firstDate = seriesStartDate(startTime);

  const occurrences: ExpandedOccurrence[] = virtualOccs.map((occ) => ({
    date: occ.date,
    endTime: occ.endTime,
    isSeriesParent: occ.date === firstDate,
    startTime: occ.startTime,
  }));

  return { occurrences, rule, seriesStartDate: firstDate, virtualOccs };
}

export function sortUpcomingFirstThenPast<T extends { startTime: number }>(
  rows: T[]
): T[] {
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
