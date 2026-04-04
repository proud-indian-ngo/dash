import { db } from "@pi-dash/db";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import {
  notifyEventReminder,
  notifyEventReminderGroup,
} from "@pi-dash/notifications/send/reminders";
import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import { and, between, eq, isNotNull, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { ProcessEventRemindersPayload } from "../enqueue";
import { materializePastOccurrences } from "../lib/materialize-occurrences";
import { tryInsertReminderSent } from "../lib/reminder-sentinel";

// 1-min buffer over the 15-min cron interval to prevent gaps from scheduling jitter.
// Idempotency table prevents double-sends, so overlap is safe.
const WINDOW_MS = 16 * 60 * 1000;
const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000 + WINDOW_MS;

export async function handleProcessEventReminders(
  _jobs: Job<ProcessEventRemindersPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "process-event-reminders",
  });

  const now = Date.now();

  // Materialize past virtual occurrences so post-event handlers can find them
  const materializedCount = await materializePastOccurrences(now);
  log.set({ materializedCount });

  const windowStart = new Date(now - WINDOW_MS);
  const lookaheadEnd = new Date(now + LOOKAHEAD_MS);

  const events = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
      startTime: teamEvent.startTime,
      endTime: teamEvent.endTime,
      location: teamEvent.location,
      whatsappGroupId: teamEvent.whatsappGroupId,
      reminderIntervals: teamEvent.reminderIntervals,
      recurrenceRule: teamEvent.recurrenceRule,
      seriesId: teamEvent.seriesId,
    })
    .from(teamEvent)
    .where(
      and(
        isNotNull(teamEvent.reminderIntervals),
        isNull(teamEvent.cancelledAt),
        between(
          teamEvent.startTime,
          new Date(now - 365 * 24 * 60 * 60 * 1000),
          lookaheadEnd
        )
      )
    );

  log.set({ candidateEvents: events.length });

  if (events.length === 0) {
    log.set({ event: "no_events" });
    log.emit();
    return;
  }

  let sentCount = 0;
  let skippedCount = 0;

  const onPartialFailure = (info: {
    eventId: string;
    failureCount: number;
    intervalMinutes: number;
    totalMembers: number;
  }) => {
    log.set({ event: "partial_failure", ...info });
  };

  for (const event of events) {
    const intervals = event.reminderIntervals as number[] | null;
    if (!intervals || intervals.length === 0) {
      continue;
    }

    const rule = parseRecurrenceRule(event.recurrenceRule);

    if (rule && !event.seriesId) {
      // Series parent — expand to instances
      const rangeStart = now - WINDOW_MS;
      const rangeEnd = now + LOOKAHEAD_MS;

      const exceptions = await db
        .select({ originalDate: teamEvent.originalDate })
        .from(teamEvent)
        .where(eq(teamEvent.seriesId, event.id));
      const exceptionDates = new Set(
        exceptions
          .map((e) => e.originalDate)
          .filter((d): d is string => d != null)
      );

      const occurrences = expandSeries(
        rule,
        event.startTime.getTime(),
        event.endTime?.getTime() ?? null,
        rangeStart,
        rangeEnd,
        exceptionDates
      );

      for (const occurrence of occurrences) {
        const result = await processRemindersForEvent({
          eventId: event.id,
          eventName: event.name,
          startTime: occurrence.startTime,
          location: event.location,
          whatsappGroupId: event.whatsappGroupId,
          intervals,
          instanceDate: occurrence.date,
          onPartialFailure,
          now,
          windowStart,
        });
        sentCount += result.sent;
        skippedCount += result.skipped;
      }
    } else {
      // Standalone event or materialized exception
      const result = await processRemindersForEvent({
        eventId: event.id,
        eventName: event.name,
        startTime: event.startTime.getTime(),
        location: event.location,
        whatsappGroupId: event.whatsappGroupId,
        intervals,
        instanceDate: null,
        onPartialFailure,
        now,
        windowStart,
      });
      sentCount += result.sent;
      skippedCount += result.skipped;
    }
  }

  log.set({ event: "job_complete", sentCount, skippedCount });
  log.emit();
}

interface ProcessParams {
  eventId: string;
  eventName: string;
  instanceDate: string | null;
  intervals: number[];
  location: string | null;
  now: number;
  onPartialFailure: (info: {
    eventId: string;
    failureCount: number;
    intervalMinutes: number;
    totalMembers: number;
  }) => void;
  startTime: number;
  whatsappGroupId: string | null;
  windowStart: Date;
}

async function processRemindersForEvent(
  params: ProcessParams
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  for (const intervalMinutes of params.intervals) {
    const reminderTime = params.startTime - intervalMinutes * 60 * 1000;

    if (
      reminderTime < params.windowStart.getTime() ||
      reminderTime > params.now
    ) {
      continue;
    }

    // Check idempotency first (read-only check via insert attempt)
    const isNew = await tryInsertReminderSent(
      params.eventId,
      params.instanceDate,
      intervalMinutes
    );
    if (!isNew) {
      skipped++;
      continue;
    }

    // Send the reminder
    if (params.whatsappGroupId) {
      const group = await db
        .select({ jid: whatsappGroup.jid })
        .from(whatsappGroup)
        .where(eq(whatsappGroup.id, params.whatsappGroupId))
        .limit(1);

      if (group[0]) {
        await notifyEventReminderGroup({
          eventId: params.eventId,
          eventName: params.eventName,
          groupJid: group[0].jid,
          intervalMinutes,
          location: params.location,
          startTime: params.startTime,
        });
      }
    } else {
      const members = await db
        .select({ userId: teamEventMember.userId })
        .from(teamEventMember)
        .where(eq(teamEventMember.eventId, params.eventId));

      const results = await Promise.allSettled(
        members.map((m) =>
          notifyEventReminder({
            userId: m.userId,
            eventId: params.eventId,
            eventName: params.eventName,
            intervalMinutes,
            location: params.location,
            startTime: params.startTime,
          })
        )
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        params.onPartialFailure({
          eventId: params.eventId,
          intervalMinutes,
          failureCount: failures.length,
          totalMembers: members.length,
        });
      }
    }
    sent++;
  }

  return { sent, skipped };
}
