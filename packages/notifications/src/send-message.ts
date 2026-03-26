import { env } from "@pi-dash/env/server";
import {
  getEnabledUserPhones,
  getUserPhoneIfEnabled,
  sendWhatsAppMessage,
} from "@pi-dash/whatsapp";
import { createRequestLogger } from "evlog";
import { courier } from "./client";
import type { Topic } from "./topics";

interface SendMessageOptions {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  imageUrl?: string;
  title: string;
  to: string;
  topic: Topic;
}

export async function sendMessage({
  to,
  title,
  body,
  emailBody,
  idempotencyKey,
  clickAction,
  imageUrl,
  topic,
}: SendMessageOptions): Promise<void> {
  const inboxPromise = courier
    ? courier.send.message(
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
      )
    : undefined;

  const emailPromise = courier
    ? courier.send.message(
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
      )
    : undefined;

  // TODO: WhatsApp channel does not respect Courier topic preferences.
  // Users who opt out of a topic will stop receiving inbox/email but still get WhatsApp.
  // To fix: check the user's topic preference status before sending.
  const whatsappPromise = (async () => {
    try {
      const phone = await getUserPhoneIfEnabled(to);
      if (!phone) {
        return;
      }
      const appUrl = env.APP_URL;
      const whatsappBody =
        clickAction && appUrl
          ? `${body}\n\nView: ${appUrl}${clickAction}`
          : body;
      const footer = appUrl ? `\n\n_Sent by ${env.APP_NAME}_(${appUrl})` : "";
      const imageSuffix = imageUrl ? `\n\nPayment proof: ${imageUrl}` : "";
      const fullMessage = `*${title}*\n\n${whatsappBody}${imageSuffix}${footer}`;
      await sendWhatsAppMessage(phone, fullMessage);
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "sendMessage",
        channel: "whatsapp",
        userId: to,
        title,
        idempotencyKey,
        topic,
      });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
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
  topic: Topic;
  userIds: string[];
}

export async function sendBulkMessage({
  userIds,
  title,
  body,
  emailBody,
  clickAction,
  idempotencyKey,
  topic,
}: SendBulkMessageOptions): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  const recipients = userIds.map((id) => ({ user_id: id }));

  const inboxPromise = courier
    ? courier.send.message(
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
      )
    : undefined;

  const emailPromise = courier
    ? courier.send.message(
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
      )
    : undefined;

  const whatsappPromise = (async () => {
    try {
      const phoneMap = await getEnabledUserPhones(userIds);
      if (phoneMap.size === 0) {
        return;
      }

      const appUrl = env.APP_URL;
      const whatsappBody =
        clickAction && appUrl
          ? `${body}\n\nView: ${appUrl}${clickAction}`
          : body;
      const footer = appUrl ? `\n\n_Sent by ${env.APP_NAME}_(${appUrl})` : "";
      const fullMessage = `*${title}*\n\n${whatsappBody}${footer}`;

      await Promise.allSettled(
        [...phoneMap.values()].map((phone) =>
          sendWhatsAppMessage(phone, fullMessage)
        )
      );
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "sendBulkMessage",
        channel: "whatsapp",
        userCount: userIds.length,
        title,
        idempotencyKey,
        topic,
      });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
    }
  })();

  await Promise.all([inboxPromise, emailPromise, whatsappPromise]);
}
