import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
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

interface UnregisteredGroup {
  groupName: string;
  phones: string[];
}

interface WhatsAppScanResultsOptions {
  deactivatedUsers: Array<{ name: string; phone: string }>;
  reactivatedUsers: Array<{ name: string; phone: string }>;
  scannedGroups: string[];
  unregisteredByGroup: UnregisteredGroup[];
  userIds: string[];
}

export async function notifyWhatsAppScanResults({
  userIds,
  deactivatedUsers,
  reactivatedUsers,
  unregisteredByGroup,
  scannedGroups,
}: WhatsAppScanResultsOptions): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "notifyWhatsAppScanResults",
  });
  const totalUnregistered = unregisteredByGroup.reduce(
    (sum, g) => sum + g.phones.length,
    0
  );
  log.set({
    recipientCount: userIds.length,
    deactivatedCount: deactivatedUsers.length,
    reactivatedCount: reactivatedUsers.length,
    unregisteredCount: totalUnregistered,
    scannedGroups,
  });

  if (userIds.length === 0) {
    log.set({ event: "no_recipients" });
    log.emit();
    return;
  }
  if (
    deactivatedUsers.length === 0 &&
    reactivatedUsers.length === 0 &&
    totalUnregistered === 0
  ) {
    log.set({ event: "no_changes" });
    log.emit();
    return;
  }

  const groupList = scannedGroups.join(", ");
  const parts: string[] = [`Scanned groups: ${groupList}`];

  if (deactivatedUsers.length > 0) {
    parts.push(
      `Auto-deactivated ${deactivatedUsers.length} user(s) not found in any scanned group:\n${deactivatedUsers.map((u) => `  - ${u.name} (${u.phone})`).join("\n")}`
    );
  }

  if (reactivatedUsers.length > 0) {
    parts.push(
      `Auto-reactivated ${reactivatedUsers.length} user(s) found in scanned groups:\n${reactivatedUsers.map((u) => `  - ${u.name} (${u.phone})`).join("\n")}`
    );
  }

  for (const group of unregisteredByGroup) {
    parts.push(
      `${group.phones.length} unregistered phone(s) in "${group.groupName}":\n${group.phones.map((p) => `  - ${p}`).join("\n")}`
    );
  }

  const body = parts.join("\n\n");
  const dateKey = new Date().toISOString().slice(0, 10);

  // Short summary for in-app inbox
  const summaryParts: string[] = [];
  if (deactivatedUsers.length > 0) {
    summaryParts.push(`${deactivatedUsers.length} deactivated`);
  }
  if (reactivatedUsers.length > 0) {
    summaryParts.push(`${reactivatedUsers.length} reactivated`);
  }
  if (totalUnregistered > 0) {
    summaryParts.push(`${totalUnregistered} unregistered`);
  }
  const inboxBody = `${groupList}: ${summaryParts.join(", ")}`;

  const emailHtml = await renderNotificationEmail({
    heading: "WhatsApp Group Scan Results",
    paragraphs: parts,
    ctaUrl: `${env.APP_URL}/users`,
    ctaLabel: "Manage Users",
  });

  await sendBulkMessage({
    userIds,
    title: "WhatsApp Group Scan Results",
    body,
    emailHtml,
    clickAction: "/users",
    idempotencyKey: `whatsapp-scan-${dateKey}-${Date.now()}`,
    inboxBody,
    topic: TOPICS.ACCOUNT,
  });

  log.set({ event: "notification_sent" });
  log.emit();
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
