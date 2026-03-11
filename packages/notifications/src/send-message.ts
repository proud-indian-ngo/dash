import { env } from "@pi-dash/env/server";
import {
  getUserPhone,
  getUserPhones,
  sendWhatsAppMessage,
} from "@pi-dash/whatsapp";
import { courier } from "./client";
import type { Topic } from "./topics";
import { TOPICS } from "./topics";

interface SendMessageOptions {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  title: string;
  to: string;
  topic?: Topic;
}

export async function sendMessage({
  to,
  title,
  body,
  emailBody,
  idempotencyKey,
  clickAction,
  topic = TOPICS.GENERAL,
}: SendMessageOptions): Promise<void> {
  const inboxPromise = courier.send.message(
    {
      message: {
        to: { user_id: to },
        content: { title, body },
        ...(clickAction && { data: { clickAction } }),
        routing: {
          method: "all",
          channels: ["inbox"],
        },
        preferences: {
          subscription_topic_id: topic,
        },
      },
    },
    { idempotencyKey: `${idempotencyKey}-inbox` }
  );

  const emailPromise = courier.send.message(
    {
      message: {
        to: { user_id: to },
        content: { title, body: emailBody ?? body },
        routing: {
          method: "all",
          channels: ["email"],
        },
        preferences: {
          subscription_topic_id: topic,
        },
      },
    },
    { idempotencyKey: `${idempotencyKey}-email` }
  );

  const whatsappPromise = (async () => {
    try {
      const phone = await getUserPhone(to);
      if (!phone) {
        return;
      }
      const appUrl = env.APP_URL;
      const whatsappBody =
        clickAction && appUrl
          ? `${body}\n\nView: ${appUrl}${clickAction}`
          : body;
      const footer = appUrl
        ? `\n\n_Sent by Proud Indian Dashboard_(${appUrl})`
        : "";
      await sendWhatsAppMessage(
        phone,
        `*${title}*\n\n${whatsappBody}${footer}`
      );
    } catch (error) {
      console.error("WhatsApp notification failed:", error);
    }
  })();

  await Promise.all([inboxPromise, emailPromise, whatsappPromise]);
}

interface SendBulkMessageOptions {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  title: string;
  topic?: Topic;
  userIds: string[];
}

export async function sendBulkMessage({
  userIds,
  title,
  body,
  emailBody,
  clickAction,
  idempotencyKey,
  topic = TOPICS.GENERAL,
}: SendBulkMessageOptions): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  const recipients = userIds.map((id) => ({ user_id: id }));

  const inboxPromise = courier.send.message(
    {
      message: {
        to: recipients,
        content: { title, body },
        ...(clickAction && { data: { clickAction } }),
        routing: {
          method: "all",
          channels: ["inbox"],
        },
        preferences: {
          subscription_topic_id: topic,
        },
      },
    },
    { idempotencyKey: `${idempotencyKey}-inbox` }
  );

  const emailPromise = courier.send.message(
    {
      message: {
        to: recipients,
        content: { title, body: emailBody ?? body },
        routing: {
          method: "all",
          channels: ["email"],
        },
        preferences: {
          subscription_topic_id: topic,
        },
      },
    },
    { idempotencyKey: `${idempotencyKey}-email` }
  );

  const whatsappPromise = (async () => {
    try {
      const phoneMap = await getUserPhones(userIds);
      if (phoneMap.size === 0) {
        return;
      }

      const appUrl = env.APP_URL;
      const whatsappBody =
        clickAction && appUrl
          ? `${body}\n\nView: ${appUrl}${clickAction}`
          : body;
      const footer = appUrl
        ? `\n\n_Sent by Proud Indian Dashboard_(${appUrl})`
        : "";
      const fullMessage = `*${title}*\n\n${whatsappBody}${footer}`;

      await Promise.allSettled(
        [...phoneMap.values()].map((phone) =>
          sendWhatsAppMessage(phone, fullMessage)
        )
      );
    } catch (error) {
      console.error("WhatsApp bulk notification failed:", error);
    }
  })();

  await Promise.all([inboxPromise, emailPromise, whatsappPromise]);
}
