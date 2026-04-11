import { db } from "@pi-dash/db";
import { eventRsvpPoll } from "@pi-dash/db/schema/event-rsvp";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { and, eq, isNull } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { CloseRsvpPollOnCancelPayload } from "../enqueue";

/** UUIDv7 placeholder messageIds start with a hex timestamp; real WhatsApp IDs don't. */
const UUIDV7_RE = /^[\da-f]{8}-[\da-f]{4}-7/;

export async function handleCloseRsvpPollOnCancel(
  jobs: Job<CloseRsvpPollOnCancelPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "close-rsvp-poll-on-cancel",
    });
    const { eventId, eventName, reason } = job.data;
    log.set({ jobId: job.id, eventId, eventName });

    const polls = await db
      .select({
        id: eventRsvpPoll.id,
        messageId: eventRsvpPoll.messageId,
        targetChatJid: eventRsvpPoll.targetChatJid,
        closedAt: eventRsvpPoll.closedAt,
      })
      .from(eventRsvpPoll)
      .where(eq(eventRsvpPoll.eventId, eventId))
      .limit(1);

    const poll = polls[0];
    if (!poll) {
      log.set({ event: "no_poll" });
      log.emit();
      continue;
    }

    if (poll.closedAt) {
      // Already closed and message sent on a previous attempt
      log.set({ event: "already_closed" });
      log.emit();
      continue;
    }

    // Send the cancel message FIRST — if this fails, pg-boss retries and
    // the poll stays open so we'll try again. A duplicate cancel notice on
    // retry is acceptable; a lost one is not.
    const message = reason
      ? `⚠️ "${eventName}" has been cancelled. Reason: ${reason}`
      : `⚠️ "${eventName}" has been cancelled.`;

    const replyMessageId = UUIDV7_RE.test(poll.messageId)
      ? undefined
      : poll.messageId;

    await sendWhatsAppGroupMessage(poll.targetChatJid, message, {
      replyMessageId,
    });

    // Close the poll only after the message is sent successfully.
    // This ensures retries re-send the message if it failed previously.
    await db
      .update(eventRsvpPoll)
      .set({ closedAt: new Date() })
      .where(
        and(eq(eventRsvpPoll.id, poll.id), isNull(eventRsvpPoll.closedAt))
      );

    log.set({ event: "cancel_message_sent" });
    log.emit();
  }
}
