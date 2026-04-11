import { db } from "@pi-dash/db";
import { eventRsvpPoll } from "@pi-dash/db/schema/event-rsvp";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { CloseExpiredRsvpPollsPayload } from "../enqueue";

export async function handleCloseExpiredRsvpPolls(
  _jobs: Job<CloseExpiredRsvpPollsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "close-expired-rsvp-polls",
  });

  const now = new Date();

  const expiredPolls = await db
    .select({ id: eventRsvpPoll.id })
    .from(eventRsvpPoll)
    .innerJoin(teamEvent, eq(teamEvent.id, eventRsvpPoll.eventId))
    .where(and(isNull(eventRsvpPoll.closedAt), lte(teamEvent.startTime, now)));

  if (expiredPolls.length === 0) {
    log.set({ event: "no_expired_polls" });
    log.emit();
    return;
  }

  const pollIds = expiredPolls.map((p) => p.id);

  await db
    .update(eventRsvpPoll)
    .set({ closedAt: now })
    .where(inArray(eventRsvpPoll.id, pollIds));

  log.set({ event: "polls_closed", closedCount: pollIds.length });
  log.emit();
}
