import { toPublicArea } from "@pi-dash/shared/public-events";
import type { TeamEvent, TeamEventMember } from "@pi-dash/zero/schema";
import { addWeeks } from "date-fns";

import {
  expandSeriesOccurrences,
  sortUpcomingFirstThenPast,
} from "@/lib/event-display-utils";

export type PublicEventRow = TeamEvent & {
  exceptions: readonly (TeamEvent & { members: readonly TeamEventMember[] })[];
  members: readonly TeamEventMember[];
  team: { id: string; name: string } | undefined;
};

/** A cost centre's name ("City"), or "" while the centres load. */
export type CityNameOf = (costCentreId: string | null | undefined) => string;

export interface PublicDisplayRow {
  /** The event's cost centre name ("City"), or "" while it loads. */
  cityName: string;
  costCentreId: string | null;
  endTime: number | null;
  eventId: string;
  isPublic: boolean | null;
  isVirtualOccurrence: boolean;
  location: string | null;
  members: readonly TeamEventMember[];
  name: string;
  occDate: string | null;
  /** Admin-set neighbourhood, shown instead of a raw map link. */
  publicArea: string | null;
  /** RRULE of the series the row belongs to; null for one-off events. */
  recurrenceRule: string | null;
  startTime: number;
  team: { id: string; name: string } | undefined;
  teamId: string;
  volunteersNeeded: number | null;
}

export type PublicEventFilter = "all" | "my-teams" | "public";

const URL_PATTERN = /^https?:\/\//i;

/** The row's location when it is a link, shown as "Map". */
export function rowMapUrl(row: Pick<PublicDisplayRow, "location">) {
  return row.location && URL_PATTERN.test(row.location) ? row.location : null;
}

/**
 * Where the row says the event is: a typed address beats the coarse area,
 * and a bare map link falls back to the area and city.
 */
export function rowPlace(
  row: Pick<PublicDisplayRow, "cityName" | "location" | "publicArea">
): string | null {
  if (row.location && !rowMapUrl(row)) {
    return row.location;
  }
  return row.cityName
    ? toPublicArea(row.publicArea, row.cityName)
    : row.publicArea;
}

export function selectUpcomingPublicKalakritiEvent(
  events: readonly PublicEventRow[],
  now = Date.now()
): PublicEventRow | null {
  let soonest: PublicEventRow | null = null;
  for (const event of events) {
    if (event.managementDomain !== "kalakriti") {
      continue;
    }
    if (!event.isPublic) {
      continue;
    }
    if (event.cancelledAt) {
      continue;
    }
    if (event.startTime < now) {
      continue;
    }
    if (!soonest || event.startTime < soonest.startTime) {
      soonest = event;
    }
  }
  return soonest;
}

export function toPublicDisplayRow(
  event: PublicEventRow,
  cityNameOf: CityNameOf
): PublicDisplayRow {
  return {
    cityName: cityNameOf(event.costCentreId),
    costCentreId: event.costCentreId ?? null,
    endTime: event.endTime ?? null,
    eventId: event.id,
    isPublic: event.isPublic ?? null,
    isVirtualOccurrence: false,
    location: event.location ?? null,
    members: event.members,
    name: event.name,
    occDate: null,
    publicArea: event.publicArea ?? null,
    recurrenceRule: event.recurrenceRule?.rrule ?? null,
    startTime: event.startTime,
    team: event.team,
    teamId: event.teamId,
    volunteersNeeded: event.volunteersNeeded ?? null,
  };
}

export function rowMatchesPublicFilters(
  row: PublicDisplayRow,
  filter: PublicEventFilter,
  cityFilter: string,
  search: string,
  myTeamIds: ReadonlySet<string>
): boolean {
  if (filter === "my-teams" && !myTeamIds.has(row.teamId)) {
    return false;
  }
  if (filter === "public" && !row.isPublic) {
    return false;
  }
  // The city filter holds a cost centre id.
  if (cityFilter !== "all" && row.costCentreId !== cityFilter) {
    return false;
  }
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return [row.name, row.location, rowPlace(row), row.team?.name, row.cityName]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function expandSeriesRows(
  event: PublicEventRow,
  base: Omit<PublicDisplayRow, "startTime" | "occDate" | "isVirtualOccurrence">,
  rangeStart: number,
  rangeEnd: number
): PublicDisplayRow[] {
  const result = expandSeriesOccurrences(
    event.recurrenceRule,
    event.startTime,
    event.endTime,
    event.exceptions,
    rangeStart,
    rangeEnd
  );
  if (!result) {
    return [];
  }

  const rows: PublicDisplayRow[] = [];
  const virtualMembers = event.inheritVolunteers ? event.members : [];

  for (const occ of result.occurrences) {
    rows.push({
      ...base,
      endTime: occ.endTime,
      isVirtualOccurrence: !occ.isSeriesParent,
      members: occ.isSeriesParent ? event.members : virtualMembers,
      occDate: occ.isSeriesParent ? null : occ.date,
      startTime: occ.startTime,
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
        isVirtualOccurrence: false,
        location: exc.location,
        members: exc.members,
        name: exc.name,
        occDate: exc.originalDate,
        publicArea: exc.publicArea,
        startTime: exc.startTime,
        volunteersNeeded: exc.volunteersNeeded,
      });
    }
  }

  return rows;
}

export function buildPublicDisplayRows(
  data: PublicEventRow[],
  cityNameOf: CityNameOf,
  rangeStart = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000,
  rangeEnd = addWeeks(new Date(), 4).getTime()
): PublicDisplayRow[] {
  const rows: PublicDisplayRow[] = [];

  for (const event of data) {
    const base = {
      cityName: cityNameOf(event.costCentreId),
      costCentreId: event.costCentreId,
      endTime: event.endTime,
      eventId: event.id,
      isPublic: event.isPublic,
      location: event.location,
      members: event.members,
      name: event.name,
      publicArea: event.publicArea,
      recurrenceRule: event.recurrenceRule?.rrule ?? null,
      team: event.team,
      teamId: event.teamId,
      volunteersNeeded: event.volunteersNeeded,
    };

    if (!event.recurrenceRule) {
      if (event.startTime >= rangeStart && event.startTime <= rangeEnd) {
        rows.push({
          ...base,
          isVirtualOccurrence: false,
          occDate: null,
          startTime: event.startTime,
        });
      }
      continue;
    }

    rows.push(...expandSeriesRows(event, base, rangeStart, rangeEnd));
  }

  return sortUpcomingFirstThenPast(rows);
}
