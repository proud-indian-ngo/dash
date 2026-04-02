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
  const {
    attachments,
    enqueuedAt,
    message,
    recipientType,
    scheduledMessageId,
    targetAddress,
  } = job.data;

  const [parent] = await db
    .select({
      status: scheduledMessage.status,
      updatedAt: scheduledMessage.updatedAt,
    })
    .from(scheduledMessage)
    .where(eq(scheduledMessage.id, scheduledMessageId))
    .limit(1);

  if (!parent) {
    return;
  }

  if (parent.status === "cancelled") {
    return;
  }

  if (parent.updatedAt && parent.updatedAt.getTime() > enqueuedAt) {
    return;
  }

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
}

/** Dead letter handler — updates scheduled_message.status when all retries exhaust. */
export async function handleDeadLetterScheduledWhatsApp(
  jobs: Job<{ scheduledMessageId?: string }>[]
): Promise<void> {
  for (const job of jobs) {
    const { scheduledMessageId } = job.data;
    if (!scheduledMessageId) {
      continue;
    }
    await db
      .update(scheduledMessage)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(scheduledMessage.id, scheduledMessageId));
  }
}

export async function handleSendScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  const job = jobs[0];
  if (!job) {
    return;
  }
  const log = createRequestLogger({
    method: "JOB",
    path: "send-scheduled-whatsapp",
  });
  log.set({
    event: "job_start",
    jobId: job.id,
    recipientType: job.data.recipientType,
    scheduledMessageId: job.data.scheduledMessageId,
    targetAddress: job.data.targetAddress,
  });
  let failed = false;
  try {
    await processJob(job);
  } catch (error) {
    failed = true;
    log.error(error instanceof Error ? error : String(error));
    throw error;
  } finally {
    if (!failed) {
      log.set({ event: "job_complete" });
    }
    log.emit();
  }
}
