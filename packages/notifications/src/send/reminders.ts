import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatReminderInterval } from "@pi-dash/shared/event-reminders";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { createRequestLogger } from "evlog";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

const eventTimeFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatEventTime(epochMs: number): string {
  return eventTimeFmt.format(new Date(epochMs));
}

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

// ── Event Reminders ─────────────────────────────────────────────────────────

interface EventReminderOptions {
  eventId: string;
  eventName: string;
  intervalMinutes: number;
  location: string | null;
  startTime: number;
  userId: string;
}

export async function notifyEventReminder({
  userId,
  eventName,
  eventId,
  intervalMinutes,
  location,
  startTime,
}: EventReminderOptions): Promise<void> {
  const label = formatReminderInterval(intervalMinutes);
  const when = formatEventTime(startTime);
  const body = `"${eventName}" starts in ${label} (${when}).${location ? ` Location: ${location}` : ""}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Event Reminder",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View Event",
  });
  await sendMessage({
    to: userId,
    title: "Event Reminder",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-reminder-${eventId}-${intervalMinutes}-${userId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

interface EventReminderGroupOptions {
  eventId: string;
  eventName: string;
  groupJid: string;
  intervalMinutes: number;
  location: string | null;
  startTime: number;
}

export async function notifyEventReminderGroup({
  eventName,
  eventId,
  groupJid,
  intervalMinutes,
  location,
  startTime,
}: EventReminderGroupOptions): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "notifyEventReminderGroup",
  });
  log.set({ eventId, groupJid, intervalMinutes });

  const label = formatReminderInterval(intervalMinutes);
  const when = formatEventTime(startTime);
  const lines = [
    `*Event Reminder: ${eventName}*`,
    `Starting in ${label} (${when})`,
  ];
  if (location) {
    lines.push(`Location: ${location}`);
  }
  lines.push(`\nView: ${env.APP_URL}/events/${eventId}`);

  await sendWhatsAppGroupMessage(groupJid, lines.join("\n"));
  log.set({ event: "group_reminder_sent" });
  log.emit();
}

interface FeedbackNudgeOptions {
  eventId: string;
  eventName: string;
  userId: string;
}

export async function notifyFeedbackNudge({
  userId,
  eventName,
  eventId,
}: FeedbackNudgeOptions): Promise<void> {
  const body = `How was "${eventName}"? Share your feedback while it's still fresh.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Share Your Feedback",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share Feedback",
  });
  await sendMessage({
    to: userId,
    title: "Share Your Feedback",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `feedback-nudge-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_FEEDBACK,
  });
}

interface AttendanceNotMarkedOptions {
  eventId: string;
  eventName: string;
  userId: string;
}

export async function notifyAttendanceNotMarked({
  userId,
  eventName,
  eventId,
}: AttendanceNotMarkedOptions): Promise<void> {
  const body = `Attendance for "${eventName}" hasn't been marked yet. Please update it when you can.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Attendance Not Marked",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Mark Attendance",
  });
  await sendMessage({
    to: userId,
    title: "Attendance Not Marked",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `attendance-reminder-${eventId}-${userId}`,
    topic: TOPICS.EVENTS_SCHEDULE,
  });
}

interface PhotoUploadNudgeOptions {
  eventId: string;
  eventName: string;
  userIds: string[];
}

export async function notifyPhotoUploadNudge({
  userIds,
  eventName,
  eventId,
}: PhotoUploadNudgeOptions): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const body = `Got any photos from "${eventName}"? Upload them so the team can see!`;
  const emailHtml = await renderNotificationEmail({
    heading: "Share Your Photos",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Upload Photos",
  });
  await sendBulkMessage({
    userIds,
    title: "Share Your Photos",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `photo-nudge-${eventId}`,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
