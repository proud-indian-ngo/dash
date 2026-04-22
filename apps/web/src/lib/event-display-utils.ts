import {
  expandSeries,
  parseRecurrenceRule,
  type RecurrenceRule,
  type VirtualOccurrence,
} from "@pi-dash/shared/rrule-expand";
import { format } from "date-fns";

export interface ExpandedOccurrence {
  date: string;
  endTime: number | null;
  isSeriesParent: boolean;
  startTime: number;
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

  const seriesStartDate = format(new Date(startTime), "yyyy-MM-dd");

  const occurrences: ExpandedOccurrence[] = virtualOccs.map((occ) => ({
    date: occ.date,
    startTime: occ.startTime,
    endTime: occ.endTime,
    isSeriesParent: occ.date === seriesStartDate,
  }));

  return { occurrences, rule, seriesStartDate, virtualOccs };
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
