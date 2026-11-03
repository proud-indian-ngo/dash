import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { eventLabel } from "@pi-dash/shared/event-label";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { sendBulkMessage } from "../send-message";
import { TOPICS } from "../topics";

interface FeedbackOpenOptions {
  eventId: string;
  eventName: string;
  memberUserIds: string[];
  openedAt: number;
  startTime: number;
}

export async function notifyEventFeedbackOpen({
  eventId,
  eventName,
  startTime,
  memberUserIds,
  openedAt,
}: FeedbackOpenOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  if (memberUserIds.length === 0) {
    return;
  }

  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Share feedback",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Your feedback matters",
    paragraphs: [
      `Anonymous feedback is open for ${label} — share your honest thoughts, it's completely anonymous.`,
    ],
  });
  await sendBulkMessage({
    body: `Anonymous feedback is open for ${label} — share your honest thoughts, it's completely anonymous.`,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Share feedback",
      list: { label: "View events", path: "/events" },
      meta: "Anonymous feedback is open",
      name: label,
    },
    emailHtml,
    idempotencyKey: `event-feedback-open-${eventId}-${openedAt}`,
    title: "💬 Your feedback matters",
    topic: TOPICS.EVENTS_FEEDBACK,
    userIds: memberUserIds,
    whatsappTemplate: whatsappTemplate(
      "feedback_open",
      { event: label },
      `/events/${eventId}`
    ),
  });
}
