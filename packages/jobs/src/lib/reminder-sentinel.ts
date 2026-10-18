import { db } from "@pi-dash/db";
import { eventReminderSent } from "@pi-dash/db/schema/event-reminder";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Claim an event reminder by inserting its idempotency row.
 * Returns the inserted row ID, or `null` when the reminder is already claimed.
 * Throws on unexpected errors.
 */
export async function claimReminderSent(
  eventId: string,
  instanceDate: string | null,
  intervalMinutes: number
): Promise<string | null> {
  const id = uuidv7();
  try {
    await db.insert(eventReminderSent).values({
      eventId,
      id,
      instanceDate,
      intervalMinutes,
      sentAt: new Date(),
    });
    return id;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("event_reminder_sent_uidx")
    ) {
      return null;
    }
    throw error;
  }
}

/** Release only the claim created by the failed delivery attempt. */
export async function releaseReminderSent(claimId: string): Promise<void> {
  await db.delete(eventReminderSent).where(eq(eventReminderSent.id, claimId));
}

/** Keep a successful claim, but release it when any claimed work throws. */
export async function withReminderClaim(
  eventId: string,
  instanceDate: string | null,
  intervalMinutes: number,
  operation: () => Promise<void>
): Promise<boolean> {
  const claimId = await claimReminderSent(
    eventId,
    instanceDate,
    intervalMinutes
  );
  if (!claimId) {
    return false;
  }

  try {
    await operation();
    return true;
  } catch (error) {
    await releaseReminderSent(claimId);
    throw error;
  }
}
