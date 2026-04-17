import { AsyncLocalStorage } from "node:async_hooks";
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

export interface SendMessageResult {
  channels: { inboxQueued: boolean; emailQueued: boolean; whatsapp: boolean };
  idempotencyKey: string;
  suppressedByKillSwitch: boolean;
  title: string;
  to: string;
  topic: Topic;
}

const sendCaptureStore = new AsyncLocalStorage<CapturedSend[]>();

function recordSend(entry: CapturedSend): void {
  sendCaptureStore.getStore()?.push(entry);
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
}: SendMessageOptions): Promise<SendMessageResult> {
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
    const suppressed: SendMessageResult = {
      to,
      topic,
      title,
      idempotencyKey,
      suppressedByKillSwitch: true,
      channels: { inboxQueued: false, emailQueued: false, whatsapp: false },
    };
    recordSend({ kind: "message", result: suppressed });
    return suppressed;
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

  const whatsappPromise = (async (): Promise<boolean> => {
    try {
      const [phone, topicEnabled] = await Promise.all([
        getUserPhone(to),
        isWhatsAppTopicEnabled(to, topic),
      ]);
      if (!(phone && topicEnabled)) {
        return false;
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
      return true;
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
      return false;
    }
  })();

  const [, , whatsappSent] = await Promise.all([
    inboxPromise,
    emailPromise,
    whatsappPromise,
  ]);

  const result: SendMessageResult = {
    to,
    topic,
    title,
    idempotencyKey,
    suppressedByKillSwitch: false,
    channels: {
      inboxQueued: Boolean(inboxPromise),
      emailQueued: Boolean(emailPromise),
      whatsapp: whatsappSent,
    },
  };
  recordSend({ kind: "message", result });
  return result;
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

export interface SendBulkMessageResult {
  channels: {
    inboxQueued: boolean;
    emailQueued: boolean;
    whatsappRecipients: number;
  };
  idempotencyKey: string;
  skippedEmpty: boolean;
  suppressedByKillSwitch: boolean;
  title: string;
  topic: Topic;
  userCount: number;
}

export type CapturedSend =
  | { kind: "message"; result: SendMessageResult }
  | { kind: "bulk"; result: SendBulkMessageResult };

export function captureSends<T>(fn: () => Promise<T>): Promise<{
  result: T;
  sends: CapturedSend[];
}> {
  const sends: CapturedSend[] = [];
  return sendCaptureStore.run(sends, async () => {
    const result = await fn();
    return { result, sends };
  });
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
}: SendBulkMessageOptions): Promise<SendBulkMessageResult> {
  if (userIds.length === 0) {
    const empty: SendBulkMessageResult = {
      userCount: 0,
      topic,
      title,
      idempotencyKey,
      suppressedByKillSwitch: false,
      skippedEmpty: true,
      channels: {
        inboxQueued: false,
        emailQueued: false,
        whatsappRecipients: 0,
      },
    };
    recordSend({ kind: "bulk", result: empty });
    return empty;
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
    const suppressed: SendBulkMessageResult = {
      userCount: userIds.length,
      topic,
      title,
      idempotencyKey,
      suppressedByKillSwitch: true,
      skippedEmpty: false,
      channels: {
        inboxQueued: false,
        emailQueued: false,
        whatsappRecipients: 0,
      },
    };
    recordSend({ kind: "bulk", result: suppressed });
    return suppressed;
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

  const whatsappPromise = (async (): Promise<number> => {
    try {
      const phoneMap = await getEnabledUserPhonesForTopic(userIds, topic);
      if (phoneMap.size === 0) {
        return 0;
      }

      const appUrl = env.APP_URL;
      const whatsappBody =
        clickAction && appUrl
          ? `${body}\n\nView: ${appUrl}${clickAction}`
          : body;
      const footer = appUrl ? `\n\n_Sent by ${env.APP_NAME}_(${appUrl})` : "";
      const fullMessage = `*${title}*\n\n${whatsappBody}${footer}`;

      const results = await Promise.allSettled(
        [...phoneMap.values()].map((phone) =>
          sendWhatsAppMessage(phone, fullMessage)
        )
      );
      return results.filter((r) => r.status === "fulfilled").length;
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
      return 0;
    }
  })();

  const [, , whatsappRecipients] = await Promise.all([
    inboxPromise,
    emailPromise,
    whatsappPromise,
  ]);

  const result: SendBulkMessageResult = {
    userCount: userIds.length,
    topic,
    title,
    idempotencyKey,
    suppressedByKillSwitch: false,
    skippedEmpty: false,
    channels: {
      inboxQueued: Boolean(inboxPromise),
      emailQueued: Boolean(emailPromise),
      whatsappRecipients,
    },
  };
  recordSend({ kind: "bulk", result });
  return result;
}
