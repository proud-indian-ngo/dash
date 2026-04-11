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
  event: z.literal("message.poll_vote"),
  device_id: z.string(),
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
    voteMessageId: webhook.payload.id,
    senderPhone,
    selectedOptionHashes: webhook.payload.selected_option_hashes,
    selectedOptionCount: webhook.payload.selected_option_count,
  });

  if (!senderPhone) {
    log.warn("missing_sender_phone");
    log.emit();
    return "ignored";
  }

  const polls = await db
    .select({
      id: eventRsvpPoll.id,
      eventId: eventRsvpPoll.eventId,
      yesOptionHash: eventRsvpPoll.yesOptionHash,
      noOptionHash: eventRsvpPoll.noOptionHash,
      closedAt: eventRsvpPoll.closedAt,
      eventStartTime: teamEvent.startTime,
    })
    .from(eventRsvpPoll)
    .innerJoin(teamEvent, eq(teamEvent.id, eventRsvpPoll.eventId))
    .where(eq(eventRsvpPoll.messageId, webhook.payload.poll_message_id))
    .limit(1);

  const poll = polls[0];
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
  const resolvedUserId = matchedUsers[0]?.id ?? null;

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
      pollId: poll.id,
      userId: resolvedUserId,
      phone: senderPhone,
      voteMessageId: webhook.payload.id,
      selectedOptionHashes: webhook.payload.selected_option_hashes,
      selectedOption,
      votedAt: new Date(webhook.payload.timestamp),
    })
    .onConflictDoUpdate({
      target: [eventRsvpVote.pollId, eventRsvpVote.phone],
      set: {
        userId: sql`excluded.user_id`,
        voteMessageId: sql`excluded.vote_message_id`,
        selectedOptionHashes: sql`excluded.selected_option_hashes`,
        selectedOption: sql`excluded.selected_option`,
        votedAt: sql`excluded.voted_at`,
      },
    });

  if (!resolvedUserId) {
    log.warn("rsvp_vote_user_not_found");
    log.emit();
    return "processed";
  }

  // Check if voter is a member of the event's team
  const eventRows = await db
    .select({
      teamId: teamEvent.teamId,
      name: teamEvent.name,
      cancelledAt: teamEvent.cancelledAt,
    })
    .from(teamEvent)
    .where(eq(teamEvent.id, poll.eventId))
    .limit(1);
  const event = eventRows[0];

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
          const voterName = voterRows[0]?.name ?? senderPhone;
          await enqueue("send-bulk-notification", {
            userIds: adminIds,
            title: "RSVP from non-team member",
            body: `${voterName} voted "${selectedOption}" for "${event.name}" but is not a member of the event's team.`,
            topicId: "Account Notifications",
            idempotencyKey: `rsvp-non-member-${poll.id}-${resolvedUserId}`,
          });
        }
      );
    }
  }

  if (selectedOption === "yes") {
    await db
      .insert(teamEventMember)
      .values({
        id: uuidv7(),
        eventId: poll.eventId,
        userId: resolvedUserId,
        addedAt: new Date(webhook.payload.timestamp),
        attendance: null,
        attendanceMarkedAt: null,
        attendanceMarkedBy: null,
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
