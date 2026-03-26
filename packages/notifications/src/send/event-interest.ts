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
  await sendBulkMessage({
    userIds: leadUserIds,
    title: "New Event Interest",
    body: `${volunteerName} is interested in ${eventName}.`,
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
  await sendMessage({
    to: userId,
    title: "Interest Approved",
    body: `Your interest in ${eventName} has been approved! You've been added as a volunteer.`,
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
  await sendMessage({
    to: userId,
    title: "Interest Declined",
    body: `Your interest in ${eventName} has been declined.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-interest-rejected-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_INTEREST,
  });
}
