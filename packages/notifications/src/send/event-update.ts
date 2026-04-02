import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendBulkMessage } from "../send-message";
import { TOPICS } from "../topics";

interface EventUpdatePostedOptions {
  authorName: string;
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  updatedAt: number;
}

export async function notifyEventUpdatePosted({
  eventId,
  eventName,
  eventMemberIds,
  authorName,
  updatedAt,
}: EventUpdatePostedOptions): Promise<void> {
  const body = `${authorName} posted an update to ${eventName}.`;
  const emailHtml = await renderNotificationEmail({
    heading: "New Event Update",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "New Event Update",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-posted-${eventId}-${updatedAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}
