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
  await sendMessage({
    to: userId,
    title: "Added to Event",
    body: `You've been added to ${eventName}${formatEventDetails(startTime, location)}.`,
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
  await sendBulkMessage({
    userIds,
    title: "Added to Event",
    body: `You've been added to ${eventName}${formatEventDetails(startTime, location)}.`,
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
  await sendMessage({
    to: userId,
    title: "Removed from Event",
    body: `You've been removed from ${eventName}.`,
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
  await sendBulkMessage({
    userIds: teamMemberIds,
    title: "New Event",
    body: `${eventName} has been scheduled${formatEventDetails(startTime, location)}.`,
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
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "Event Updated",
    body: `${eventName} has been updated${formatEventDetails(startTime, location)}.`,
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
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "Event Cancelled",
    body: `${eventName} has been cancelled.`,
    clickAction: `/teams/${teamId}`,
    idempotencyKey: `event-cancelled-${eventId}-${cancelledAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}
