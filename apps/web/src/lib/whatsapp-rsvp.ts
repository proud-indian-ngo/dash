import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventRsvpPoll, eventRsvpVote } from "@pi-dash/db/schema/event-rsvp";
import { teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { formatPhoneForWhatsApp } from "@pi-dash/whatsapp/phone";
import { and, eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import z from "zod";

export const whatsAppPollVoteWebhookSchema = z.object({
  device_id: z.string(),
  event: z.literal("message.poll_vote"),
  payload: z.object({
    chat_id: z.string(),
    from: z.string(),
    from_lid: z.string().optional(),
    from_name: z.string().optional(),
    id: z.string(),
    is_from_me: z.boolean(),
    poll_chat_id: z.string().optional(),
    poll_message_id: z.string(),
    selected_option_count: z.number().int().nonnegative(),
    selected_option_hashes: z.array(z.string()),
    timestamp: z.string(),
  }),
});

export type WhatsAppPollVoteWebhook = z.infer<
  typeof whatsAppPollVoteWebhookSchema
>;

type SelectedOption = "yes" | "no" | "unknown";

function getSelectedOption(
  selectedOptionHashes: string[],
  yesOptionHash: string,
  noOptionHash: string
): SelectedOption {
  if (selectedOptionHashes.length === 0) {
    return "no";
  }
  if (selectedOptionHashes.length !== 1) {
    return "unknown";
  }

  if (selectedOptionHashes[0] === yesOptionHash) {
    return "yes";
  }
  if (selectedOptionHashes[0] === noOptionHash) {
    return "no";
  }
  return "unknown";
}

function normalizeSenderPhone(fromJid: string): string {
  const [phone = ""] = fromJid.split("@");
  return formatPhoneForWhatsApp(phone);
}

export async function processWhatsAppPollVoteWebhook(
  webhook: WhatsAppPollVoteWebhook
): Promise<"processed" | "ignored"> {
  const log = createRequestLogger({
    method: "POST",
    path: "processWhatsAppPollVoteWebhook",
  });

  const senderPhone = normalizeSenderPhone(webhook.payload.from);
  log.set({
    deviceId: webhook.device_id,
    eventType: webhook.event,
    from: webhook.payload.from,
    fromName: webhook.payload.from_name,
    pollMessageId: webhook.payload.poll_message_id,
    selectedOptionCount: webhook.payload.selected_option_count,
    selectedOptionHashes: webhook.payload.selected_option_hashes,
    senderPhone,
    voteMessageId: webhook.payload.id,
  });

  if (!senderPhone) {
    log.warn("missing_sender_phone");
    log.emit();
    return "ignored";
  }

  const polls = await db
    .select({
      closedAt: eventRsvpPoll.closedAt,
      eventId: eventRsvpPoll.eventId,
      eventStartTime: teamEvent.startTime,
      id: eventRsvpPoll.id,
      noOptionHash: eventRsvpPoll.noOptionHash,
      yesOptionHash: eventRsvpPoll.yesOptionHash,
    })
    .from(eventRsvpPoll)
    .innerJoin(teamEvent, eq(teamEvent.id, eventRsvpPoll.eventId))
    .where(eq(eventRsvpPoll.messageId, webhook.payload.poll_message_id))
    .limit(1);

  const [poll] = polls;
  if (!poll) {
    log.warn("rsvp_poll_not_found");
    log.emit();
    return "ignored";
  }

  if (poll.closedAt || poll.eventStartTime <= new Date()) {
    log.warn("rsvp_poll_closed");
    log.emit();
    return "ignored";
  }

  const selectedOption = getSelectedOption(
    webhook.payload.selected_option_hashes,
    poll.yesOptionHash,
    poll.noOptionHash
  );

  const matchedUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(
      eq(sql`regexp_replace(${user.phone}, '[^0-9]', '', 'g')`, senderPhone)
    )
    .limit(1);
  const resolvedUserId = matchedUsers[0]?.id;

  log.set({
    eventId: poll.eventId,
    pollId: poll.id,
    resolvedUserId,
    selectedOption,
  });

  await db
    .insert(eventRsvpVote)
    .values({
      id: uuidv7(),
      phone: senderPhone,
      pollId: poll.id,
      selectedOption,
      selectedOptionHashes: webhook.payload.selected_option_hashes,
      userId: resolvedUserId,
      votedAt: new Date(webhook.payload.timestamp),
      voteMessageId: webhook.payload.id,
    })
    .onConflictDoUpdate({
      set: {
        selectedOption: sql`excluded.selected_option`,
        selectedOptionHashes: sql`excluded.selected_option_hashes`,
        userId: sql`excluded.user_id`,
        votedAt: sql`excluded.voted_at`,
        voteMessageId: sql`excluded.vote_message_id`,
      },
      target: [eventRsvpVote.pollId, eventRsvpVote.phone],
    });

  if (!resolvedUserId) {
    log.warn("rsvp_vote_user_not_found");
    log.emit();
    return "processed";
  }

  // Check if voter is a member of the event's team
  const eventRows = await db
    .select({
      cancelledAt: teamEvent.cancelledAt,
      name: teamEvent.name,
      teamId: teamEvent.teamId,
    })
    .from(teamEvent)
    .where(eq(teamEvent.id, poll.eventId))
    .limit(1);
  const [event] = eventRows;

  if (event?.cancelledAt) {
    log.warn("rsvp_vote_event_cancelled");
    log.emit();
    return "ignored";
  }

  if (event) {
    const membership = await db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, event.teamId),
          eq(teamMember.userId, resolvedUserId)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      log.set({ event: "rsvp_voter_not_in_team", teamId: event.teamId });
      withFireAndForgetLog(
        { hook: "rsvp-non-member-vote", userId: resolvedUserId },
        async () => {
          const adminIds = await getUserIdsWithPermission("system.alerts");
          if (adminIds.length === 0) {
            return;
          }
          const voterRows = await db
            .select({ name: user.name })
            .from(user)
            .where(eq(user.id, resolvedUserId))
            .limit(1);
          const voterName = voterRows[0]?.name;
          await enqueue("send-bulk-notification", {
            body: `${voterName} voted "${selectedOption}" for "${event.name}" but is not a member of the event's team.`,
            idempotencyKey: `rsvp-non-member-${poll.id}-${resolvedUserId}`,
            title: "RSVP from non-team member",
            topicId: "Account Notifications",
            userIds: adminIds,
          });
        }
      );
    }
  }

  if (selectedOption === "yes") {
    await db
      .insert(teamEventMember)
      .values({
        addedAt: new Date(webhook.payload.timestamp),
        attendance: null,
        attendanceMarkedAt: null,
        attendanceMarkedBy: null,
        eventId: poll.eventId,
        id: uuidv7(),
        userId: resolvedUserId,
      })
      .onConflictDoNothing({
        target: [teamEventMember.eventId, teamEventMember.userId],
      });
  } else if (selectedOption === "no") {
    await db
      .delete(teamEventMember)
      .where(
        and(
          eq(teamEventMember.eventId, poll.eventId),
          eq(teamEventMember.userId, resolvedUserId)
        )
      );
  }

  log.set({ event: "poll_vote_processed" });
  log.emit();
  return "processed";
}
