import { db } from "@pi-dash/db";
import { team as teamTable } from "@pi-dash/db/schema/team";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { formatEventWhen } from "../event-time";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

/** " on Sat, 18 Oct, 10:00 am at Cubbon Park", to follow an event name. */
function formatEventDetails(
  startTime: number,
  location?: string | null
): string {
  const parts = [` on ${formatEventWhen(startTime)}`];
  if (location) {
    parts.push(` at ${location}`);
  }
  return parts.join("");
}

/** "on Sat, 18 Oct, 10:00 am at Cubbon Park", for a WhatsApp template. */
function eventTemplateDetails(
  startTime: number,
  location?: string | null
): string {
  return formatEventDetails(startTime, location).trim();
}

/** "Fri, 17 Oct, 6:00 pm · Community hall", for a digest row. */
function eventWhenWhere(startTime: number, location?: string | null): string {
  const date = formatEventWhen(startTime);
  return location ? `${date} · ${location}` : date;
}

interface AddedToEventOptions {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
  userId: string;
}

interface UsersAddedToEventOptions {
  eventId: string;
  eventName: string;
  location: string | null;
  startTime: number;
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
  /** A series that ended: only its upcoming sessions were cancelled. */
  seriesEnded?: boolean;
  teamId: string;
}

export async function notifyAddedToEvent({
  userId,
  eventName,
  startTime,
  location,
  eventId,
}: AddedToEventOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "You're in!",
    paragraphs: [
      `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    ],
  });
  await sendMessage({
    body: `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: eventWhenWhere(startTime, location),
      name: eventName,
      status: { label: "Added", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `event-member-added-${eventId}-${userId}`,
    title: "✅ You're in!",
    to: userId,
    topic: TOPICS.EVENTS_SCHEDULE,
    whatsappTemplate: whatsappTemplate(
      "event_added",
      { details: eventTemplateDetails(startTime, location), event: eventName },
      `/events/${eventId}`
    ),
  });
}

export async function notifyUsersAddedToEvent({
  userIds,
  eventName,
  startTime,
  location,
  eventId,
}: UsersAddedToEventOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "You're in!",
    paragraphs: [
      `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    ],
  });
  await sendBulkMessage({
    body: `You've been added to ${eventName}${formatEventDetails(startTime, location)} — see you there!`,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: eventWhenWhere(startTime, location),
      name: eventName,
      status: { label: "Added", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `event-members-added-${eventId}-${[...userIds].sort((a, b) => a.localeCompare(b)).join(",")}`,
    title: "✅ You're in!",
    topic: TOPICS.EVENTS_SCHEDULE,
    userIds,
    whatsappTemplate: whatsappTemplate(
      "event_added",
      { details: eventTemplateDetails(startTime, location), event: eventName },
      `/events/${eventId}`
    ),
  });
}

export async function notifyRemovedFromEvent({
  userId,
  eventName,
  teamId,
  eventId,
}: RemovedFromEventOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading: "Event update",
    paragraphs: [`You've been removed from ${eventName}.`],
  });
  await sendMessage({
    body: `You've been removed from ${eventName}.`,
    clickAction: `/teams/${teamId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "You've been removed",
      name: eventName,
      status: { label: "Removed", tone: "neutral" },
    },
    emailHtml,
    idempotencyKey: `event-member-removed-${eventId}-${userId}`,
    title: "📅 Event update",
    to: userId,
    topic: TOPICS.EVENTS_SCHEDULE,
    whatsappTemplate: whatsappTemplate(
      "event_removed",
      { event: eventName },
      `/teams/${teamId}`
    ),
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
    ctaLabel: "Check it out",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading: "New event!",
    paragraphs: [
      `${eventName} is happening${formatEventDetails(startTime, location)} — mark your calendar!`,
    ],
  });
  await sendBulkMessage({
    body: `${eventName} is happening${formatEventDetails(startTime, location)} — mark your calendar!`,
    clickAction: `/teams/${teamId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: eventWhenWhere(startTime, location),
      name: eventName,
      status: { label: "New", tone: "info" },
    },
    emailHtml,
    idempotencyKey: `event-created-${eventId}`,
    skipWhatsApp: true,
    title: "🗓️ New event!",
    topic: TOPICS.EVENTS_SCHEDULE,
    userIds: teamMemberIds,
    whatsappTemplate: whatsappTemplate(
      "event_created",
      { details: eventTemplateDetails(startTime, location), event: eventName },
      `/teams/${teamId}`
    ),
  });

  const [row] = await db
    .select({ groupId: teamTable.whatsappGroupId })
    .from(teamTable)
    .where(eq(teamTable.id, teamId))
    .limit(1);
  const waGroupId = row?.groupId;
  if (!waGroupId) {
    const log = createRequestLogger();
    log.set({
      event: "no_whatsapp_group",
      eventId,
      handler: "notifyEventCreated",
      teamId,
    });
    log.warn("Team has no WhatsApp group configured — skipping group message");
    log.emit();
    return;
  }

  const [group] = await db
    .select({ jid: whatsappGroup.jid })
    .from(whatsappGroup)
    .where(eq(whatsappGroup.id, waGroupId))
    .limit(1);
  if (group) {
    const lines = [
      "*🗓️ New event!*",
      `${eventName} is happening${formatEventDetails(startTime, location)} — mark your calendar!`,
    ];
    if (env.APP_URL) {
      lines.push(`\nView: ${env.APP_URL}/teams/${teamId}`);
    }
    await sendWhatsAppGroupMessage(group.jid, lines.join("\n"));
  }
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
    ctaLabel: "See what changed",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading: "Event update",
    paragraphs: [bodyText],
  });
  await sendBulkMessage({
    body: bodyText,
    clickAction: `/teams/${teamId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: eventWhenWhere(startTime, location),
      name: eventName,
      status: { label: "Updated", tone: "info" },
    },
    emailHtml,
    idempotencyKey: `event-updated-${eventId}-${updatedAt}`,
    // A changed time or place matters to people already on their way.
    immediate: true,
    title: "📅 Event update",
    topic: TOPICS.EVENTS_SCHEDULE,
    userIds: eventMemberIds,
    whatsappTemplate: whatsappTemplate(
      "event_schedule_changed",
      { details: eventTemplateDetails(startTime, location), event: eventName },
      `/teams/${teamId}`
    ),
  });
}

export async function notifyEventCancelled({
  eventMemberIds,
  eventName,
  teamId,
  eventId,
  cancelledAt,
  seriesEnded,
}: EventCancelledOptions): Promise<void> {
  const heading = seriesEnded
    ? "Upcoming sessions cancelled"
    : "Event cancelled";
  const body = seriesEnded
    ? `The upcoming sessions of ${eventName} have been cancelled.`
    : `${eventName} has been cancelled.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/teams/${teamId}`,
    heading,
    paragraphs: [body],
  });
  await sendBulkMessage({
    body,
    clickAction: `/teams/${teamId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      name: eventName,
      status: { label: "Cancelled", tone: "danger" },
    },
    emailHtml,
    idempotencyKey: `event-cancelled-${eventId}-${cancelledAt}`,
    immediate: true,
    title: `❌ ${heading}`,
    topic: TOPICS.EVENTS_SCHEDULE,
    userIds: eventMemberIds,
    whatsappTemplate: whatsappTemplate(
      "event_cancelled",
      { event: eventName },
      `/teams/${teamId}`
    ),
  });
}
