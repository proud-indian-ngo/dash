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

async function enqueueAttachmentCleanupForMessage(
  messageId: string,
  log: { set: (fields: { event: string; r2Key: string }) => void }
): Promise<void> {
  const siblings = await db
    .select({
      retryCount: scheduledMessageRecipient.retryCount,
      status: scheduledMessageRecipient.status,
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
    return;
  }

  const [parent] = await db
    .select({ attachments: scheduledMessage.attachments })
    .from(scheduledMessage)
    .where(eq(scheduledMessage.id, messageId))
    .limit(1);

  if (!parent?.attachments?.length) {
    return;
  }

  await Promise.all(
    parent.attachments.map(async (att) => {
      try {
        await enqueue("delete-r2-object", { r2Key: att.r2Key });
      } catch {
        log.set({ event: "r2_cleanup_enqueue_failed", r2Key: att.r2Key });
      }
    })
  );
}

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

  // Check each affected message for R2 cleanup
  const affectedMessageIds = [
    ...new Set(staleRecipients.map((r) => r.scheduledMessageId)),
  ];

  await Promise.all(
    affectedMessageIds.map((messageId) =>
      enqueueAttachmentCleanupForMessage(messageId, log)
    )
  );

  log.set({
    cleanedUp: staleRecipients.length,
    event: "job_complete",
    messagesAffected: affectedMessageIds.length,
  });
  log.emit();
}
