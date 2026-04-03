import { db } from "@pi-dash/db";
import { scheduledMessage } from "@pi-dash/db/schema/scheduled-message";
import { env } from "@pi-dash/env/server";
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

async function processJob(job: Job<SendScheduledWhatsAppPayload>) {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-scheduled-whatsapp",
  });
  const {
    attachments,
    enqueuedAt,
    message,
    recipientType,
    scheduledMessageId,
    targetAddress,
  } = job.data;

  log.set({
    jobId: job.id,
    recipientType,
    scheduledMessageId,
    targetAddress,
  });

  const [parent] = await db
    .select({
      status: scheduledMessage.status,
      updatedAt: scheduledMessage.updatedAt,
    })
    .from(scheduledMessage)
    .where(eq(scheduledMessage.id, scheduledMessageId))
    .limit(1);

  if (!parent) {
    log.set({ event: "job_skip", reason: "parent_not_found" });
    log.emit();
    return;
  }

  if (parent.status === "cancelled") {
    log.set({ event: "job_skip", reason: "cancelled" });
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
    .update(scheduledMessage)
    .set({ status: "sent", updatedAt: new Date() })
    .where(eq(scheduledMessage.id, scheduledMessageId));

  log.set({ event: "job_complete" });
  log.emit();
}

/** Dead letter handler — updates scheduled_message.status when all retries exhaust. */
export async function handleDeadLetterScheduledWhatsApp(
  jobs: Job<{ scheduledMessageId?: string }>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "dead-letter/scheduled-whatsapp",
    });
    const { scheduledMessageId } = job.data;
    log.set({ jobId: job.id, scheduledMessageId });

    if (!scheduledMessageId) {
      log.set({ event: "job_skip", reason: "no_scheduled_message_id" });
      log.emit();
      continue;
    }

    await db
      .update(scheduledMessage)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(scheduledMessage.id, scheduledMessageId));

    log.set({ event: "status_set_failed" });
    log.emit();
  }
}

export async function handleSendScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  const job = jobs[0];
  if (!job) {
    return;
  }
  // No try/catch wrapping processJob — Bun/pg-boss compat requires
  // errors to propagate directly for pg-boss retry/fail detection.
  // Logging is handled inside processJob (success/skip paths) and
  // by the individual WAPI send functions (error paths with log.error + log.emit).
  await processJob(job);
}
