import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface InterestReceivedOptions {
  eventId: string;
  eventName: string;
  leadUserIds: string[];
  teamId: string;
  volunteerName: string;
}

interface InterestApprovedOptions {
  eventId: string;
  eventName: string;
  userId: string;
}

interface InterestRejectedOptions {
  eventId: string;
  eventName: string;
  userId: string;
}

export async function notifyEventInterestReceived({
  eventId,
  eventName,
  leadUserIds,
  volunteerName,
}: InterestReceivedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Someone's interested!",
    paragraphs: [`${volunteerName} wants to join ${eventName}!`],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Take a look",
  });
  await sendBulkMessage({
    userIds: leadUserIds,
    title: "🙋 Someone's interested!",
    body: `${volunteerName} wants to join ${eventName}!`,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-interest-received-${eventId}`,
    topic: TOPICS.EVENTS_INTEREST,
  });
}

export async function notifyEventInterestApproved({
  eventId,
  eventName,
  userId,
}: InterestApprovedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "You're in!",
    paragraphs: [
      `Great news — you've been approved for ${eventName}! Welcome to the crew.`,
    ],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: userId,
    title: "✅ You're in!",
    body: `Great news — you've been approved for ${eventName}! Welcome to the crew.`,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-interest-approved-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_INTEREST,
  });
}

export async function notifyEventInterestRejected({
  eventId,
  eventName,
  userId,
}: InterestRejectedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Interest update",
    paragraphs: [
      `Unfortunately, your interest in ${eventName} wasn't approved this time.`,
    ],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: userId,
    title: "📅 Interest update",
    body: `Unfortunately, your interest in ${eventName} wasn't approved this time.`,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-interest-rejected-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_INTEREST,
  });
}
