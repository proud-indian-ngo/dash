import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface StaleRequestsOptions {
  counts: {
    advancePayments: number;
    reimbursements: number;
    vendorPayments: number;
  };
  userId: string;
}

interface FeedbackDeadlineOptions {
  eventId: string;
  eventName: string;
  userId: string;
}

interface PhotoApprovalReminderOptions {
  eventCount: number;
  pendingCount: number;
  userIds: string[];
}

export async function notifyStaleRequests({
  userId,
  counts,
}: StaleRequestsOptions): Promise<void> {
  const total =
    counts.reimbursements + counts.advancePayments + counts.vendorPayments;
  if (total === 0) {
    return;
  }

  const parts: string[] = [];
  if (counts.reimbursements > 0) {
    parts.push(`${counts.reimbursements} reimbursement(s)`);
  }
  if (counts.advancePayments > 0) {
    parts.push(`${counts.advancePayments} advance payment(s)`);
  }
  if (counts.vendorPayments > 0) {
    parts.push(`${counts.vendorPayments} vendor payment(s)`);
  }

  const dateKey = new Date().toISOString().slice(0, 10);

  const body = `You have ${parts.join(", ")} pending review for more than 3 days.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Pending Requests Reminder",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/requests`,
    ctaLabel: "View Requests",
  });
  await sendMessage({
    to: userId,
    title: "Pending Requests Reminder",
    body,
    emailHtml,
    clickAction: "/requests",
    idempotencyKey: `stale-requests-reminder-${userId}-${dateKey}`,
    topic: TOPICS.REQUESTS_SUBMISSIONS,
  });
}

export async function notifyFeedbackDeadline({
  userId,
  eventName,
  eventId,
}: FeedbackDeadlineOptions): Promise<void> {
  const dateKey = new Date().toISOString().slice(0, 10);

  const body = `Feedback for "${eventName}" closes tomorrow. Share your thoughts before the deadline.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Feedback Deadline Tomorrow",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share Feedback",
  });
  await sendMessage({
    to: userId,
    title: "Feedback Deadline Tomorrow",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `feedback-deadline-${eventId}-${dateKey}`,
    topic: TOPICS.EVENTS_FEEDBACK,
  });
}

export async function notifyPhotoApprovalReminder({
  userIds,
  pendingCount,
  eventCount,
}: PhotoApprovalReminderOptions): Promise<void> {
  if (userIds.length === 0 || pendingCount === 0) {
    return;
  }

  const dateKey = new Date().toISOString().slice(0, 10);

  const body = `${pendingCount} photo(s) across ${eventCount} event(s) need your review.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Photos Pending Review",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events`,
    ctaLabel: "Review Photos",
  });
  await sendBulkMessage({
    userIds,
    title: "Photos Pending Review",
    body,
    emailHtml,
    clickAction: "/events",
    idempotencyKey: `photo-approval-reminder-${dateKey}`,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
