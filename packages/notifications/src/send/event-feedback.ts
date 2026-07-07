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
    ctaLabel: "Share feedback",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Your feedback matters",
    paragraphs: [
      `Anonymous feedback is open for ${eventName} — share your honest thoughts, it's completely anonymous.`,
    ],
  });
  await sendBulkMessage({
    body: `Anonymous feedback is open for ${eventName} — share your honest thoughts, it's completely anonymous.`,
    clickAction: `/events/${eventId}`,
    emailHtml,
    idempotencyKey: `event-feedback-open-${eventId}`,
    title: "💬 Your feedback matters",
    topic: TOPICS.EVENTS_FEEDBACK,
    userIds: memberUserIds,
  });
}
