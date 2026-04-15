import { db } from "@pi-dash/db";
import { teamMember } from "@pi-dash/db/schema/team";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { eq } from "drizzle-orm";
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
  teamWhatsappGroupId: string | null;
  updatedAt: number;
}

export async function notifyEventUpdatePosted({
  eventId,
  eventName,
  eventMemberIds,
  authorName,
  eventWhatsappGroupId,
  teamWhatsappGroupId,
  updatedAt,
}: EventUpdatePostedOptions): Promise<void> {
  const body = `${authorName} posted an update on ${eventName} — check it out.`;
  const emailHtml = await renderNotificationEmail({
    heading: "New update",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Read update",
  });
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "📝 New update",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-posted-${eventId}-${updatedAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
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
        `*📝 New update on ${eventName}*`,
        `${authorName} posted an update — check it out.`,
        `\nView: ${env.APP_URL}/events/${eventId}`,
      ];
      await sendWhatsAppGroupMessage(group[0].jid, lines.join("\n"));
    }
  }
}

interface EventUpdateApprovedOptions {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
}

export async function notifyEventUpdateApproved({
  eventUpdateId,
  eventId,
  eventName,
  authorId,
}: EventUpdateApprovedOptions): Promise<void> {
  const body = `Your update to ${eventName} is now live!`;
  const emailHtml = await renderNotificationEmail({
    heading: "Update live!",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: authorId,
    title: "✅ Update live!",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-approved-${eventUpdateId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

interface EventUpdateRejectedOptions {
  authorId: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
}

export async function notifyEventUpdateRejected({
  eventUpdateId,
  eventId,
  eventName,
  authorId,
}: EventUpdateRejectedOptions): Promise<void> {
  const body = `Your update to ${eventName} wasn't published.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Update not published",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: authorId,
    title: "📝 Update not published",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-rejected-${eventUpdateId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

interface EventUpdatePendingOptions {
  authorName: string;
  eventId: string;
  eventName: string;
  eventUpdateId: string;
  teamId: string;
}

export async function notifyEventUpdatePending({
  eventUpdateId,
  eventId,
  eventName,
  authorName,
  teamId,
}: EventUpdatePendingOptions): Promise<void> {
  const body = `${authorName} submitted an update to ${eventName} — it needs your review.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Update needs review",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Review update",
  });

  // Find team leads + users with event_updates.approve permission
  const { eq, and } = await import("drizzle-orm");
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
    log.set({ event: "no_approvers", eventId, teamId, eventUpdateId });
    log.warn("No approvers found for pending event update");
    log.emit();
    return;
  }

  await sendBulkMessage({
    userIds: allUserIds,
    title: "👀 Update needs review",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-pending-${eventUpdateId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}
