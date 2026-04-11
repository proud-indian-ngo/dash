import { createHash } from "node:crypto";
import { db } from "@pi-dash/db";
import { eventRsvpPoll } from "@pi-dash/db/schema/event-rsvp";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { sendWhatsAppPoll } from "@pi-dash/whatsapp/messaging";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import { uuidv7 } from "uuidv7";
import type { SendSingleRsvpPollPayload } from "../enqueue";

const YES_OPTION = "Yes";
const NO_OPTION = "No";
const DISPLAY_TIMEZONE = "Asia/Kolkata";

function hashPollOption(option: string): string {
  return createHash("sha256").update(option).digest("hex");
}

function buildPollQuestion(eventName: string, startTime: Date): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIMEZONE,
  }).format(startTime);
  return `RSVP for ${eventName} on ${formatted}?`;
}

async function getGroupJid(groupId: string | null): Promise<string | null> {
  if (!groupId) {
    return null;
  }
  const rows = await db
    .select({ jid: whatsappGroup.jid })
    .from(whatsappGroup)
    .where(eq(whatsappGroup.id, groupId))
    .limit(1);
  return rows[0]?.jid ?? null;
}

export async function handleSendSingleRsvpPoll(
  jobs: Job<SendSingleRsvpPollPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "send-single-rsvp-poll",
    });
    const { eventId } = job.data;
    log.set({ jobId: job.id, eventId });

    // Check idempotency
    const existingPoll = await db
      .select({ id: eventRsvpPoll.id })
      .from(eventRsvpPoll)
      .where(eq(eventRsvpPoll.eventId, eventId))
      .limit(1);

    if (existingPoll.length > 0) {
      log.set({ event: "poll_already_exists" });
      log.emit();
      continue;
    }

    // Fetch event + team data
    const events = await db
      .select({
        name: teamEvent.name,
        startTime: teamEvent.startTime,
        cancelledAt: teamEvent.cancelledAt,
        eventWhatsappGroupId: teamEvent.whatsappGroupId,
        teamWhatsappGroupId: team.whatsappGroupId,
      })
      .from(teamEvent)
      .innerJoin(team, eq(team.id, teamEvent.teamId))
      .where(eq(teamEvent.id, eventId))
      .limit(1);

    const event = events[0];
    if (!event) {
      log.set({ event: "event_not_found" });
      log.emit();
      continue;
    }

    if (event.cancelledAt) {
      log.set({ event: "event_cancelled" });
      log.emit();
      continue;
    }

    const eventGroupJid = await getGroupJid(event.eventWhatsappGroupId);
    const teamGroupJid = await getGroupJid(event.teamWhatsappGroupId);
    const targetChatJid = eventGroupJid ?? teamGroupJid;
    const targetChatSource = eventGroupJid ? "event_group" : "team_group";

    if (!targetChatJid) {
      log.set({
        event: "missing_target_group",
        eventWhatsappGroupId: event.eventWhatsappGroupId,
        teamWhatsappGroupId: event.teamWhatsappGroupId,
      });
      log.emit();
      continue;
    }

    const question = buildPollQuestion(event.name, event.startTime);
    const pollId = uuidv7();
    const tempMessageId = uuidv7();

    // Insert pending poll record before sending
    await db.insert(eventRsvpPoll).values({
      id: pollId,
      eventId,
      targetChatJid,
      targetChatSource,
      messageId: tempMessageId,
      question,
      yesOptionHash: hashPollOption(YES_OPTION),
      noOptionHash: hashPollOption(NO_OPTION),
      sentAt: new Date(),
      closedAt: null,
    });

    // Recheck cancelledAt after insert to close the race window:
    // if cancel happened between the first check and now, the close-on-cancel
    // job will find this pending record and close it. We also bail here.
    const recheck = await db
      .select({ cancelledAt: teamEvent.cancelledAt })
      .from(teamEvent)
      .where(eq(teamEvent.id, eventId))
      .limit(1);

    if (recheck[0]?.cancelledAt) {
      await db.delete(eventRsvpPoll).where(eq(eventRsvpPoll.id, pollId));
      log.set({ event: "event_cancelled_after_insert" });
      log.emit();
      continue;
    }

    let messageId: string;
    try {
      messageId = await sendWhatsAppPoll(targetChatJid, question, [
        YES_OPTION,
        NO_OPTION,
      ]);
    } catch (error) {
      // Send failed — remove pending record so retry can try again
      await db.delete(eventRsvpPoll).where(eq(eventRsvpPoll.id, pollId));
      throw error;
    }

    // Update with real messageId
    await db
      .update(eventRsvpPoll)
      .set({ messageId })
      .where(eq(eventRsvpPoll.id, pollId));

    log.set({ event: "poll_sent", messageId, targetChatJid });
    log.emit();
  }
}
