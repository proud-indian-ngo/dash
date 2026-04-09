import { db } from "@pi-dash/db";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { env } from "@pi-dash/env/server";
import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import { getGroupJidByConfigKey } from "@pi-dash/whatsapp/groups";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { and, between, eq, isNotNull, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { SendWeeklyEventsDigestPayload } from "../enqueue";
import { computeWeekRange } from "../lib/weekly-digest-utils";
import {
  type DigestEvent,
  formatDigestMessage,
} from "../lib/weekly-events-digest";

async function collectStandaloneEvents(
  weekStart: Date,
  weekEnd: Date
): Promise<DigestEvent[]> {
  const events = await db
    .select({
      name: teamEvent.name,
      startTime: teamEvent.startTime,
      endTime: teamEvent.endTime,
      location: teamEvent.location,
      description: teamEvent.description,
    })
    .from(teamEvent)
    .where(
      and(
        isNull(teamEvent.cancelledAt),
        isNull(teamEvent.seriesId),
        isNull(teamEvent.recurrenceRule),
        eq(teamEvent.isPublic, true),
        between(teamEvent.startTime, weekStart, weekEnd)
      )
    );

  return events.map((event) => ({
    name: event.name,
    startTime: event.startTime.getTime(),
    endTime: event.endTime?.getTime() ?? null,
    location: event.location,
    description: event.description ?? null,
  }));
}

async function collectMaterializedExceptions(
  weekStart: Date,
  weekEnd: Date
): Promise<DigestEvent[]> {
  const events = await db
    .select({
      name: teamEvent.name,
      startTime: teamEvent.startTime,
      endTime: teamEvent.endTime,
      location: teamEvent.location,
      description: teamEvent.description,
    })
    .from(teamEvent)
    .where(
      and(
        isNull(teamEvent.cancelledAt),
        isNotNull(teamEvent.seriesId),
        eq(teamEvent.isPublic, true),
        between(teamEvent.startTime, weekStart, weekEnd)
      )
    );

  return events.map((event) => ({
    name: event.name,
    startTime: event.startTime.getTime(),
    endTime: event.endTime?.getTime() ?? null,
    location: event.location,
    description: event.description ?? null,
  }));
}

async function collectRecurringEvents(
  weekStartMs: number,
  weekEndMs: number
): Promise<DigestEvent[]> {
  const seriesParents = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
      startTime: teamEvent.startTime,
      endTime: teamEvent.endTime,
      location: teamEvent.location,
      description: teamEvent.description,
      recurrenceRule: teamEvent.recurrenceRule,
    })
    .from(teamEvent)
    .where(
      and(
        isNull(teamEvent.cancelledAt),
        isNull(teamEvent.seriesId),
        isNotNull(teamEvent.recurrenceRule),
        eq(teamEvent.isPublic, true)
      )
    );

  const result: DigestEvent[] = [];
  for (const parent of seriesParents) {
    const rule = parseRecurrenceRule(parent.recurrenceRule);
    if (!rule) {
      continue;
    }

    const exceptions = await db
      .select({ originalDate: teamEvent.originalDate })
      .from(teamEvent)
      .where(eq(teamEvent.seriesId, parent.id));
    const exceptionDates = new Set(
      exceptions
        .map((exception) => exception.originalDate)
        .filter((date): date is string => date != null)
    );

    const occurrences = expandSeries(
      rule,
      parent.startTime.getTime(),
      parent.endTime?.getTime() ?? null,
      weekStartMs,
      weekEndMs,
      exceptionDates
    );

    for (const occurrence of occurrences) {
      result.push({
        name: parent.name,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        location: parent.location,
        description: parent.description ?? null,
      });
    }
  }

  return result;
}

export async function handleSendWeeklyEventsDigest(
  _jobs: Job<SendWeeklyEventsDigestPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-weekly-events-digest",
  });

  const { weekStart, weekEnd, weekStartMs, weekEndMs } = computeWeekRange();

  const standalone = await collectStandaloneEvents(weekStart, weekEnd);
  const materialized = await collectMaterializedExceptions(weekStart, weekEnd);
  const recurring = await collectRecurringEvents(weekStartMs, weekEndMs);

  const digestEvents = [...standalone, ...materialized, ...recurring].sort(
    (a, b) => a.startTime - b.startTime
  );

  log.set({ eventCount: digestEvents.length });

  if (digestEvents.length === 0) {
    log.set({ event: "no_events" });
    log.emit();
    return;
  }

  const message = formatDigestMessage(digestEvents, {
    ctaUrl: `${env.APP_URL}/events`,
  });

  const groupKeys = ["orientation_group_id", "all_volunteers_group_id"];
  let groupsSent = 0;
  for (const key of groupKeys) {
    const jid = await getGroupJidByConfigKey(key);
    if (jid) {
      await sendWhatsAppGroupMessage(jid, message);
      groupsSent++;
    }
  }

  log.set({
    event: "digest_sent",
    groupsSent,
    eventCount: digestEvents.length,
  });
  log.emit();
}
