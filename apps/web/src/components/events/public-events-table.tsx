import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import type { TeamEvent, TeamEventMember } from "@pi-dash/zero/schema";
import { addWeeks, format } from "date-fns";

export type PublicEventRow = TeamEvent & {
  exceptions: readonly (TeamEvent & { members: readonly TeamEventMember[] })[];
  members: readonly TeamEventMember[];
  team: { id: string; name: string } | undefined;
};

export interface PublicDisplayRow {
  city: string | null;
  endTime: number | null;
  eventId: string;
  isPublic: boolean | null;
  isVirtualOccurrence: boolean;
  location: string | null;
  members: readonly TeamEventMember[];
  name: string;
  occDate: string | null;
  startTime: number;
  team: { id: string; name: string } | undefined;
  teamId: string;
}

function expandSeriesRows(
  event: PublicEventRow,
  base: Omit<PublicDisplayRow, "startTime" | "occDate" | "isVirtualOccurrence">,
  rangeStart: number,
  rangeEnd: number
): PublicDisplayRow[] {
  const rule = parseRecurrenceRule(event.recurrenceRule);
  if (!rule) {
    return [];
  }

  const rows: PublicDisplayRow[] = [];
  const exceptionDates = new Set<string>();
  for (const exc of event.exceptions) {
    if (exc.originalDate) {
      exceptionDates.add(exc.originalDate);
    }
  }

  const occs = expandSeries(
    rule,
    event.startTime,
    event.endTime,
    rangeStart,
    rangeEnd,
    exceptionDates
  );
  const seriesStartDate = format(new Date(event.startTime), "yyyy-MM-dd");
  const virtualMembers = event.inheritVolunteers ? event.members : [];
  for (const occ of occs) {
    const isSeriesParent = occ.date === seriesStartDate;
    rows.push({
      ...base,
      endTime: occ.endTime,
      members: isSeriesParent ? event.members : virtualMembers,
      startTime: occ.startTime,
      occDate: isSeriesParent ? null : occ.date,
      isVirtualOccurrence: !isSeriesParent,
    });
  }

  for (const exc of event.exceptions) {
    if (
      !exc.cancelledAt &&
      exc.startTime >= rangeStart &&
      exc.startTime <= rangeEnd
    ) {
      rows.push({
        ...base,
        endTime: exc.endTime,
        eventId: exc.id,
        isPublic: exc.isPublic,
        location: exc.location,
        startTime: exc.startTime,
        members: exc.members,
        name: exc.name,
        occDate: exc.originalDate,
        isVirtualOccurrence: false,
      });
    }
  }

  return rows;
}

export function buildPublicDisplayRows(
  data: PublicEventRow[],
  rangeStart = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000,
  rangeEnd = addWeeks(new Date(), 4).getTime()
): PublicDisplayRow[] {
  const now = Date.now();
  const rows: PublicDisplayRow[] = [];

  for (const event of data) {
    const base = {
      city: event.city,
      endTime: event.endTime,
      eventId: event.id,
      isPublic: event.isPublic,
      name: event.name,
      location: event.location,
      members: event.members,
      team: event.team,
      teamId: event.teamId,
    };

    if (!event.recurrenceRule) {
      if (event.startTime >= rangeStart && event.startTime <= rangeEnd) {
        rows.push({
          ...base,
          startTime: event.startTime,
          occDate: null,
          isVirtualOccurrence: false,
        });
      }
      continue;
    }

    rows.push(...expandSeriesRows(event, base, rangeStart, rangeEnd));
  }

  // Upcoming first (ascending), then past (most recent first)
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
