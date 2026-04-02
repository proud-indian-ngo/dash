import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendBulkMessage } from "../send-message";
import { TOPICS } from "../topics";

interface FeedbackOpenOptions {
  eventId: string;
  eventName: string;
  memberUserIds: string[];
}

export async function notifyEventFeedbackOpen({
  eventId,
  eventName,
  memberUserIds,
}: FeedbackOpenOptions): Promise<void> {
  if (memberUserIds.length === 0) {
    return;
  }

  const emailHtml = await renderNotificationEmail({
    heading: "Share Your Feedback",
    paragraphs: [
      `Anonymous feedback is now open for ${eventName}. Your response is completely anonymous.`,
    ],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share Feedback",
  });
  await sendBulkMessage({
    userIds: memberUserIds,
    title: "Share Your Feedback",
    body: `Anonymous feedback is now open for ${eventName}. Your response is completely anonymous.`,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-feedback-open-${eventId}`,
    topic: TOPICS.EVENTS_FEEDBACK,
  });
}
