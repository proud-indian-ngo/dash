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
 * A legacy exception row saved on a series' own start date, which earlier
 * code could create; its interest and records belong to the first session.
 */
export function firstSessionExceptionId(event: {
  exceptions: readonly { id: string; originalDate: string | null }[];
  recurrenceRule: unknown;
  seriesId: string | null;
  startTime: number;
}): string | undefined {
  if (!event.recurrenceRule || event.seriesId) {
    return undefined;
  }
  const firstDate = seriesStartDate(event.startTime);
  return event.exceptions.find((e) => e.originalDate === firstDate)?.id;
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
