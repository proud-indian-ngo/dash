import { db } from "@pi-dash/db";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { logGowaSend } from "@pi-dash/whatsapp/gowa-log";
import {
  sendWhatsAppGroupMessage,
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  type WhatsAppMediaAttachment,
} from "@pi-dash/whatsapp/messaging";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { SendScheduledWhatsAppPayload } from "../enqueue";
import { getR2Client } from "./r2";
import { buildScheduledWhatsAppMedia } from "./scheduled-whatsapp-media";

/** A scheduled send as the GoWA log keeps it; a DM keeps the user, not the phone. */
function scheduledLogEntry(
  data: SendScheduledWhatsAppPayload,
  recipientId: string
) {
  const group = data.recipientType === "group";
  return {
    attachmentCount: data.attachments?.length ?? 0,
    chatJid: group ? data.targetAddress : null,
    kind: group ? ("group_post" as const) : ("direct" as const),
    scheduledMessageId: data.scheduledMessageId,
    source: "scheduled" as const,
    text: data.message,
    userId: group ? null : recipientId,
  };
}

async function processJob(job: Job<SendScheduledWhatsAppPayload>) {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-scheduled-whatsapp",
  });
  const {
    attachments,
    enqueuedAt,
    message,
    recipientRowId,
    recipientType,
    scheduledMessageId,
    targetAddress,
  } = job.data;

  log.set({
    jobId: job.id,
    recipientRowId,
    recipientType,
    scheduledMessageId,
    targetAddress,
  });

  // Guard: stale in-flight job from before the schema change
  if (!recipientRowId) {
    log.set({ event: "job_skip", reason: "no_recipient_row_id" });
    log.emit();
    return;
  }

  // Fetch recipient row
  const [recipient] = await db
    .select({
      recipientId: scheduledMessageRecipient.recipientId,
      status: scheduledMessageRecipient.status,
    })
    .from(scheduledMessageRecipient)
    .where(eq(scheduledMessageRecipient.id, recipientRowId))
    .limit(1);

  if (!recipient) {
    log.set({ event: "job_skip", reason: "recipient_not_found" });
    log.emit();
    return;
  }

  if (recipient.status === "cancelled") {
    log.set({ event: "job_skip", reason: "recipient_cancelled" });
    log.emit();
    return;
  }

  // Staleness check against parent
  const [parent] = await db
    .select({ updatedAt: scheduledMessage.updatedAt })
    .from(scheduledMessage)
    .where(eq(scheduledMessage.id, scheduledMessageId))
    .limit(1);

  if (!parent) {
    log.set({ event: "job_skip", reason: "parent_not_found" });
    log.emit();
    return;
  }

  if (parent.updatedAt && parent.updatedAt.getTime() > enqueuedAt) {
    log.set({ event: "job_skip", reason: "stale_after_edit" });
    log.emit();
    return;
  }

  log.set({ attachmentCount: attachments?.length });

  const messageIds: (string | undefined)[] = [];
  if (attachments && attachments.length > 0) {
    const mediaAttachments: WhatsAppMediaAttachment[] =
      buildScheduledWhatsAppMedia(attachments, getR2Client());

    // NOTE: On retry, previously sent attachments may be re-delivered (duplicated).
    // This is an accepted trade-off — tracking per-attachment send progress would add
    // significant complexity for a rare edge case.
    for (const [index, attachment] of mediaAttachments.entries()) {
      const isLast = index === mediaAttachments.length - 1;
      messageIds.push(
        await sendWhatsAppMedia(
          targetAddress,
          attachment,
          isLast ? message : undefined
        )
      );
    }
  } else {
    const sendText =
      recipientType === "group"
        ? sendWhatsAppGroupMessage
        : sendWhatsAppMessage;
    messageIds.push(await sendText(targetAddress, message));
  }
  await logGowaSend(
    scheduledLogEntry(job.data, recipient.recipientId),
    messageIds
  );

  await db
    .update(scheduledMessageRecipient)
    .set({ sentAt: new Date(), status: "sent", updatedAt: new Date() })
    .where(eq(scheduledMessageRecipient.id, recipientRowId));

  log.set({ event: "job_complete" });
  log.emit();
}

/** Dead letter handler — updates recipient status when all retries exhaust. */
export async function handleDeadLetterScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "dead-letter/scheduled-whatsapp",
      });
      const { recipientRowId, scheduledMessageId } = job.data;
      log.set({ jobId: job.id, recipientRowId, scheduledMessageId });

      if (!recipientRowId) {
        log.set({ event: "job_skip", reason: "no_recipient_row_id" });
        log.emit();
        return;
      }

      const error = "All retries exhausted";
      const [recipient] = await db
        .update(scheduledMessageRecipient)
        .set({ error, status: "failed", updatedAt: new Date() })
        .where(eq(scheduledMessageRecipient.id, recipientRowId))
        .returning({ recipientId: scheduledMessageRecipient.recipientId });
      if (recipient) {
        await logGowaSend(
          { ...scheduledLogEntry(job.data, recipient.recipientId), error },
          []
        );
      }

      log.set({ event: "status_set_failed" });
      log.emit();
    })
  );
}

export async function handleSendScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  const [job] = jobs;
  if (!job) {
    return;
  }
  await processJob(job);
}
