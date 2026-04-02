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
    heading: "New Event Interest",
    paragraphs: [`${volunteerName} is interested in ${eventName}.`],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendBulkMessage({
    userIds: leadUserIds,
    title: "New Event Interest",
    body: `${volunteerName} is interested in ${eventName}.`,
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
    heading: "Interest Approved",
    paragraphs: [
      `Your interest in ${eventName} has been approved! You've been added as a volunteer.`,
    ],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: userId,
    title: "Interest Approved",
    body: `Your interest in ${eventName} has been approved! You've been added as a volunteer.`,
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
    heading: "Interest Declined",
    paragraphs: [`Your interest in ${eventName} has been declined.`],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: userId,
    title: "Interest Declined",
    body: `Your interest in ${eventName} has been declined.`,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-interest-rejected-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_INTEREST,
  });
}
