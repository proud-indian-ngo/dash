import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import type { TeamEvent, TeamEventMember } from "@pi-dash/zero/schema";
import { addWeeks } from "date-fns";

export type PublicEventRow = TeamEvent & {
  exceptions: readonly (TeamEvent & { members: readonly TeamEventMember[] })[];
  members: readonly TeamEventMember[];
  team: { id: string; name: string } | undefined;
};

export interface PublicDisplayRow {
  endTime: number | null;
  eventId: string;
  isPublic: boolean | null;
  location: string | null;
  members: readonly TeamEventMember[];
  name: string;
  occDate: string | null;
  startTime: number;
  team: { id: string; name: string } | undefined;
  teamId: string;
}

export function buildPublicDisplayRows(
  data: PublicEventRow[],
  rangeStart = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000,
  rangeEnd = addWeeks(new Date(), 4).getTime()
): PublicDisplayRow[] {
  const now = Date.now();
  const rows: PublicDisplayRow[] = [];

  for (const event of data) {
    const rule = parseRecurrenceRule(event.recurrenceRule);
    const base = {
      endTime: event.endTime,
      eventId: event.id,
      isPublic: event.isPublic,
      name: event.name,
      location: event.location,
      members: event.members,
      team: event.team,
      teamId: event.teamId,
    };

    if (!rule) {
      if (event.startTime >= rangeStart && event.startTime <= rangeEnd) {
        rows.push({ ...base, startTime: event.startTime, occDate: null });
      }
      continue;
    }

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
    for (const occ of occs) {
      rows.push({
        ...base,
        endTime: occ.endTime,
        startTime: occ.startTime,
        occDate: occ.date,
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
        });
      }
    }
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
