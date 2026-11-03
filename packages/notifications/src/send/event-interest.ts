import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { eventLabel } from "@pi-dash/shared/event-label";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface InterestReceivedOptions {
  eventId: string;
  eventName: string;
  interestId: string;
  leadUserIds: string[];
  teamId: string;
  volunteerName: string;
  startTime: number;
}

interface InterestApprovedOptions {
  eventId: string;
  eventName: string;
  userId: string;
  startTime: number;
}

interface InterestRejectedOptions {
  eventId: string;
  eventName: string;
  userId: string;
  startTime: number;
}

interface VolunteerLeftOptions {
  eventId: string;
  eventName: string;
  leadUserIds: string[];
  leftAt: number;
  volunteerName: string;
  volunteerUserId: string;
  startTime: number;
}

export async function notifyEventInterestReceived({
  eventId,
  eventName,
  startTime,
  interestId,
  leadUserIds,
  volunteerName,
}: InterestReceivedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Take a look",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Someone's interested!",
    paragraphs: [`${volunteerName} wants to join ${label}!`],
  });
  await sendBulkMessage({
    body: `${volunteerName} wants to join ${label}!`,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Review",
      list: { label: "View events", path: "/events" },
      meta: `Wants to join ${label}`,
      name: volunteerName,
      status: { label: "Interested", tone: "info" },
    },
    emailHtml,
    idempotencyKey: `event-interest-received-${eventId}-${interestId}`,
    title: "🙋 Someone's interested!",
    topic: TOPICS.EVENTS_INTEREST,
    userIds: leadUserIds,
    whatsappTemplate: whatsappTemplate(
      "event_interest_received",
      { event: label, volunteer: volunteerName },
      `/events/${eventId}`
    ),
  });
}

export async function notifyEventInterestApproved({
  eventId,
  eventName,
  startTime,
  userId,
}: InterestApprovedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "You're in!",
    paragraphs: [
      `Great news — you've been approved for ${label}! Welcome to the crew.`,
    ],
  });
  await sendMessage({
    body: `Great news — you've been approved for ${label}! Welcome to the crew.`,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "You've been approved",
      name: label,
      status: { label: "You're in", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `event-interest-approved-${eventId}-${userId}`,
    title: "✅ You're in!",
    to: userId,
    topic: TOPICS.EVENTS_INTEREST,
    whatsappTemplate: whatsappTemplate(
      "event_interest_approved",
      { event: label },
      `/events/${eventId}`
    ),
  });
}

export async function notifyEventInterestRejected({
  eventId,
  eventName,
  startTime,
  userId,
}: InterestRejectedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Interest update",
    paragraphs: [
      `Unfortunately, your interest in ${label} wasn't approved this time.`,
    ],
  });
  await sendMessage({
    body: `Unfortunately, your interest in ${label} wasn't approved this time.`,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "Not approved this time",
      name: label,
      status: { label: "Not approved", tone: "neutral" },
    },
    emailHtml,
    idempotencyKey: `event-interest-rejected-${eventId}-${userId}`,
    title: "📅 Interest update",
    to: userId,
    topic: TOPICS.EVENTS_INTEREST,
    whatsappTemplate: whatsappTemplate(
      "event_interest_declined",
      { event: label },
      `/events/${eventId}`
    ),
  });
}

export async function notifyEventVolunteerLeft({
  eventId,
  eventName,
  startTime,
  leadUserIds,
  leftAt,
  volunteerName,
  volunteerUserId,
}: VolunteerLeftOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Volunteer left event",
    paragraphs: [`${volunteerName} left ${label}.`],
  });
  await sendBulkMessage({
    body: `${volunteerName} left ${label}.`,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: `Left ${label}`,
      name: volunteerName,
      status: { label: "Left", tone: "neutral" },
    },
    emailHtml,
    idempotencyKey: `event-volunteer-left-${eventId}-${volunteerUserId}-${leftAt}`,
    title: "🏃 Volunteer left",
    topic: TOPICS.EVENTS_INTEREST,
    userIds: leadUserIds,
    whatsappTemplate: whatsappTemplate(
      "event_volunteer_left",
      { event: label, volunteer: volunteerName },
      `/events/${eventId}`
    ),
  });
}
