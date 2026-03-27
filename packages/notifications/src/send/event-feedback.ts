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

  await sendBulkMessage({
    userIds: memberUserIds,
    title: "Share Your Feedback",
    body: `Anonymous feedback is now open for ${eventName}. Your response is completely anonymous.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-feedback-open-${eventId}`,
    topic: TOPICS.EVENTS_FEEDBACK,
  });
}
