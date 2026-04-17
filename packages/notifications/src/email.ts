import { transporter } from "@pi-dash/email/mailer";
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
  title: string;
  toEmail: string;
}

export async function sendNotificationEmail(
  options: SendNotificationEmailOptions
): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: options.toEmail,
      subject: stripLeadingEmoji(options.title),
      html: options.emailHtml ?? `<p>${options.body}</p>`,
      headers: {
        "List-Unsubscribe": `<${env.APP_URL}/settings/notifications>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return true;
  } catch (error) {
    const log = createRequestLogger();
    log.set({
      handler: "sendNotificationEmail",
      to: options.toEmail,
      subject: stripLeadingEmoji(options.title),
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return false;
  }
}
