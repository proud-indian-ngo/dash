import { db } from "@pi-dash/db";
import { eventRsvpPoll } from "@pi-dash/db/schema/event-rsvp";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { and, between, eq, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { SendEventRsvpPollsPayload } from "../enqueue";
import { enqueue } from "../enqueue";

const WINDOW_MS = 16 * 60 * 1000;
const RSVP_POLL_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

export async function handleSendEventRsvpPolls(
  _jobs: Job<SendEventRsvpPollsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-event-rsvp-polls",
  });

  const now = Date.now();
  // Look for events starting within [now + 3 days - 16 min, now + 3 days + 16 min]
  const windowStart = new Date(now + RSVP_POLL_LEAD_MS - WINDOW_MS);
  const windowEnd = new Date(now + RSVP_POLL_LEAD_MS + WINDOW_MS);

  const events = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
    })
    .from(teamEvent)
    .innerJoin(team, eq(team.id, teamEvent.teamId))
    .where(
      and(
        eq(teamEvent.postRsvpPoll, true),
        isNull(teamEvent.cancelledAt),
        between(teamEvent.startTime, windowStart, windowEnd)
      )
    );

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

  let enqueuedCount = 0;
  let skippedCount = 0;

  for (const event of events) {
    const existingPoll = await db
      .select({ id: eventRsvpPoll.id })
      .from(eventRsvpPoll)
      .where(eq(eventRsvpPoll.eventId, event.id))
      .limit(1);

    if (existingPoll.length > 0) {
      skippedCount += 1;
      continue;
    }

    await enqueue("send-single-rsvp-poll", { eventId: event.id });
    enqueuedCount += 1;
  }

  log.set({ event: "job_complete", enqueuedCount, skippedCount });
  log.emit();
}
