import { db } from "@pi-dash/db";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { MAX_RECIPIENT_RETRIES } from "@pi-dash/shared/scheduled-message";
import { and, eq, lt } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import {
  type CleanupStaleScheduledRecipientsPayload,
  enqueue,
} from "../enqueue";

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
  for (const recipient of staleRecipients) {
    await db
      .update(scheduledMessageRecipient)
      .set({
        status: "failed",
        error: "Stale: never delivered",
        updatedAt: new Date(),
      })
      .where(eq(scheduledMessageRecipient.id, recipient.id));
  }

  // Check each affected message for R2 cleanup
  const affectedMessageIds = [
    ...new Set(staleRecipients.map((r) => r.scheduledMessageId)),
  ];

  for (const messageId of affectedMessageIds) {
    const siblings = await db
      .select({
        status: scheduledMessageRecipient.status,
        retryCount: scheduledMessageRecipient.retryCount,
      })
      .from(scheduledMessageRecipient)
      .where(eq(scheduledMessageRecipient.scheduledMessageId, messageId));

    const allDone = siblings.every((s) => {
      if (s.status === "sent" || s.status === "cancelled") {
        return true;
      }
      if (s.status === "failed" && s.retryCount >= MAX_RECIPIENT_RETRIES) {
        return true;
      }
      return false;
    });

    if (!allDone) {
      continue;
    }

    const [parent] = await db
      .select({ attachments: scheduledMessage.attachments })
      .from(scheduledMessage)
      .where(eq(scheduledMessage.id, messageId))
      .limit(1);

    if (!parent?.attachments?.length) {
      continue;
    }

    for (const att of parent.attachments) {
      try {
        await enqueue("delete-r2-object", { r2Key: att.r2Key });
      } catch {
        log.set({ event: "r2_cleanup_enqueue_failed", r2Key: att.r2Key });
      }
    }
  }

  log.set({
    event: "job_complete",
    cleanedUp: staleRecipients.length,
    messagesAffected: affectedMessageIds.length,
  });
  log.emit();
}
