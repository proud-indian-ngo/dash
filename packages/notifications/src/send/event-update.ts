import { db } from "@pi-dash/db";
import { teamMember } from "@pi-dash/db/schema/team";
import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
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
  const body = `${authorName} posted an update to ${eventName}.`;
  const emailHtml = await renderNotificationEmail({
    heading: "New Event Update",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendBulkMessage({
    userIds: eventMemberIds,
    title: "New Event Update",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-posted-${eventId}-${updatedAt}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
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
  const body = `Your update to ${eventName} has been approved.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Update Approved",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: authorId,
    title: "Update Approved",
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
  const body = `Your update to ${eventName} was rejected.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Update Rejected",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: authorId,
    title: "Update Rejected",
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
  const body = `${authorName} submitted an update to ${eventName} that needs approval.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Event Update Pending Approval",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Review Update",
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
    title: "Event Update Pending Approval",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-update-pending-${eventUpdateId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}
