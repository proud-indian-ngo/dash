import { db } from "@pi-dash/db";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { env } from "@pi-dash/env/server";
import { MAX_RECIPIENT_RETRIES } from "@pi-dash/shared/scheduled-message";
import {
  sendWhatsAppGroupMessage,
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  type WhatsAppMediaAttachment,
} from "@pi-dash/whatsapp/messaging";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import { enqueue, type SendScheduledWhatsAppPayload } from "../enqueue";

async function cleanupR2IfAllTerminal(scheduledMessageId: string) {
  const log = createRequestLogger({
    method: "JOB",
    path: "r2-cleanup/scheduled-whatsapp",
  });
  log.set({ scheduledMessageId });

  const siblings = await db
    .select({
      status: scheduledMessageRecipient.status,
      retryCount: scheduledMessageRecipient.retryCount,
    })
    .from(scheduledMessageRecipient)
    .where(
      eq(scheduledMessageRecipient.scheduledMessageId, scheduledMessageId)
    );

  // Only clean up when every recipient is in a final state with no retries left
  const allDone = siblings.every((s) => {
    if (s.status === "sent" || s.status === "cancelled") {
      return true;
    }
    if (s.status === "failed" && (s.retryCount ?? 0) >= MAX_RECIPIENT_RETRIES) {
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
    .where(eq(scheduledMessage.id, scheduledMessageId))
    .limit(1);

  if (!parent?.attachments?.length) {
    return;
  }

  log.set({ attachmentCount: parent.attachments.length });

  for (const att of parent.attachments) {
    try {
      await enqueue("delete-r2-object", { r2Key: att.r2Key });
    } catch {
      log.error(`Failed to enqueue R2 cleanup for ${att.r2Key}`);
    }
  }

  log.set({ event: "r2_cleanup_complete" });
  log.emit();
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

  log.set({ attachmentCount: attachments?.length ?? 0 });

  if (attachments && attachments.length > 0) {
    const cdnUrl = env.VITE_CDN_URL;
    const mediaAttachments: WhatsAppMediaAttachment[] = attachments.map(
      (a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        url: `${cdnUrl}/${a.r2Key}`,
      })
    );

    for (const attachment of mediaAttachments.slice(0, -1)) {
      await sendWhatsAppMedia(targetAddress, attachment);
    }
    const lastAttachment = mediaAttachments.at(-1) as WhatsAppMediaAttachment;
    await sendWhatsAppMedia(targetAddress, lastAttachment, message);
  } else {
    const sendText =
      recipientType === "group"
        ? sendWhatsAppGroupMessage
        : sendWhatsAppMessage;
    await sendText(targetAddress, message);
  }

  await db
    .update(scheduledMessageRecipient)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(scheduledMessageRecipient.id, recipientRowId));

  log.set({ event: "job_complete" });
  log.emit();

  await cleanupR2IfAllTerminal(scheduledMessageId);
}

/** Dead letter handler — updates recipient status when all retries exhaust. */
export async function handleDeadLetterScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "dead-letter/scheduled-whatsapp",
    });
    const { recipientRowId, scheduledMessageId } = job.data;
    log.set({ jobId: job.id, recipientRowId, scheduledMessageId });

    if (!recipientRowId) {
      log.set({ event: "job_skip", reason: "no_recipient_row_id" });
      log.emit();
      continue;
    }

    await db
      .update(scheduledMessageRecipient)
      .set({
        status: "failed",
        error: "All retries exhausted",
        updatedAt: new Date(),
      })
      .where(eq(scheduledMessageRecipient.id, recipientRowId));

    log.set({ event: "status_set_failed" });
    log.emit();

    if (scheduledMessageId) {
      await cleanupR2IfAllTerminal(scheduledMessageId);
    }
  }
}

export async function handleSendScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  const job = jobs[0];
  if (!job) {
    return;
  }
  await processJob(job);
}
