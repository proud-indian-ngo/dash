import { EmailSendError, sendEmail } from "@pi-dash/email/mailer";
import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";

const LEADING_EMOJI_RE =
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?\s*/u;

export function stripLeadingEmoji(text: string): string {
  return text.replace(LEADING_EMOJI_RE, "");
}

interface SendNotificationEmailOptions {
  body: string;
  emailHtml?: string;
  /** Deterministic per recipient, so a retried job doesn't send the email twice. */
  idempotencyKey?: string;
  title: string;
  toEmail: string;
}

/** True only when Resend accepted the email; false when skipped or failed. */
export async function sendNotificationEmail(
  options: SendNotificationEmailOptions
): Promise<boolean> {
  try {
    const status = await sendEmail({
      headers: {
        "List-Unsubscribe": `<${env.APP_URL}/settings/notifications>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      html: options.emailHtml ?? `<p>${options.body}</p>`,
      idempotencyKey: options.idempotencyKey,
      subject: stripLeadingEmoji(options.title),
      to: options.toEmail,
    });
    return status === "sent";
  } catch (error) {
    const log = createRequestLogger();
    log.set({
      handler: "sendNotificationEmail",
      ...(error instanceof EmailSendError && {
        resendError: error.code,
        statusCode: error.statusCode,
      }),
      subject: stripLeadingEmoji(options.title),
      to: options.toEmail,
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return false;
  }
}
