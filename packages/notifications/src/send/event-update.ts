import { db } from "@pi-dash/db";
import { teamMember } from "@pi-dash/db/schema/team";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { eventLabel } from "@pi-dash/shared/event-label";
import { logGowaSend } from "@pi-dash/whatsapp/gowa-log";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";
import { and, eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface EventUpdatePostedOptions {
  authorName: string;
  eventId: string;
  eventMemberIds: string[];
  eventName: string;
  eventWhatsappGroupId: string | null;
  startTime: number;
  teamWhatsappGroupId: string | null;
  updatedAt: number;
}

export async function notifyEventUpdatePosted({
  eventId,
  eventName,
  eventMemberIds,
  authorName,
  eventWhatsappGroupId,
  startTime,
  teamWhatsappGroupId,
  updatedAt,
}: EventUpdatePostedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `${authorName} posted an update on ${label} — check it out.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Read update",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "New update",
    paragraphs: [body],
  });
  await sendBulkMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Read",
      list: { label: "View events", path: "/events" },
      meta: `Update from ${authorName}`,
      name: label,
    },
    emailHtml,
    idempotencyKey: `event-update-posted-${eventId}-${updatedAt}`,
    title: "📝 New update",
    topic: TOPICS.EVENTS_SCHEDULE,
    userIds: eventMemberIds,
    whatsappTemplate: whatsappTemplate(
      "event_update_posted",
      { author: authorName, event: label },
      `/events/${eventId}`
    ),
  });

  // Send to WhatsApp group (event group > team group fallback)
  const waGroupId = eventWhatsappGroupId ?? teamWhatsappGroupId;
  if (waGroupId) {
    const group = await db
      .select({ jid: whatsappGroup.jid })
      .from(whatsappGroup)
      .where(eq(whatsappGroup.id, waGroupId))
      .limit(1);
    if (group[0]) {
      const lines = [
        `*📝 New update on ${label}*`,
        `${authorName} posted an update — check it out.`,
        `\nView: ${env.APP_URL}/events/${eventId}`,
      ];
      const text = lines.join("\n");
      const messageId = await sendWhatsAppGroupMessage(group[0].jid, text);
      await logGowaSend(
        {
          chatJid: group[0].jid,
          eventId,
          kind: "group_post",
          source: "event_update",
          text,
        },
        [messageId]
      );
    }
  }
}

interface EventUpdateApprovedOptions {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  startTime: number;
}

export async function notifyEventUpdateApproved({
  eventUpdateId,
  eventId,
  eventName,
  authorId,
  startTime,
}: EventUpdateApprovedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `Your update to ${label} is now live!`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Update live!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "Your update is live",
      name: label,
      status: { label: "Live", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `event-update-approved-${eventUpdateId}`,
    title: "✅ Update live!",
    to: authorId,
    topic: TOPICS.EVENTS_SCHEDULE,
    whatsappTemplate: whatsappTemplate(
      "event_post_approved",
      { event: label },
      `/events/${eventId}`
    ),
  });
}

interface EventUpdateRejectedOptions {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  startTime: number;
}

export async function notifyEventUpdateRejected({
  eventUpdateId,
  eventId,
  eventName,
  authorId,
  startTime,
}: EventUpdateRejectedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `Your update to ${label} wasn't published.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Update not published",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: "Your update wasn't published",
      name: label,
      status: { label: "Not published", tone: "neutral" },
    },
    emailHtml,
    idempotencyKey: `event-update-rejected-${eventUpdateId}`,
    title: "📝 Update not published",
    to: authorId,
    topic: TOPICS.EVENTS_SCHEDULE,
    whatsappTemplate: whatsappTemplate(
      "event_post_not_approved",
      { event: label },
      `/events/${eventId}`
    ),
  });
}

interface EventUpdatePendingOptions {
  authorName: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  startTime: number;
  teamId: string;
}

export async function notifyEventUpdatePending({
  eventUpdateId,
  eventId,
  eventName,
  authorName,
  startTime,
  teamId,
}: EventUpdatePendingOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `${authorName} submitted an update to ${label} — it needs your review.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Review update",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Update needs review",
    paragraphs: [body],
  });

  // Find team leads + users with event_updates.approve permission
  const leadUserIds = await db
    .selectDistinct({ userId: teamMember.userId })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.role, "lead")));
  const adminUserIds = await getUserIdsWithPermission("event_updates.approve");
  const allUserIds = [
    ...new Set([...leadUserIds.map((l) => l.userId), ...adminUserIds]),
  ];

  if (allUserIds.length === 0) {
    const log = createRequestLogger({
      method: "NOTIFY",
      path: "event-update-pending",
    });
    log.set({ event: "no_approvers", eventId, eventUpdateId, teamId });
    log.warn("No approvers found for pending event update");
    log.emit();
    return;
  }

  await sendBulkMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Review",
      list: { label: "View events", path: "/events" },
      meta: `Update from ${authorName}`,
      name: label,
      status: { label: "Needs review", tone: "warning" },
    },
    emailHtml,
    idempotencyKey: `event-update-pending-${eventUpdateId}`,
    title: "👀 Update needs review",
    topic: TOPICS.EVENTS_SCHEDULE,
    userIds: allUserIds,
    whatsappTemplate: whatsappTemplate(
      "event_post_needs_approval",
      { author: authorName, event: label },
      `/events/${eventId}`
    ),
  });
}
