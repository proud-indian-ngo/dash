import { env } from "@pi-dash/env/server";

const LEADING_EMOJI_RE =
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?\s*/u;

/** Strip a leading emoji (and optional trailing space) from a title for use in email subjects. */
function stripLeadingEmoji(text: string): string {
  return text.replace(LEADING_EMOJI_RE, "");
}

import { sendWhatsAppMessage } from "@pi-dash/whatsapp/messaging";
import {
  getEnabledUserPhonesForTopic,
  isWhatsAppTopicEnabled,
} from "@pi-dash/whatsapp/preferences";
import { getUserPhone } from "@pi-dash/whatsapp/users";
import { createRequestLogger } from "evlog";
import { courier } from "./client";
import { isNotificationsDisabled } from "./kill-switch";
import { getCourierTopicId } from "./preferences";
import type { Topic } from "./topics";

interface SendMessageOptions {
  body: string;
  clickAction?: string;
  emailHtml?: string;
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
  emailHtml,
  idempotencyKey,
  clickAction,
  imageUrl,
  topic,
}: SendMessageOptions): Promise<void> {
  if (await isNotificationsDisabled()) {
    const log = createRequestLogger();
    log.set({
      handler: "sendMessage",
      event: "suppressed_by_kill_switch",
      userId: to,
      title,
      topic,
    });
    log.emit();
    return;
  }

  const courierTopicId = courier ? await getCourierTopicId(topic) : topic;

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
              subscription_topic_id: courierTopicId,
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
            content: emailHtml
              ? {
                  version: "2022-01-01",
                  elements: [
                    {
                      type: "channel" as const,
                      channel: "email",
                      raw: {
                        html: emailHtml,
                        subject: stripLeadingEmoji(title),
                      },
                    },
                  ],
                }
              : { title: stripLeadingEmoji(title), body },
            routing: {
              method: "all",
              channels: ["email"],
            },
            preferences: {
              subscription_topic_id: courierTopicId,
            },
          },
        },
        { idempotencyKey: `${idempotencyKey}-email` }
      )
    : undefined;

  const whatsappPromise = (async () => {
    try {
      const [phone, topicEnabled] = await Promise.all([
        getUserPhone(to),
        isWhatsAppTopicEnabled(to, topic),
      ]);
      if (!(phone && topicEnabled)) {
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
  emailHtml?: string;
  idempotencyKey: string;
  inboxBody?: string;
  title: string;
  topic: Topic;
  userIds: string[];
}

export async function sendBulkMessage({
  userIds,
  title,
  body,
  emailHtml,
  clickAction,
  idempotencyKey,
  inboxBody,
  topic,
}: SendBulkMessageOptions): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  if (await isNotificationsDisabled()) {
    const log = createRequestLogger();
    log.set({
      handler: "sendBulkMessage",
      event: "suppressed_by_kill_switch",
      userCount: userIds.length,
      title,
      topic,
    });
    log.emit();
    return;
  }

  const courierTopicId = courier ? await getCourierTopicId(topic) : topic;
  const recipients = userIds.map((id) => ({ user_id: id }));

  const inboxPromise = courier
    ? courier.send.message(
        {
          message: {
            to: recipients,
            content: { title, body: inboxBody ?? body },
            ...(clickAction && { data: { clickAction } }),
            routing: {
              method: "all",
              channels: ["inbox"],
            },
            preferences: {
              subscription_topic_id: courierTopicId,
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
            content: emailHtml
              ? {
                  version: "2022-01-01",
                  elements: [
                    {
                      type: "channel" as const,
                      channel: "email",
                      raw: {
                        html: emailHtml,
                        subject: stripLeadingEmoji(title),
                      },
                    },
                  ],
                }
              : { title: stripLeadingEmoji(title), body },
            routing: {
              method: "all",
              channels: ["email"],
            },
            preferences: {
              subscription_topic_id: courierTopicId,
            },
          },
        },
        { idempotencyKey: `${idempotencyKey}-email` }
      )
    : undefined;

  const whatsappPromise = (async () => {
    try {
      const phoneMap = await getEnabledUserPhonesForTopic(userIds, topic);
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
