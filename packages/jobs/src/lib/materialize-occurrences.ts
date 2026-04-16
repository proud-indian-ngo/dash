import { db } from "@pi-dash/db";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

export type SeriesParent = Awaited<
  ReturnType<typeof querySeriesParents>
>[number];

function querySeriesParents() {
  return db
    .select({
      id: teamEvent.id,
      teamId: teamEvent.teamId,
      name: teamEvent.name,
      description: teamEvent.description,
      location: teamEvent.location,
      startTime: teamEvent.startTime,
      endTime: teamEvent.endTime,
      isPublic: teamEvent.isPublic,
      recurrenceRule: teamEvent.recurrenceRule,
      feedbackEnabled: teamEvent.feedbackEnabled,
      feedbackDeadline: teamEvent.feedbackDeadline,
      reminderIntervals: teamEvent.reminderIntervals,
      whatsappGroupId: teamEvent.whatsappGroupId,
      createdBy: teamEvent.createdBy,
    })
    .from(teamEvent)
    .where(
      and(
        isNotNull(teamEvent.recurrenceRule),
        isNull(teamEvent.seriesId),
        isNull(teamEvent.cancelledAt)
      )
    );
}

async function hasMembers(eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: teamEventMember.id })
    .from(teamEventMember)
    .where(eq(teamEventMember.eventId, eventId))
    .limit(1);
  return rows.length > 0;
}

export async function getExceptionDates(
  parentId: string
): Promise<Set<string>> {
  const exceptions = await db
    .select({ originalDate: teamEvent.originalDate })
    .from(teamEvent)
    .where(eq(teamEvent.seriesId, parentId));
  return new Set(
    exceptions.map((e) => e.originalDate).filter((d): d is string => d != null)
  );
}

async function materializeOccurrence(
  parent: SeriesParent,
  occurrence: { date: string; startTime: number; endTime: number | null },
  now: number
): Promise<string | null> {
  const inserted = await db
    .insert(teamEvent)
    .values({
      id: uuidv7(),
      teamId: parent.teamId,
      name: parent.name,
      description: parent.description,
      location: parent.location,
      startTime: new Date(occurrence.startTime),
      endTime: occurrence.endTime ? new Date(occurrence.endTime) : null,
      isPublic: parent.isPublic,
      recurrenceRule: null,
      seriesId: parent.id,
      originalDate: occurrence.date,
      cancelledAt: null,
      feedbackEnabled: parent.feedbackEnabled,
      feedbackDeadline: parent.feedbackDeadline,
      reminderIntervals: parent.reminderIntervals,
      whatsappGroupId: parent.whatsappGroupId,
      createdBy: parent.createdBy,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing()
    .returning({ id: teamEvent.id });

  if (inserted.length === 0) {
    return null;
  }

  const newEventId = (inserted[0] as { id: string }).id;

  // Copy members from the series parent
  const members = await db
    .select({
      userId: teamEventMember.userId,
      addedAt: teamEventMember.addedAt,
    })
    .from(teamEventMember)
    .where(eq(teamEventMember.eventId, parent.id));

  for (const member of members) {
    await db
      .insert(teamEventMember)
      .values({
        id: uuidv7(),
        eventId: newEventId,
        userId: member.userId,
        addedAt: member.addedAt,
      })
      .onConflictDoNothing();
  }

  return newEventId;
}

/**
 * Materialize a virtual occurrence and return its id. If the exception row
 * already exists (unique index on seriesId+originalDate), look it up and
 * return the existing id instead.
 */
export async function getOrMaterializeOccurrenceId(
  parent: SeriesParent,
  occurrence: { date: string; startTime: number; endTime: number | null },
  now: number
): Promise<string> {
  const newId = await materializeOccurrence(parent, occurrence, now);
  if (newId) {
    return newId;
  }
  const existing = await db
    .select({ id: teamEvent.id })
    .from(teamEvent)
    .where(
      and(
        eq(teamEvent.seriesId, parent.id),
        eq(teamEvent.originalDate, occurrence.date)
      )
    )
    .limit(1);
  const row = existing[0];
  if (!row) {
    throw new Error(
      `Exception row missing after onConflictDoNothing: series=${parent.id} date=${occurrence.date}`
    );
  }
  return row.id;
}

/**
 * Materialize virtual recurring event occurrences that have already started
 * and whose series parent has at least 1 member.
 *
 * This ensures post-event handlers (feedback nudge, attendance reminder,
 * photo nudge) can find these occurrences via normal DB queries.
 */
export async function materializePastOccurrences(now: number): Promise<number> {
  const log = createRequestLogger({
    method: "JOB",
    path: "materialize-past-occurrences",
  });

  const seriesParents = await querySeriesParents();
  log.set({ seriesParentCount: seriesParents.length });

  let materialized = 0;

  for (const parent of seriesParents) {
    if (!(await hasMembers(parent.id))) {
      continue;
    }

    const rule = parseRecurrenceRule(parent.recurrenceRule);
    if (!rule) {
      continue;
    }

    const exceptionDates = await getExceptionDates(parent.id);

    // Look back 25h + event duration to cover the post-event nudge window
    const duration =
      parent.endTime && parent.startTime
        ? parent.endTime.getTime() - parent.startTime.getTime()
        : 0;
    const rangeStart = now - 25 * 60 * 60 * 1000 - duration;

    const occurrences = expandSeries(
      rule,
      parent.startTime.getTime(),
      parent.endTime?.getTime() ?? null,
      rangeStart,
      now,
      exceptionDates
    );

    for (const occ of occurrences) {
      if (occ.startTime > now) {
        continue;
      }
      // Skip the first occurrence — the parent itself is the canonical event
      if (occ.startTime === parent.startTime.getTime()) {
        continue;
      }
      if (await materializeOccurrence(parent, occ, now)) {
        materialized++;
      }
    }
  }

  log.set({ event: "materialization_complete", materialized });
  log.emit();
  return materialized;
}
