import type {
  OutcomeGroupRow,
  OutcomeSeriesParent,
} from "@pi-dash/shared/outcomes";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "..";
import { programme } from "../schema/finance-dimensions";
import { team } from "../schema/team";
import { teamEvent, teamEventMember } from "../schema/team-event";

export interface OutcomeFilters {
  costCentreId?: string | null;
  /** Events starting on or after this instant. */
  from?: Date | null;
  /** Events that have ended (or started, without an end time) by now count as held. */
  now: Date;
  programmeId?: string | null;
  teamId?: string | null;
  /** Events starting on or before this instant. */
  to?: Date | null;
}

const firstSession = alias(teamEvent, "first_session");

const count = (condition: ReturnType<typeof sql>) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

/**
 * Held events in the range, aggregated per programme and team. Held means a
 * saved row (a series parent is its own first session; later sessions count
 * once saved), not cancelled, not Kalakriti-managed, and over by `now`.
 * Attendance is counted per event before the join, so members never
 * multiply children and events never multiply volunteers.
 */
export async function loadOutcomeRows(
  filters: OutcomeFilters,
  reader: Pick<typeof db, "$with" | "select" | "with"> = db
): Promise<OutcomeGroupRow[]> {
  const held = reader.$with("held").as(
    reader
      .select({
        childrenAttended: teamEvent.childrenAttended,
        endTime: teamEvent.endTime,
        id: teamEvent.id,
        programmeId: teamEvent.programmeId,
        socialCompletedAt: teamEvent.socialCompletedAt,
        startTime: teamEvent.startTime,
        teamId: teamEvent.teamId,
      })
      .from(teamEvent)
      .where(
        and(
          isNull(teamEvent.cancelledAt),
          isNull(teamEvent.managementDomain),
          // Legacy data: an exception saved on its series' own start date
          // stands for the first session, so the parent doesn't count too
          // (and when that exception is cancelled, neither does).
          notExists(
            reader
              .select({ id: firstSession.id })
              .from(firstSession)
              .where(
                and(
                  eq(firstSession.seriesId, teamEvent.id),
                  eq(
                    firstSession.originalDate,
                    sql`to_char(${teamEvent.startTime}, 'YYYY-MM-DD')`
                  )
                )
              )
          ),
          lte(
            sql`coalesce(${teamEvent.endTime}, ${teamEvent.startTime})`,
            filters.now
          ),
          filters.from ? gte(teamEvent.startTime, filters.from) : undefined,
          filters.to ? lte(teamEvent.startTime, filters.to) : undefined,
          filters.programmeId
            ? eq(teamEvent.programmeId, filters.programmeId)
            : undefined,
          filters.teamId ? eq(teamEvent.teamId, filters.teamId) : undefined,
          filters.costCentreId
            ? eq(teamEvent.costCentreId, filters.costCentreId)
            : undefined
        )
      )
  );
  const attendance = reader.$with("attendance").as(
    reader
      .with(held)
      .select({
        eventId: teamEventMember.eventId,
        marked: sql<number>`count(${teamEventMember.attendance})`.as("marked"),
        present:
          sql<number>`count(*) filter (where ${teamEventMember.attendance} = 'present')`.as(
            "present"
          ),
      })
      .from(teamEventMember)
      .where(
        inArray(
          teamEventMember.eventId,
          reader.select({ id: held.id }).from(held)
        )
      )
      .groupBy(teamEventMember.eventId)
  );

  const rows = await reader
    .with(held, attendance)
    .select({
      // An undone recap keeps its number; only completed recaps count.
      children:
        sql<number>`coalesce(sum(${held.childrenAttended}) filter (where ${held.socialCompletedAt} is not null), 0)`.mapWith(
          Number
        ),
      events: sql<number>`count(*)`.mapWith(Number),
      programmeId: held.programmeId,
      programmeName: programme.name,
      teamId: held.teamId,
      teamName: team.name,
      volunteerSeconds:
        sql<number>`coalesce(sum(${attendance.present} * greatest(extract(epoch from (${held.endTime} - ${held.startTime})), 0)), 0)`.mapWith(
          Number
        ),
      withoutAttendance: count(sql`coalesce(${attendance.marked}, 0) = 0`),
      withoutEndTime: count(sql`${held.endTime} is null`),
      withoutRecap: count(sql`${held.socialCompletedAt} is null`),
    })
    .from(held)
    .innerJoin(programme, eq(programme.id, held.programmeId))
    .innerJoin(team, eq(team.id, held.teamId))
    .leftJoin(attendance, eq(attendance.eventId, held.id))
    .groupBy(held.programmeId, programme.name, held.teamId, team.name);
  return rows;
}

/**
 * Live, non-Kalakriti series parents in the filters that started by the end
 * of the range, with every saved date of each, for counting the sessions
 * nobody saved (`unsavedSessionRows`).
 */
export async function loadOutcomeSeriesParents(
  filters: OutcomeFilters,
  reader: Pick<typeof db, "select"> = db
): Promise<OutcomeSeriesParent[]> {
  const until =
    filters.to && filters.to < filters.now ? filters.to : filters.now;
  const rows = await reader
    .select({
      endTime: teamEvent.endTime,
      programmeId: teamEvent.programmeId,
      programmeName: programme.name,
      recurrenceRule: teamEvent.recurrenceRule,
      savedDates: sql<
        string[]
      >`coalesce((select array_agg(saved.original_date) from team_event saved where saved.series_id = ${teamEvent.id} and saved.original_date is not null), '{}')`,
      startTime: teamEvent.startTime,
      teamId: teamEvent.teamId,
      teamName: team.name,
    })
    .from(teamEvent)
    .innerJoin(programme, eq(programme.id, teamEvent.programmeId))
    .innerJoin(team, eq(team.id, teamEvent.teamId))
    .where(
      and(
        isNotNull(teamEvent.recurrenceRule),
        isNull(teamEvent.seriesId),
        isNull(teamEvent.cancelledAt),
        isNull(teamEvent.managementDomain),
        lte(teamEvent.startTime, until),
        filters.programmeId
          ? eq(teamEvent.programmeId, filters.programmeId)
          : undefined,
        filters.teamId ? eq(teamEvent.teamId, filters.teamId) : undefined,
        filters.costCentreId
          ? eq(teamEvent.costCentreId, filters.costCentreId)
          : undefined
      )
    );
  return rows.map((row) => ({
    ...row,
    endTime: row.endTime?.getTime() ?? null,
    startTime: row.startTime.getTime(),
  }));
}
