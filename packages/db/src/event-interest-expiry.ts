import { and, eq, inArray, lte, type SQL } from "drizzle-orm";

import { db } from ".";
import { eventInterest } from "./schema/event-interest";
import { teamEvent } from "./schema/team-event";

/**
 * Pending interest requests whose event has started (`start_time <= now`,
 * the rule that also stops new interest). Leads can no longer act on them:
 * the event page hides its request list once the event starts.
 */
export function pendingInterestOfStartedEvent(now: Date): SQL | undefined {
  return and(
    eq(eventInterest.status, "pending"),
    inArray(
      eventInterest.eventId,
      db
        .select({ id: teamEvent.id })
        .from(teamEvent)
        .where(lte(teamEvent.startTime, now))
    )
  );
}

/**
 * Marks every pending interest of a started event `expired`, in one
 * statement, and returns how many changed. `reviewedBy` stays null since no
 * one reviewed them; `reviewedAt` records when the request was closed, as it
 * does for an approval or rejection.
 */
export async function expireStartedEventInterests(now: Date): Promise<number> {
  const expired = await db
    .update(eventInterest)
    .set({ reviewedAt: now, status: "expired" })
    .where(pendingInterestOfStartedEvent(now))
    .returning({ id: eventInterest.id });
  return expired.length;
}
