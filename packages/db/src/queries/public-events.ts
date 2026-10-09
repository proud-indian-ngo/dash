import {
  buildPublicEvents,
  type PublicEvent,
  type PublicEventSourceRow,
  type PublicEventsQuery,
  type PublicSessionSummary,
  summarizePublicSession,
} from "@pi-dash/shared/public-events";
import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { db } from "..";
import { team } from "../schema/team";
import { teamEvent } from "../schema/team-event";

// Allow-list: the feed never reads members, interests, creators, WhatsApp
// groups or the raw `location` column.
const sourceColumns = {
  cancelledAt: teamEvent.cancelledAt,
  city: teamEvent.city,
  description: teamEvent.description,
  endTime: teamEvent.endTime,
  id: teamEvent.id,
  isPublic: teamEvent.isPublic,
  managementDomain: teamEvent.managementDomain,
  name: teamEvent.name,
  originalDate: teamEvent.originalDate,
  publicArea: teamEvent.publicArea,
  recurrenceRule: teamEvent.recurrenceRule,
  seriesId: teamEvent.seriesId,
  startTime: teamEvent.startTime,
  teamName: team.name,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateKey = (epochMs: number) =>
  new Date(epochMs).toISOString().slice(0, 10);

function selectSource() {
  return db
    .select(sourceColumns)
    .from(teamEvent)
    .innerJoin(team, eq(team.id, teamEvent.teamId));
}

type SourceSelect = Awaited<ReturnType<typeof selectSource>>[number];

function toSourceRow(row: SourceSelect): PublicEventSourceRow {
  return {
    ...row,
    cancelledAt: row.cancelledAt?.getTime() ?? null,
    endTime: row.endTime?.getTime() ?? null,
    managementDomain: row.managementDomain ?? null,
    startTime: row.startTime.getTime(),
  };
}

/** Load the public, upcoming events feed for proudindian.ngo. */
export async function getPublicEvents(
  query: PublicEventsQuery,
  baseUrl: string
): Promise<PublicEvent[]> {
  const listed = and(
    eq(teamEvent.isPublic, true),
    isNull(teamEvent.cancelledAt),
    isNull(teamEvent.seriesId),
    eq(teamEvent.city, query.city),
    // Kalakriti runs its own Center-based registration; not on the website.
    isNull(teamEvent.managementDomain)
  );
  const [standalone, parents] = await Promise.all([
    selectSource().where(
      and(
        listed,
        isNull(teamEvent.recurrenceRule),
        gte(teamEvent.startTime, new Date(query.from)),
        lte(teamEvent.startTime, new Date(query.to))
      )
    ),
    selectSource().where(
      and(
        listed,
        isNotNull(teamEvent.recurrenceRule),
        lte(teamEvent.startTime, new Date(query.to))
      )
    ),
  ]);
  // Exception rows of listed series that either start in the window or
  // replace a date in it (cancelled ones included), so replaced and cancelled
  // occurrences are not re-expanded from the RRULE. Dates are the series' UTC
  // date keys, padded a day either side.
  const exceptions =
    parents.length === 0
      ? []
      : await selectSource().where(
          and(
            inArray(
              teamEvent.seriesId,
              parents.map((p) => p.id)
            ),
            or(
              and(
                gte(teamEvent.startTime, new Date(query.from)),
                lte(teamEvent.startTime, new Date(query.to))
              ),
              and(
                gte(teamEvent.originalDate, toDateKey(query.from - DAY_MS)),
                lte(teamEvent.originalDate, toDateKey(query.to + DAY_MS))
              )
            )
          )
        );
  return buildPublicEvents(
    [...standalone, ...parents, ...exceptions].map(toSourceRow),
    query,
    baseUrl
  );
}

/** Register-page context for a website sign-up link; null unless public. */
export async function getPublicSessionSummary(
  eventId: string,
  occDate: string | undefined,
  now: number
): Promise<PublicSessionSummary | null> {
  const [event] = await selectSource()
    .where(eq(teamEvent.id, eventId))
    .limit(1);
  const [exception] =
    event && occDate
      ? await selectSource()
          .where(
            and(
              eq(teamEvent.seriesId, eventId),
              eq(teamEvent.originalDate, occDate)
            )
          )
          .limit(1)
      : [];
  return summarizePublicSession(
    event ? toSourceRow(event) : null,
    exception ? toSourceRow(exception) : null,
    occDate,
    now
  );
}
