import { db } from "@pi-dash/db";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { env } from "@pi-dash/env/server";
import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import { getGroupJidByConfigKey } from "@pi-dash/whatsapp/groups";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { format } from "date-fns";
import { and, between, eq, isNotNull, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { SendWeeklyEventsDigestPayload } from "../enqueue";
import { computeWeekRange } from "../lib/weekly-digest-utils";

interface DigestEvent {
  endTime: number | null;
  location: string | null;
  name: string;
  startTime: number;
}

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

  return events.map((e) => ({
    name: e.name,
    startTime: e.startTime.getTime(),
    endTime: e.endTime?.getTime() ?? null,
    location: e.location,
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

  return events.map((e) => ({
    name: e.name,
    startTime: e.startTime.getTime(),
    endTime: e.endTime?.getTime() ?? null,
    location: e.location,
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

    // Query exception dates to exclude (materialized + cancelled instances)
    const exceptions = await db
      .select({ originalDate: teamEvent.originalDate })
      .from(teamEvent)
      .where(eq(teamEvent.seriesId, parent.id));
    const exceptionDates = new Set(
      exceptions
        .map((e) => e.originalDate)
        .filter((d): d is string => d != null)
    );

    const occurrences = expandSeries(
      rule,
      parent.startTime.getTime(),
      parent.endTime?.getTime() ?? null,
      weekStartMs,
      weekEndMs,
      exceptionDates
    );
    for (const occ of occurrences) {
      result.push({
        name: parent.name,
        startTime: occ.startTime,
        endTime: occ.endTime,
        location: parent.location,
      });
    }
  }
  return result;
}

function formatDigestMessage(events: DigestEvent[]): string {
  const lines = ["*Upcoming Events This Week*\n"];
  for (const [i, e] of events.entries()) {
    // date-fns format for consistent output regardless of server locale/ICU
    const when = format(new Date(e.startTime), "EEE, MMM d 'at' h:mm a");
    const locationStr = e.location ? ` | ${e.location}` : "";
    lines.push(`${i + 1}. *${e.name}*`);
    lines.push(`   ${when}${locationStr}\n`);
  }
  lines.push(
    `Interested? View events and register your interest:\n${env.APP_URL}/events`
  );
  return lines.join("\n");
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

  const message = formatDigestMessage(digestEvents);

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
