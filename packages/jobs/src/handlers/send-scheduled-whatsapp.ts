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

export async function handleSendScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  for (const job of jobs) {
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
      event: "job_start",
      jobId: job.id,
      recipientType,
      scheduledMessageId,
      targetAddress,
    });

    // Load parent to check status and staleness
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

    // Stale check: if message was edited after this job was enqueued, skip
    if (parent.updatedAt && parent.updatedAt.getTime() > enqueuedAt) {
      log.set({ event: "job_skip", reason: "stale_after_edit" });
      log.emit();
      return;
    }

    try {
      const sendText =
        recipientType === "group"
          ? (msg: string) => sendWhatsAppGroupMessage(targetAddress, msg)
          : (msg: string) => sendWhatsAppMessage(targetAddress, msg);

      if (attachments && attachments.length > 0) {
        const cdnUrl = env.VITE_CDN_URL;
        const mediaAttachments: WhatsAppMediaAttachment[] = attachments.map(
          (a) => ({
            fileName: a.fileName,
            mimeType: a.mimeType,
            url: `${cdnUrl}/${a.r2Key}`,
          })
        );

        // Send all but last without caption
        for (const attachment of mediaAttachments.slice(0, -1)) {
          await sendWhatsAppMedia(targetAddress, attachment);
        }
        // Send last with message as caption
        const lastAttachment = mediaAttachments.at(
          -1
        ) as WhatsAppMediaAttachment;
        await sendWhatsAppMedia(targetAddress, lastAttachment, message);
      } else {
        await sendText(message);
      }

      // Update status to sent (only if still pending)
      await db
        .update(scheduledMessage)
        .set({ status: "sent", updatedAt: new Date() })
        .where(eq(scheduledMessage.id, scheduledMessageId));

      log.set({ event: "job_complete" });
      log.emit();
    } catch (error) {
      await db
        .update(scheduledMessage)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(scheduledMessage.id, scheduledMessageId));

      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error; // re-throw for pg-boss retry
    }
  }
}
