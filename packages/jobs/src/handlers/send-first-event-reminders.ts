import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { notifyFirstEventReminder } from "@pi-dash/notifications/send/reminders";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

const LEAD_MS = 24 * 60 * 60 * 1000;
// 1-min buffer over the 15-min cron interval to prevent gaps from scheduling
// jitter. The message's idempotency key stops the overlap sending twice.
const WINDOW_MS = 16 * 60 * 1000;

/**
 * The day-before reminder for volunteers still unoriented whose interest in
 * an event was approved and who are still on it. Interest always sits on a
 * saved row, so series sessions need no expansion; a session without its
 * own instructions takes its series'. The team's leads are the contact.
 */
export async function handleSendFirstEventReminders(
  _jobs: Job[],
  now: Date = new Date()
): Promise<{ sentCount: number }> {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-first-event-reminders",
  });
  const series = alias(teamEvent, "series");

  const due = await db
    .select({
      eventId: teamEvent.id,
      eventName: teamEvent.name,
      instructions: sql<
        string | null
      >`coalesce(${teamEvent.newVolunteerInstructions}, ${series.newVolunteerInstructions})`,
      // Every active lead of the event's team, as "Name (phone)".
      leadContact: sql<string | null>`(
        select string_agg(
          lead.name || coalesce(' (' || lead.phone || ')', ''),
          ', ' order by lead.name
        )
        from team_member tm
        join "user" lead on lead.id = tm.user_id
        where tm.team_id = ${teamEvent.teamId}
          and tm.role = 'lead'
          and lead.is_active
      )`,
      location: teamEvent.location,
      startTime: teamEvent.startTime,
      userId: user.id,
      userName: user.name,
    })
    .from(eventInterest)
    .innerJoin(teamEvent, eq(teamEvent.id, eventInterest.eventId))
    .innerJoin(user, eq(user.id, eventInterest.userId))
    .innerJoin(
      teamEventMember,
      and(
        eq(teamEventMember.eventId, eventInterest.eventId),
        eq(teamEventMember.userId, eventInterest.userId)
      )
    )
    .leftJoin(series, eq(series.id, teamEvent.seriesId))
    .where(
      and(
        eq(eventInterest.status, "approved"),
        eq(user.role, "unoriented_volunteer"),
        eq(user.isActive, true),
        isNull(teamEvent.cancelledAt),
        gt(teamEvent.startTime, new Date(now.getTime() + LEAD_MS - WINDOW_MS)),
        lte(teamEvent.startTime, new Date(now.getTime() + LEAD_MS))
      )
    );

  const results = await Promise.allSettled(
    due.map((row) =>
      notifyFirstEventReminder({
        eventId: row.eventId,
        eventName: row.eventName,
        instructions: row.instructions,
        leadContact: row.leadContact,
        location: row.location,
        startTime: row.startTime.getTime(),
        userId: row.userId,
        userName: row.userName,
      })
    )
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : []
  );
  const sentCount = due.length - failures.length;
  log.set({ dueCount: due.length, sentCount });
  if (failures.length > 0) {
    const error = new AggregateError(
      failures,
      `${failures.length} of ${due.length} first event reminders failed`
    );
    log.error(error);
    log.emit();
    // pg-boss retries; the idempotency key skips those already sent.
    throw error;
  }
  log.emit();
  return { sentCount };
}
