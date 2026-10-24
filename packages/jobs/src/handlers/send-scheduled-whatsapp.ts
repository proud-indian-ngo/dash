import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { logGowaSend } from "@pi-dash/whatsapp/gowa-log";
import {
  sendWhatsAppGroupMessage,
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  type WhatsAppMediaAttachment,
} from "@pi-dash/whatsapp/messaging";
import { and, eq, inArray } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { SendScheduledWhatsAppPayload } from "../enqueue";
import { getR2Client } from "./r2";
import { buildScheduledWhatsAppMedia } from "./scheduled-whatsapp-media";

/** Read both the delivery and its content from their owning records. */
async function loadScheduledDelivery(data: SendScheduledWhatsAppPayload) {
  if (
    !(data.recipientRowId && data.scheduledMessageId) ||
    !Number.isFinite(data.enqueuedAt)
  ) {
    return;
  }
  const [recipient] = await db
    .select({
      recipientId: scheduledMessageRecipient.recipientId,
      scheduledMessageId: scheduledMessageRecipient.scheduledMessageId,
      status: scheduledMessageRecipient.status,
      type: scheduledMessageRecipient.type,
    })
    .from(scheduledMessageRecipient)
    .where(eq(scheduledMessageRecipient.id, data.recipientRowId))
    .limit(1);
  if (
    !recipient ||
    recipient.scheduledMessageId !== data.scheduledMessageId ||
    (recipient.status !== "pending" && recipient.status !== "failed")
  ) {
    return;
  }
  const [parent] = await db
    .select({
      attachments: scheduledMessage.attachments,
      message: scheduledMessage.message,
      updatedAt: scheduledMessage.updatedAt,
    })
    .from(scheduledMessage)
    .where(eq(scheduledMessage.id, recipient.scheduledMessageId))
    .limit(1);
  if (!parent || parent.updatedAt.getTime() > data.enqueuedAt) {
    return;
  }

  let targetAddress: string | null | undefined;
  if (recipient.type === "group") {
    const [group] = await db
      .select({ jid: whatsappGroup.jid })
      .from(whatsappGroup)
      .where(eq(whatsappGroup.id, recipient.recipientId))
      .limit(1);
    targetAddress = group?.jid;
  } else {
    const [person] = await db
      .select({ phone: user.phone })
      .from(user)
      .where(eq(user.id, recipient.recipientId))
      .limit(1);
    targetAddress = person?.phone;
  }
  return { ...parent, ...recipient, targetAddress };
}

type ScheduledDelivery = NonNullable<
  Awaited<ReturnType<typeof loadScheduledDelivery>>
>;

/** A DM keeps the user ID in the delivery log, never the phone. */
function scheduledLogEntry(delivery: ScheduledDelivery) {
  const group = delivery.type === "group";
  return {
    attachmentCount: delivery.attachments?.length ?? 0,
    chatJid: group ? delivery.targetAddress : null,
    kind: group ? ("group_post" as const) : ("direct" as const),
    scheduledMessageId: delivery.scheduledMessageId,
    source: "scheduled" as const,
    text: delivery.message,
    userId: group ? null : delivery.recipientId,
  };
}

function actionableRecipient(data: SendScheduledWhatsAppPayload) {
  return and(
    eq(scheduledMessageRecipient.id, data.recipientRowId),
    eq(scheduledMessageRecipient.scheduledMessageId, data.scheduledMessageId),
    inArray(scheduledMessageRecipient.status, ["pending", "failed"])
  );
}

async function processJob(job: Job<SendScheduledWhatsAppPayload>) {
  const log = createRequestLogger({
    method: "JOB",
    path: "send-scheduled-whatsapp",
  });
  log.set({
    jobId: job.id,
    recipientRowId: job.data.recipientRowId,
    scheduledMessageId: job.data.scheduledMessageId,
  });
  const delivery = await loadScheduledDelivery(job.data);
  if (!delivery) {
    log.set({ event: "job_skip", reason: "recipient_not_actionable" });
    log.emit();
    return;
  }
  const { attachments, message, targetAddress } = delivery;
  if (!targetAddress) {
    throw new Error("Scheduled message recipient has no delivery address");
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
      delivery.type === "group"
        ? sendWhatsAppGroupMessage
        : sendWhatsAppMessage;
    messageIds.push(await sendText(targetAddress, message));
  }
  await logGowaSend(scheduledLogEntry(delivery), messageIds);

  await db
    .update(scheduledMessageRecipient)
    .set({ sentAt: new Date(), status: "sent", updatedAt: new Date() })
    .where(actionableRecipient(job.data));

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

      const delivery = await loadScheduledDelivery(job.data);
      if (!delivery) {
        log.set({ event: "job_skip", reason: "recipient_not_actionable" });
        log.emit();
        return;
      }

      const error = "All retries exhausted";
      const [recipient] = await db
        .update(scheduledMessageRecipient)
        .set({ error, status: "failed", updatedAt: new Date() })
        .where(actionableRecipient(job.data))
        .returning({ recipientId: scheduledMessageRecipient.recipientId });
      if (recipient) {
        await logGowaSend({ ...scheduledLogEntry(delivery), error }, []);
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
