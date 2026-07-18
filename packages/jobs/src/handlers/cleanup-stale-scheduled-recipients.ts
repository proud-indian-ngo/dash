import { db } from "@pi-dash/db";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { and, eq, lt } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { CleanupStaleScheduledRecipientsPayload } from "../enqueue";

const STALE_THRESHOLD_DAYS = 7;

export async function handleCleanupStaleScheduledRecipients(
  _jobs: Job<CleanupStaleScheduledRecipientsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "cleanup-stale-scheduled-recipients",
  });

  const threshold = new Date(
    Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  );

  // Find all pending recipients whose parent scheduledAt is older than threshold
  const staleRecipients = await db
    .select({
      id: scheduledMessageRecipient.id,
      scheduledMessageId: scheduledMessageRecipient.scheduledMessageId,
    })
    .from(scheduledMessageRecipient)
    .innerJoin(
      scheduledMessage,
      eq(scheduledMessageRecipient.scheduledMessageId, scheduledMessage.id)
    )
    .where(
      and(
        eq(scheduledMessageRecipient.status, "pending"),
        lt(scheduledMessage.scheduledAt, threshold)
      )
    );

  log.set({ staleCount: staleRecipients.length });

  if (staleRecipients.length === 0) {
    log.set({ event: "no_stale_recipients" });
    log.emit();
    return;
  }

  // Mark all stale recipients as failed
  await Promise.all(
    staleRecipients.map(async (recipient) => {
      await db
        .update(scheduledMessageRecipient)
        .set({
          error: "Stale: never delivered",
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(scheduledMessageRecipient.id, recipient.id));
    })
  );

  const affectedMessageIds = [
    ...new Set(staleRecipients.map((r) => r.scheduledMessageId)),
  ];

  log.set({
    cleanedUp: staleRecipients.length,
    event: "job_complete",
    messagesAffected: affectedMessageIds.length,
  });
  log.emit();
}
