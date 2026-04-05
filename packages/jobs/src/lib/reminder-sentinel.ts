import { db } from "@pi-dash/db";
import { eventReminderSent } from "@pi-dash/db/schema/event-reminder";
import { uuidv7 } from "uuidv7";

/**
 * Attempt to insert an idempotency row into `event_reminder_sent`.
 * Returns `true` if inserted (first time), `false` if already exists (duplicate).
 * Throws on unexpected errors.
 */
export async function tryInsertReminderSent(
  eventId: string,
  instanceDate: string | null,
  intervalMinutes: number
): Promise<boolean> {
  try {
    await db.insert(eventReminderSent).values({
      id: uuidv7(),
      eventId,
      instanceDate,
      intervalMinutes,
      sentAt: new Date(),
    });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("event_reminder_sent_uidx")
    ) {
      return false;
    }
    throw error;
  }
}
