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
    heading: "Your feedback matters",
    paragraphs: [
      `Anonymous feedback is open for ${eventName} — share your honest thoughts, it's completely anonymous.`,
    ],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share feedback",
  });
  await sendBulkMessage({
    userIds: memberUserIds,
    title: "💬 Your feedback matters",
    body: `Anonymous feedback is open for ${eventName} — share your honest thoughts, it's completely anonymous.`,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-feedback-open-${eventId}`,
    topic: TOPICS.EVENTS_FEEDBACK,
  });
}
