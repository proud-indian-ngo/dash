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

  const body = `You've got ${parts.join(", ")} waiting for your review — some have been sitting for 3+ days.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Requests need attention",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/requests`,
    ctaLabel: "Review now",
  });
  await sendMessage({
    to: userId,
    title: "⏰ Requests need attention",
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

  const body = `Feedback for "${eventName}" closes tomorrow — don't miss your chance to share!`;
  const emailHtml = await renderNotificationEmail({
    heading: "Last chance for feedback",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share feedback",
  });
  await sendMessage({
    to: userId,
    title: "⏰ Last chance for feedback",
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
    heading: "WhatsApp scan results",
    paragraphs: parts,
    ctaUrl: `${env.APP_URL}/users`,
    ctaLabel: "Manage users",
  });

  await sendBulkMessage({
    userIds,
    title: "📊 WhatsApp scan results",
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

  const body = `${pendingCount} photos across ${eventCount} events are waiting for your review.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Photos need review",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events`,
    ctaLabel: "Review photos",
  });
  await sendBulkMessage({
    userIds,
    title: "👀 Photos need review",
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
    heading: "Coming up!",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "View event",
  });
  await sendMessage({
    to: userId,
    title: "⏰ Coming up!",
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
    `*⏰ Heads up: ${eventName}*`,
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
  const body = `How was "${eventName}"? Share your thoughts while it's still fresh!`;
  const emailHtml = await renderNotificationEmail({
    heading: "How was it?",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share feedback",
  });
  await sendMessage({
    to: userId,
    title: "💬 How was it?",
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
  const body = `Attendance for "${eventName}" hasn't been marked yet — could you update it?`;
  const emailHtml = await renderNotificationEmail({
    heading: "Attendance reminder",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Mark attendance",
  });
  await sendMessage({
    to: userId,
    title: "📋 Attendance reminder",
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
    heading: "Got pics?",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    ctaLabel: "Share photos",
  });
  await sendBulkMessage({
    userIds,
    title: "📸 Got pics?",
    body,
    emailHtml,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `photo-nudge-${eventId}`,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
