import { expireStartedEventInterests } from "@pi-dash/db/event-interest-expiry";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

/**
 * Closes interest requests still pending when their event has started, as
 * `expired`. Notifies no one: the volunteer sees "Not reviewed" on the event.
 */
export async function handleExpireEventInterests(
  _jobs: Job[],
  now: Date = new Date()
): Promise<{ expiredCount: number }> {
  const log = createRequestLogger({
    method: "JOB",
    path: "expire-event-interests",
  });

  const expiredCount = await expireStartedEventInterests(now);

  log.set(
    expiredCount === 0
      ? { event: "no_pending_interests" }
      : { event: "interests_expired", expiredCount }
  );
  log.emit();
  return { expiredCount };
}
