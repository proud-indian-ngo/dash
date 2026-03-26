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
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "New Event Update",
    body: `${authorName} posted an update to ${eventName}.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-posted-${eventId}-${updatedAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}
