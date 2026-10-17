import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";

import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** "6 Dec 2028" from yyyy-MM-dd. */
function formatDay(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

export interface TermEndingOptions {
  daysLeft: number;
  /** The term's last day, yyyy-MM-dd. */
  lastDay: string;
  /** True when the board would fall below the deed's minimum once it ends. */
  leavesBoardShort: boolean;
  termId: string;
  trusteeName: string;
  userId: string;
  /** The recipient is the trustee whose term it is. */
  isOwnTerm: boolean;
}

/**
 * A trustee's fixed term is ending (90, 30 and 7 days ahead). Goes to the
 * trustee and to everyone who runs governance. One message per recipient,
 * term and offset, whatever retries happen.
 */
export async function notifyTermEnding(
  options: TermEndingOptions
): Promise<void> {
  const when = `${formatDay(options.lastDay)} (${options.daysLeft} days)`;
  const subject = options.isOwnTerm
    ? "your term as a trustee"
    : `${options.trusteeName}'s term as a trustee`;
  const paragraphs = [
    `${options.isOwnTerm ? "Your" : `${options.trusteeName}'s`} term as a trustee of Proud Indian ends on ${when}. To continue, the board reappoints them by resolution before then.`,
  ];
  if (options.leavesBoardShort) {
    paragraphs.push(
      "When this term ends the board falls below the deed's minimum of two trustees, and can then act only to fill vacancies."
    );
  }
  const body = paragraphs.join(" ");
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open the register",
    ctaUrl: `${env.APP_URL}/governance`,
    heading: `Ending soon: ${subject}`,
    paragraphs,
  });
  await sendMessage({
    body,
    clickAction: "/governance",
    digest: {
      actionLabel: "Open",
      meta: `Ends ${formatDay(options.lastDay)}`,
      name: `Term ending: ${options.trusteeName}`,
      status: {
        label: options.leavesBoardShort ? "Board short" : "Ending",
        tone: "warning",
      },
    },
    emailHtml,
    idempotencyKey: `trustee-term-ending-${options.termId}-${options.daysLeft}-${options.userId}`,
    title: `Trustee term ending: ${options.trusteeName}`,
    to: options.userId,
    topic: TOPICS.GOVERNANCE,
    whatsappTemplate: null,
  });
}
