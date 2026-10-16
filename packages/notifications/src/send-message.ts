import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@pi-dash/env/server";
import type { DigestRow } from "@pi-dash/shared/notification-digest";
import { isCloudApiEnabled } from "@pi-dash/whatsapp/cloud";
import { sendWhatsAppNotification } from "@pi-dash/whatsapp/notify";
import {
  getEnabledUserPhonesForTopic,
  isWhatsAppTopicEnabled,
} from "@pi-dash/whatsapp/preferences";
import type { WhatsAppTemplateMessage } from "@pi-dash/whatsapp/template-message";
import { getUserPhone } from "@pi-dash/whatsapp/users";
import { createRequestLogger } from "evlog";

import { type HeldRecipient, holdNotification } from "./batching";
import { forEachLimited } from "./concurrency";
import { buildWhatsAppText } from "./digest";
import { sendBulkNotificationEmails, sendNotificationEmail } from "./email";
import { insertBulkNotifications, insertNotification } from "./inbox";
import { isNotificationsDisabled } from "./kill-switch";
import {
  getBulkChannelPreferences,
  getBulkUserEmails,
  getChannelPreferences,
  getUserEmail,
} from "./preferences";
import { isBatchedTopic, type NotificationChannel, type Topic } from "./topics";

export interface SendMessageOptions {
  body: string;
  channels?: readonly NotificationChannel[];
  clickAction?: string;
  /** How this reads as a row when it's batched into a digest. */
  digest?: DigestRow;
  emailHtml?: string;
  idempotencyKey: string;
  imageUrl?: string;
  /**
   * Send email and WhatsApp now even in a batched topic: for messages that
   * go stale within the batching window (a reminder, a cancellation).
   */
  immediate?: boolean;
  title: string;
  to: string;
  topic: Topic;
  /**
   * The WhatsApp Cloud API template. `null` means this message deliberately
   * has none: with the Cloud API on it isn't sent (or held) on WhatsApp.
   */
  whatsappTemplate: WhatsAppTemplateMessage | null;
}

export interface SendMessageResult {
  channels: { inboxQueued: boolean; emailQueued: boolean; whatsapp: boolean };
  /** Email and WhatsApp were held for the batching window, not sent yet. */
  held: boolean;
  idempotencyKey: string;
  suppressedByKillSwitch: boolean;
  title: string;
  to: string;
  topic: Topic;
}

const sendCaptureStore = new AsyncLocalStorage<CapturedSend[]>();

/** WhatsApp DMs in flight at once for one bulk send. */
const BULK_WHATSAPP_CONCURRENCY = 5;

/**
 * Whether WhatsApp has a message to send: with the Cloud API on, only a
 * template can go out, so a message without one is left off WhatsApp.
 */
function hasWhatsAppForm(template: WhatsAppTemplateMessage | null): boolean {
  return template !== null || !isCloudApiEnabled();
}

/** "sent" and "duplicate" (already sent by an earlier attempt) delivered it. */
function delivered(outcome: string): boolean {
  return outcome === "sent" || outcome === "duplicate";
}

function logWhatsAppError(
  error: unknown,
  fields: Record<string, unknown>
): void {
  const log = createRequestLogger();
  log.set({ channel: "whatsapp", ...fields });
  log.error(error instanceof Error ? error : String(error));
  log.emit();
}

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
  digest,
  imageUrl,
  immediate,
  topic,
  channels,
  whatsappTemplate,
}: SendMessageOptions): Promise<SendMessageResult> {
  if (await isNotificationsDisabled()) {
    const log = createRequestLogger();
    log.set({
      event: "suppressed_by_kill_switch",
      handler: "sendMessage",
      title,
      topic,
      userId: to,
    });
    log.emit();
    const suppressed: SendMessageResult = {
      channels: { emailQueued: false, inboxQueued: false, whatsapp: false },
      held: false,
      idempotencyKey,
      suppressedByKillSwitch: true,
      title,
      to,
      topic,
    };
    recordSend({ kind: "message", result: suppressed });
    return suppressed;
  }

  const [prefs, email] = await Promise.all([
    getChannelPreferences(to, topic),
    getUserEmail(to),
  ]);

  const inboxPromise =
    (channels?.includes("inbox") ?? true) && prefs.inboxEnabled
      ? insertNotification({
          body,
          clickAction,
          idempotencyKey: `${idempotencyKey}-inbox`,
          imageUrl,
          title,
          topicId: topic,
          userId: to,
        })
      : false;

  const held = !immediate && isBatchedTopic(topic);
  const wantsEmail =
    (channels?.includes("email") ?? true) && prefs.emailEnabled && !!email;
  const wantsWhatsApp =
    (channels?.includes("whatsapp") ?? true) &&
    hasWhatsAppForm(whatsappTemplate);
  const whatsappText = buildWhatsAppText({
    appName: env.APP_NAME,
    appUrl: env.APP_URL,
    body,
    clickAction,
    imageUrl,
    title,
  });

  const emailPromise =
    !held && wantsEmail && email
      ? sendNotificationEmail({
          body,
          emailHtml,
          idempotencyKey: `${idempotencyKey}-email`,
          title,
          toEmail: email,
          topic,
          userId: to,
        })
      : false;

  // A thrown send is transient (throttled, 5xx, network): it's kept and
  // rethrown once the other channels finish, so the job is retried. Every
  // channel is idempotent by key, so the retry duplicates nothing.
  let whatsappError: unknown;
  const whatsappPromise = (async (): Promise<boolean> => {
    if (!wantsWhatsApp) {
      return false;
    }
    try {
      const [phone, topicEnabled] = await Promise.all([
        getUserPhone(to),
        isWhatsAppTopicEnabled(to, topic),
      ]);
      if (!(phone && topicEnabled)) {
        return false;
      }
      if (held) {
        return true;
      }
      const outcome = await sendWhatsAppNotification(
        phone,
        { template: whatsappTemplate ?? undefined, text: whatsappText },
        { idempotencyKey: `${idempotencyKey}-whatsapp-${to}`, userId: to }
      );
      return delivered(outcome);
    } catch (error) {
      logWhatsAppError(error, {
        handler: "sendMessage",
        idempotencyKey,
        title,
        topic,
        userId: to,
      });
      whatsappError = error;
      return false;
    }
  })();

  const [inboxQueued, emailQueued, whatsappReady] = await Promise.all([
    inboxPromise,
    emailPromise,
    whatsappPromise,
  ]);

  // For batched topics the WhatsApp check above only decides who's held.
  const heldRecipients: HeldRecipient[] = [
    ...(wantsEmail ? [{ channel: "email" as const, userId: to }] : []),
    ...(whatsappReady ? [{ channel: "whatsapp" as const, userId: to }] : []),
  ];
  const heldOk = held
    ? await holdNotification({
        body,
        clickAction,
        digest,
        emailHtml,
        idempotencyKey,
        recipients: heldRecipients,
        title,
        topic,
        whatsappTemplate,
        whatsappText,
      })
    : false;

  const result: SendMessageResult = {
    channels: {
      emailQueued: held ? heldOk && wantsEmail : Boolean(emailQueued),
      inboxQueued: Boolean(inboxQueued),
      whatsapp: held ? heldOk && whatsappReady : whatsappReady,
    },
    held: heldOk,
    idempotencyKey,
    suppressedByKillSwitch: false,
    title,
    to,
    topic,
  };
  recordSend({ kind: "message", result });
  if (whatsappError !== undefined) {
    throw whatsappError;
  }
  return result;
}

interface SendBulkMessageOptions {
  body: string;
  clickAction?: string;
  /** How this reads as a row when it's batched into a digest. */
  digest?: DigestRow;
  emailHtml?: string;
  idempotencyKey: string;
  /** See `SendMessageOptions.immediate`. */
  immediate?: boolean;
  inboxBody?: string;
  /** Skip individual WhatsApp DMs — use when sending to a group separately. */
  skipWhatsApp?: boolean;
  title: string;
  topic: Topic;
  userIds: string[];
  /** See `SendMessageOptions.whatsappTemplate`. */
  whatsappTemplate: WhatsAppTemplateMessage | null;
}

export interface SendBulkMessageResult {
  channels: {
    inboxQueued: boolean;
    emailQueued: boolean;
    whatsappRecipients: number;
  };
  /** Email and WhatsApp were held for the batching window, not sent yet. */
  held: boolean;
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
  digest,
  idempotencyKey,
  immediate,
  inboxBody,
  skipWhatsApp,
  topic,
  whatsappTemplate,
}: SendBulkMessageOptions): Promise<SendBulkMessageResult> {
  if (userIds.length === 0) {
    const empty: SendBulkMessageResult = {
      channels: {
        emailQueued: false,
        inboxQueued: false,
        whatsappRecipients: 0,
      },
      held: false,
      idempotencyKey,
      skippedEmpty: true,
      suppressedByKillSwitch: false,
      title,
      topic,
      userCount: 0,
    };
    recordSend({ kind: "bulk", result: empty });
    return empty;
  }

  if (await isNotificationsDisabled()) {
    const log = createRequestLogger();
    log.set({
      event: "suppressed_by_kill_switch",
      handler: "sendBulkMessage",
      title,
      topic,
      userCount: userIds.length,
    });
    log.emit();
    const suppressed: SendBulkMessageResult = {
      channels: {
        emailQueued: false,
        inboxQueued: false,
        whatsappRecipients: 0,
      },
      held: false,
      idempotencyKey,
      skippedEmpty: false,
      suppressedByKillSwitch: true,
      title,
      topic,
      userCount: userIds.length,
    };
    recordSend({ kind: "bulk", result: suppressed });
    return suppressed;
  }

  const [prefsMap, emailMap] = await Promise.all([
    getBulkChannelPreferences(userIds, topic),
    getBulkUserEmails(userIds),
  ]);

  const DEFAULTS = {
    emailEnabled: true,
    inboxEnabled: true,
    whatsappEnabled: true,
  };
  const displayBody = inboxBody ?? body;

  const inboxPromise = (async (): Promise<boolean> => {
    const inboxNotifications = userIds
      .filter((uid) => (prefsMap.get(uid) ?? DEFAULTS).inboxEnabled)
      .map((uid) => ({
        body: displayBody,
        clickAction,
        idempotencyKey: `${idempotencyKey}-inbox-${uid}`,
        title,
        topicId: topic,
        userId: uid,
      }));
    if (inboxNotifications.length === 0) {
      return false;
    }
    const count = await insertBulkNotifications(inboxNotifications);
    return count > 0;
  })();

  const held = !immediate && isBatchedTopic(topic);
  const emailRecipients = userIds.flatMap((uid) => {
    const email = emailMap.get(uid);
    const prefs = prefsMap.get(uid) ?? DEFAULTS;
    return prefs.emailEnabled && email ? [{ email, userId: uid }] : [];
  });
  const whatsappText = buildWhatsAppText({
    appName: env.APP_NAME,
    appUrl: env.APP_URL,
    body,
    clickAction,
    title,
  });

  const emailPromise = (async (): Promise<boolean> => {
    const recipients = emailRecipients;
    if (held || recipients.length === 0) {
      return false;
    }
    return await sendBulkNotificationEmails({
      body,
      emailHtml,
      idempotencyKey: `${idempotencyKey}-email`,
      recipients,
      title,
      topic,
    });
  })();

  // See sendMessage: a thrown send is rethrown once every channel finishes.
  let whatsappError: unknown;
  // For batched topics this only finds who's held: the ids, sent nothing.
  const whatsappPromise = (async (): Promise<string[]> => {
    if (skipWhatsApp || !hasWhatsAppForm(whatsappTemplate)) {
      return [];
    }
    let phoneMap: Map<string, string>;
    try {
      phoneMap = await getEnabledUserPhonesForTopic(userIds, topic);
    } catch (error) {
      logWhatsAppError(error, {
        handler: "sendBulkMessage",
        idempotencyKey,
        title,
        topic,
        userCount: userIds.length,
      });
      whatsappError = error;
      return [];
    }
    if (held || phoneMap.size === 0) {
      return [...phoneMap.keys()];
    }

    const sentTo = new Set<string>();
    await forEachLimited(
      [...phoneMap.entries()],
      BULK_WHATSAPP_CONCURRENCY,
      async ([userId, phone]) => {
        const recipientKey = `${idempotencyKey}-whatsapp-${userId}`;
        try {
          const outcome = await sendWhatsAppNotification(
            phone,
            { template: whatsappTemplate ?? undefined, text: whatsappText },
            { idempotencyKey: recipientKey, userId }
          );
          if (delivered(outcome)) {
            sentTo.add(userId);
          }
        } catch (error) {
          logWhatsAppError(error, {
            handler: "sendBulkMessage",
            idempotencyKey: recipientKey,
            topic,
            userId,
          });
          whatsappError ??= error;
        }
      }
    );
    // Report recipients in the order they were given.
    return [...phoneMap.keys()].filter((userId) => sentTo.has(userId));
  })();

  const [inboxQueued, emailQueued, whatsappUserIds] = await Promise.all([
    inboxPromise,
    emailPromise,
    whatsappPromise,
  ]);

  const heldOk = held
    ? await holdNotification({
        body,
        clickAction,
        digest,
        emailHtml,
        idempotencyKey,
        recipients: [
          ...emailRecipients.map((r) => ({
            channel: "email" as const,
            userId: r.userId,
          })),
          ...whatsappUserIds.map((userId) => ({
            channel: "whatsapp" as const,
            userId,
          })),
        ],
        title,
        topic,
        whatsappTemplate,
        whatsappText,
      })
    : false;

  const result: SendBulkMessageResult = {
    channels: {
      emailQueued: held ? heldOk && emailRecipients.length > 0 : emailQueued,
      inboxQueued,
      whatsappRecipients: held && !heldOk ? 0 : whatsappUserIds.length,
    },
    held: heldOk,
    idempotencyKey,
    skippedEmpty: false,
    suppressedByKillSwitch: false,
    title,
    topic,
    userCount: userIds.length,
  };
  recordSend({ kind: "bulk", result });
  if (whatsappError !== undefined) {
    throw whatsappError;
  }
  return result;
}
