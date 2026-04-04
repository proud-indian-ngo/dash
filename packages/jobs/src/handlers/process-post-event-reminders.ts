import { db } from "@pi-dash/db";
import { eventFeedbackSubmission } from "@pi-dash/db/schema/event-feedback";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
  notifyAttendanceNotMarked,
  notifyFeedbackNudge,
  notifyPhotoUploadNudge,
} from "@pi-dash/notifications/send/reminders";
import { POST_EVENT_SENTINELS } from "@pi-dash/shared/event-reminders";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { ProcessPostEventRemindersPayload } from "../enqueue";
import { tryInsertReminderSent } from "../lib/reminder-sentinel";

export async function handleProcessPostEventReminders(
  _jobs: Job<ProcessPostEventRemindersPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "process-post-event-reminders",
  });

  const now = Date.now();
  let totalSent = 0;

  const feedbackSent = await processFeedbackNudges(now);
  totalSent += feedbackSent;

  const attendanceSent = await processAttendanceReminders(now);
  totalSent += attendanceSent;

  const photoSent = await processPhotoNudges(now);
  totalSent += photoSent;

  log.set({
    event: "job_complete",
    feedbackSent,
    attendanceSent,
    photoSent,
    totalSent,
  });
  log.emit();
}

// ── Feedback Nudge (6-7h after endTime) ──────────────────────────────────────

async function processFeedbackNudges(now: number): Promise<number> {
  const log = createRequestLogger({
    method: "JOB",
    path: "process-post-event-reminders/feedback",
  });

  const windowStart = new Date(now - 7 * 60 * 60 * 1000);
  const windowEnd = new Date(now - 6 * 60 * 60 * 1000);

  const events = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
    })
    .from(teamEvent)
    .where(
      and(
        eq(teamEvent.feedbackEnabled, true),
        isNull(teamEvent.cancelledAt),
        sql`COALESCE(${teamEvent.endTime}, ${teamEvent.startTime}) BETWEEN ${windowStart} AND ${windowEnd}`
      )
    );

  log.set({ candidateEvents: events.length });

  let sent = 0;
  for (const event of events) {
    if (
      !(await tryInsertReminderSent(
        event.id,
        null,
        POST_EVENT_SENTINELS.feedbackNudge
      ))
    ) {
      continue;
    }

    const members = await db
      .select({ userId: teamEventMember.userId })
      .from(teamEventMember)
      .where(eq(teamEventMember.eventId, event.id));

    const submitted = await db
      .select({ userId: eventFeedbackSubmission.userId })
      .from(eventFeedbackSubmission)
      .where(eq(eventFeedbackSubmission.eventId, event.id));

    const submittedSet = new Set(submitted.map((r) => r.userId));
    const pending = members.filter((m) => !submittedSet.has(m.userId));

    if (pending.length === 0) {
      continue;
    }

    await Promise.allSettled(
      pending.map((m) =>
        notifyFeedbackNudge({
          userId: m.userId,
          eventName: event.name,
          eventId: event.id,
        })
      )
    );
    sent++;
  }

  log.set({ event: "feedback_nudges_complete", sent });
  log.emit();
  return sent;
}

// ── Attendance Not Marked (24-25h after endTime) ─────────────────────────────

async function processAttendanceReminders(now: number): Promise<number> {
  const log = createRequestLogger({
    method: "JOB",
    path: "process-post-event-reminders/attendance",
  });

  const windowStart = new Date(now - 25 * 60 * 60 * 1000);
  const windowEnd = new Date(now - 24 * 60 * 60 * 1000);

  const events = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
      teamId: teamEvent.teamId,
      createdBy: teamEvent.createdBy,
    })
    .from(teamEvent)
    .where(
      and(
        isNull(teamEvent.cancelledAt),
        sql`COALESCE(${teamEvent.endTime}, ${teamEvent.startTime}) BETWEEN ${windowStart} AND ${windowEnd}`
      )
    );

  log.set({ candidateEvents: events.length });

  let sent = 0;
  for (const event of events) {
    const markedMembers = await db
      .select({ id: teamEventMember.id })
      .from(teamEventMember)
      .where(
        and(
          eq(teamEventMember.eventId, event.id),
          isNotNull(teamEventMember.attendance)
        )
      )
      .limit(1);

    if (markedMembers.length > 0) {
      continue;
    }

    if (
      !(await tryInsertReminderSent(
        event.id,
        null,
        POST_EVENT_SENTINELS.attendanceReminder
      ))
    ) {
      continue;
    }

    const leads = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(
        and(eq(teamMember.teamId, event.teamId), eq(teamMember.role, "lead"))
      );

    const recipientIds = new Set([
      event.createdBy,
      ...leads.map((l) => l.userId),
    ]);

    await Promise.allSettled(
      Array.from(recipientIds).map((userId) =>
        notifyAttendanceNotMarked({
          userId,
          eventName: event.name,
          eventId: event.id,
        })
      )
    );
    sent++;
  }

  log.set({ event: "attendance_reminders_complete", sent });
  log.emit();
  return sent;
}

// ── Photo Upload Nudge (24-25h after endTime) ────────────────────────────────

async function processPhotoNudges(now: number): Promise<number> {
  const log = createRequestLogger({
    method: "JOB",
    path: "process-post-event-reminders/photos",
  });

  const windowStart = new Date(now - 25 * 60 * 60 * 1000);
  const windowEnd = new Date(now - 24 * 60 * 60 * 1000);

  const events = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
    })
    .from(teamEvent)
    .where(
      and(
        isNull(teamEvent.cancelledAt),
        sql`COALESCE(${teamEvent.endTime}, ${teamEvent.startTime}) BETWEEN ${windowStart} AND ${windowEnd}`
      )
    );

  log.set({ candidateEvents: events.length });

  let sent = 0;
  for (const event of events) {
    const photos = await db
      .select({ id: eventPhoto.id })
      .from(eventPhoto)
      .where(eq(eventPhoto.eventId, event.id))
      .limit(1);

    if (photos.length > 0) {
      continue;
    }

    if (
      !(await tryInsertReminderSent(
        event.id,
        null,
        POST_EVENT_SENTINELS.photoNudge
      ))
    ) {
      continue;
    }

    const members = await db
      .select({ userId: teamEventMember.userId })
      .from(teamEventMember)
      .where(eq(teamEventMember.eventId, event.id));

    if (members.length === 0) {
      continue;
    }

    await notifyPhotoUploadNudge({
      userIds: members.map((m) => m.userId),
      eventName: event.name,
      eventId: event.id,
    });
    sent++;
  }

  log.set({ event: "photo_nudges_complete", sent });
  log.emit();
  return sent;
}
