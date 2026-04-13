import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

function formatEventDetails(
  startTime: number,
  location?: string | null
): string {
  const date = new Date(startTime).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const parts = [` on ${date}`];
  if (location) {
    parts.push(` at ${location}`);
  }
  return parts.join("");
}

interface AddedToEventOptions {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  userId: string;
}

interface UsersAddedToEventOptions {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  userIds: string[];
}

interface RemovedFromEventOptions {
  eventId: string;
  eventName: string;
  teamId: string;
  userId: string;
}

interface EventCreatedOptions {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  teamMemberIds: string[];
}

interface EventUpdatedOptions {
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  location: string | null;
  startTime: number;
  teamId: string;
  updatedAt: number;
}

interface EventCancelledOptions {
  cancelledAt: number;
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  teamId: string;
}

export async function notifyAddedToEvent({
  userId,
  eventName,
  startTime,
  location,
  teamId,
  eventId,
}: AddedToEventOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "You're in!",
    paragraphs: [
      `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    ],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: userId,
    title: "✅ You're in!",
    body: `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-member-added-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

export async function notifyUsersAddedToEvent({
  userIds,
  eventName,
  startTime,
  location,
  teamId,
  eventId,
}: UsersAddedToEventOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "You're in!",
    paragraphs: [
      `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    ],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "View event",
  });
  await sendBulkMessage({
    userIds,
    title: "✅ You're in!",
    body: `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-member-added-${eventId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

export async function notifyRemovedFromEvent({
  userId,
  eventName,
  teamId,
  eventId,
}: RemovedFromEventOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Event update",
    paragraphs: [`You've been removed from ${eventName}.`],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: userId,
    title: "📅 Event update",
    body: `You've been removed from ${eventName}.`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-member-removed-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

export async function notifyEventCreated({
  teamMemberIds,
  eventName,
  startTime,
  location,
  teamId,
  eventId,
}: EventCreatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "New event!",
    paragraphs: [
      `${eventName} is happening${formatEventDetails(startTime, location)} — mark your calendar!`,
    ],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "Check it out",
  });
  await sendBulkMessage({
    userIds: teamMemberIds,
    title: "🗓️ New event!",
    body: `${eventName} is happening${formatEventDetails(startTime, location)} — mark your calendar!`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-created-${eventId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

export async function notifyEventUpdated({
  eventMemberIds,
  eventName,
  startTime,
  location,
  teamId,
  eventId,
  updatedAt,
}: EventUpdatedOptions): Promise<void> {
  const bodyText = `${eventName} just got updated${formatEventDetails(startTime, location)} — check the latest details.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Event update",
    paragraphs: [bodyText],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "See what changed",
  });
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "📅 Event update",
    body: bodyText,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-updated-${eventId}-${updatedAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

export async function notifyEventCancelled({
  eventMemberIds,
  eventName,
  teamId,
  eventId,
  cancelledAt,
}: EventCancelledOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Event cancelled",
    paragraphs: [`${eventName} has been cancelled.`],
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    ctaLabel: "View event",
  });
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "❌ Event cancelled",
    body: `${eventName} has been cancelled.`,
    emailHtml,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-cancelled-${eventId}-${cancelledAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}
