import { freezeEmailBatchRecipients } from "@pi-dash/db/queries/email-batch-recipients";
import { FOOTER_NOTE_PLACEHOLDER } from "@pi-dash/email";
import {
  EmailSendError,
  type EmailMessage,
  sendEmail,
  sendEmailBatch,
} from "@pi-dash/email/mailer";
import { createRequestLogger } from "evlog";

import { buildUnsubscribeLinks, getUnsubscribableTopic } from "./unsubscribe";

const LEADING_EMOJI_RE =
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]️?\s*/u;

export function stripLeadingEmoji(text: string): string {
  return text.replace(LEADING_EMOJI_RE, "");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface NotificationEmailInput {
  body: string;
  emailHtml?: string;
  title: string;
  toEmail: string;
  /** Recipient topic for the unsubscribe link; required topics get none. */
  topic?: string;
  userId?: string;
}

/**
 * One recipient's email: the shared HTML with this recipient's footer
 * sentence, and RFC 8058 one-click unsubscribe headers for optional topics.
 */
export function buildNotificationEmail(
  input: NotificationEmailInput
): EmailMessage {
  const links =
    input.userId && input.topic
      ? buildUnsubscribeLinks(input.userId, input.topic)
      : null;
  const topic = input.topic ? getUnsubscribableTopic(input.topic) : null;
  const footerNote =
    links && topic
      ? `You're getting this because you're subscribed to <b>${escapeHtml(
          `${topic.group} · ${topic.name}`
        )}</b>.<br><a href="${escapeHtml(
          links.pageUrl
        )}" style="color:#5B6670;text-decoration:underline">Unsubscribe from this topic</a> · `
      : "";
  const html = (input.emailHtml ?? `<p>${escapeHtml(input.body)}</p>`).replace(
    FOOTER_NOTE_PLACEHOLDER,
    footerNote
  );
  return {
    headers: links
      ? {
          "List-Unsubscribe": `<${links.oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
    html,
    subject: stripLeadingEmoji(input.title),
    to: input.toEmail,
  };
}

function logEmailError(error: unknown, fields: Record<string, unknown>): void {
  const log = createRequestLogger();
  log.set({
    handler: "sendNotificationEmail",
    ...fields,
    ...(error instanceof EmailSendError && {
      resendError: error.code,
      statusCode: error.statusCode,
    }),
  });
  log.error(error instanceof Error ? error : String(error));
  log.emit();
}

/** True only when Resend accepted the email; false when skipped or failed. */
export async function sendNotificationEmail(
  options: NotificationEmailInput & {
    /** Deterministic per recipient, so a retried job doesn't send the email twice. */
    idempotencyKey?: string;
  }
): Promise<boolean> {
  const message = buildNotificationEmail(options);
  try {
    const status = await sendEmail({
      ...message,
      idempotencyKey: options.idempotencyKey,
    });
    return status === "sent";
  } catch (error) {
    logEmailError(error, { subject: message.subject, to: message.to });
    return false;
  }
}

/**
 * The recipients for this send: those of the first attempt when the job is a
 * retry. Resend rejects a reused idempotency key whose payload changed, so a
 * retry must not pick up preference or bounce changes made in between.
 * Falls back to the current list when the snapshot can't be read or written.
 */
async function stableRecipients(
  idempotencyKey: string,
  recipients: { email: string; userId: string }[]
): Promise<{ email: string; userId: string }[]> {
  const sorted = [...recipients].sort((a, b) =>
    a.userId.localeCompare(b.userId)
  );
  try {
    return await freezeEmailBatchRecipients(idempotencyKey, sorted);
  } catch (error) {
    logEmailError(error, {
      handler: "sendBulkNotificationEmails",
      step: "freeze_recipients",
    });
    return sorted;
  }
}

/**
 * Sends one notification to many recipients through Resend's batch endpoint.
 * A retried job resends the first attempt's recipients in the same order, so
 * it rebuilds the same chunks and Resend dedupes them. True when at least one
 * email was accepted.
 */
export async function sendBulkNotificationEmails(options: {
  body: string;
  emailHtml?: string;
  idempotencyKey: string;
  recipients: { email: string; userId: string }[];
  title: string;
  topic: string;
}): Promise<boolean> {
  const recipients = await stableRecipients(
    options.idempotencyKey,
    options.recipients
  );
  const messages = recipients.map((recipient) =>
    buildNotificationEmail({
      body: options.body,
      emailHtml: options.emailHtml,
      title: options.title,
      toEmail: recipient.email,
      topic: options.topic,
      userId: recipient.userId,
    })
  );
  try {
    const result = await sendEmailBatch(messages, options.idempotencyKey);
    for (const failure of result.failures) {
      logEmailError(failure.error, {
        handler: "sendBulkNotificationEmails",
        recipientCount: failure.recipients.length,
        subject: stripLeadingEmoji(options.title),
      });
    }
    return result.sent > 0;
  } catch (error) {
    logEmailError(error, {
      handler: "sendBulkNotificationEmails",
      recipientCount: messages.length,
      subject: stripLeadingEmoji(options.title),
    });
    return false;
  }
}
