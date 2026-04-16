import { db } from "@pi-dash/db";
import { eventRsvpPoll } from "@pi-dash/db/schema/event-rsvp";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import {
  expandSeries,
  parseRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import { and, eq, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { SendEventRsvpPollsPayload } from "../enqueue";
import { enqueue } from "../enqueue";
import {
  getExceptionDates,
  getOrMaterializeOccurrenceId,
  type SeriesParent,
} from "../lib/materialize-occurrences";

const WINDOW_MS = 16 * 60 * 1000;

interface PollCandidate {
  createdBy: string;
  description: string | null;
  endTime: Date | null;
  feedbackDeadline: Date | null;
  feedbackEnabled: boolean;
  id: string;
  isPublic: boolean;
  location: string | null;
  name: string;
  recurrenceRule: {
    rrule: string;
    exdates?: string[];
    excludeRules?: string[];
  } | null;
  reminderIntervals: number[] | null;
  rsvpPollLeadMinutes: number;
  seriesId: string | null;
  startTime: Date;
  teamId: string;
  whatsappGroupId: string | null;
}

interface DispatchTotals {
  enqueued: number;
  materialized: number;
  skipped: number;
}

function pollTriggerMs(startMs: number, leadMinutes: number): number {
  return startMs - leadMinutes * 60 * 1000;
}

function inWindow(pollMs: number, now: number): boolean {
  return pollMs >= now - WINDOW_MS && pollMs <= now + WINDOW_MS;
}

function toSeriesParent(event: PollCandidate): SeriesParent {
  return {
    id: event.id,
    teamId: event.teamId,
    name: event.name,
    description: event.description,
    location: event.location,
    startTime: event.startTime,
    endTime: event.endTime,
    isPublic: event.isPublic,
    recurrenceRule: event.recurrenceRule,
    feedbackEnabled: event.feedbackEnabled,
    feedbackDeadline: event.feedbackDeadline,
    reminderIntervals: event.reminderIntervals,
    whatsappGroupId: event.whatsappGroupId,
    createdBy: event.createdBy,
  };
}

async function hasPoll(eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: eventRsvpPoll.id })
    .from(eventRsvpPoll)
    .where(eq(eventRsvpPoll.eventId, eventId))
    .limit(1);
  return rows.length > 0;
}

async function tryEnqueuePoll(
  eventId: string,
  enqueued: Set<string>,
  totals: DispatchTotals
): Promise<void> {
  if (enqueued.has(eventId) || (await hasPoll(eventId))) {
    totals.skipped += 1;
    return;
  }
  await enqueue("send-single-rsvp-poll", { eventId });
  enqueued.add(eventId);
  totals.enqueued += 1;
}

async function dispatchSeriesParent(
  event: PollCandidate,
  rule: NonNullable<PollCandidate["recurrenceRule"]>,
  now: number,
  enqueued: Set<string>,
  totals: DispatchTotals
): Promise<void> {
  const leadMs = event.rsvpPollLeadMinutes * 60 * 1000;
  const rangeStart = now - WINDOW_MS + leadMs;
  const rangeEnd = now + WINDOW_MS + leadMs;

  const exceptionDates = await getExceptionDates(event.id);
  const occurrences = expandSeries(
    rule,
    event.startTime.getTime(),
    event.endTime?.getTime() ?? null,
    rangeStart,
    rangeEnd,
    exceptionDates
  );

  const parent = toSeriesParent(event);
  const parentStartMs = event.startTime.getTime();

  for (const occ of occurrences) {
    const pollMs = pollTriggerMs(occ.startTime, event.rsvpPollLeadMinutes);
    if (!inWindow(pollMs, now)) {
      continue;
    }
    // First occurrence IS the series parent row — attach poll directly,
    // don't materialize an exception (would orphan parent's poll/reminder fields).
    if (occ.startTime === parentStartMs) {
      await tryEnqueuePoll(event.id, enqueued, totals);
      continue;
    }
    const eventId = await getOrMaterializeOccurrenceId(parent, occ, now);
    totals.materialized += 1;
    await tryEnqueuePoll(eventId, enqueued, totals);
  }
}

async function dispatchStandalone(
  event: PollCandidate,
  now: number,
  enqueued: Set<string>,
  totals: DispatchTotals
): Promise<void> {
  const pollMs = pollTriggerMs(
    event.startTime.getTime(),
    event.rsvpPollLeadMinutes
  );
  if (!inWindow(pollMs, now)) {
    return;
  }
  await tryEnqueuePoll(event.id, enqueued, totals);
}

async function loadCandidates(): Promise<PollCandidate[]> {
  return await db
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
      seriesId: teamEvent.seriesId,
      feedbackEnabled: teamEvent.feedbackEnabled,
      feedbackDeadline: teamEvent.feedbackDeadline,
      reminderIntervals: teamEvent.reminderIntervals,
      whatsappGroupId: teamEvent.whatsappGroupId,
      createdBy: teamEvent.createdBy,
      rsvpPollLeadMinutes: teamEvent.rsvpPollLeadMinutes,
    })
    .from(teamEvent)
    .where(
      and(eq(teamEvent.postRsvpPoll, true), isNull(teamEvent.cancelledAt))
    );
}

export async function handleSendEventRsvpPolls(
  _jobs: Job<SendEventRsvpPollsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-event-rsvp-polls",
  });

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MS);
  const windowEnd = new Date(now + WINDOW_MS);

  const events = await loadCandidates();

  log.set({
    candidateEvents: events.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  if (events.length === 0) {
    log.set({ event: "no_events" });
    log.emit();
    return;
  }

  const enqueued = new Set<string>();
  const totals: DispatchTotals = { enqueued: 0, skipped: 0, materialized: 0 };

  for (const event of events) {
    const rule = parseRecurrenceRule(event.recurrenceRule);
    if (rule != null && event.seriesId == null) {
      await dispatchSeriesParent(event, rule, now, enqueued, totals);
    } else {
      await dispatchStandalone(event, now, enqueued, totals);
    }
  }

  log.set({
    event: "job_complete",
    enqueuedCount: totals.enqueued,
    skippedCount: totals.skipped,
    materializedCount: totals.materialized,
  });
  log.emit();
}
