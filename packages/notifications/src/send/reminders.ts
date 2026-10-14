import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatReminderInterval } from "@pi-dash/shared/event-reminders";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { createRequestLogger } from "evlog";

import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

/** "1 photo", "3 photos". */
function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

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
    parts.push(countOf(counts.reimbursements, "reimbursement"));
  }
  if (counts.advancePayments > 0) {
    parts.push(countOf(counts.advancePayments, "advance payment"));
  }
  if (counts.vendorPayments > 0) {
    parts.push(countOf(counts.vendorPayments, "vendor payment"));
  }

  const dateKey = new Date().toISOString().slice(0, 10);

  const body = `You've got ${parts.join(", ")} waiting for your review — some have been sitting for 3+ days.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Review now",
    ctaUrl: `${env.APP_URL}/`,
    heading: "Requests need attention",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: "/",
    digest: {
      actionLabel: "Review",
      meta: `${parts.join(", ")} waiting 3+ days`,
      name: "Requests waiting for review",
      status: { label: "Overdue", tone: "warning" },
    },
    emailHtml,
    idempotencyKey: `stale-requests-reminder-${userId}-${dateKey}`,
    title: "⏰ Requests need attention",
    to: userId,
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
    ctaLabel: "Share feedback",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Last chance for feedback",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Share feedback",
      list: { label: "View events", path: "/events" },
      meta: "Feedback closes tomorrow",
      name: eventName,
    },
    emailHtml,
    idempotencyKey: `feedback-deadline-${eventId}-${userId}-${dateKey}`,
    title: "⏰ Last chance for feedback",
    to: userId,
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
    deactivatedCount: deactivatedUsers.length,
    reactivatedCount: reactivatedUsers.length,
    recipientCount: userIds.length,
    scannedGroups,
    unregisteredCount: totalUnregistered,
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
      `Auto-deactivated ${countOf(deactivatedUsers.length, "user")} not found in any scanned group:\n${deactivatedUsers.map((u) => `  - ${u.name} (${u.phone})`).join("\n")}`
    );
  }

  if (reactivatedUsers.length > 0) {
    parts.push(
      `Auto-reactivated ${countOf(reactivatedUsers.length, "user")} found in scanned groups:\n${reactivatedUsers.map((u) => `  - ${u.name} (${u.phone})`).join("\n")}`
    );
  }

  for (const group of unregisteredByGroup) {
    parts.push(
      `${countOf(group.phones.length, "unregistered phone")} in "${group.groupName}":\n${group.phones.map((p) => `  - ${p}`).join("\n")}`
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
    ctaLabel: "Manage users",
    ctaUrl: `${env.APP_URL}/users`,
    heading: "WhatsApp scan results",
    paragraphs: parts,
  });

  await sendBulkMessage({
    body,
    clickAction: "/users",
    emailHtml,
    idempotencyKey: `whatsapp-scan-${dateKey}`,
    inboxBody,
    title: "📊 WhatsApp scan results",
    topic: TOPICS.ACCOUNT,
    userIds,
  });

  log.set({ event: "notification_sent" });
  log.emit();
}

interface R2CleanupResultsOptions {
  deletedKeys: string[];
  failedKeys: string[];
  orphanCount: number;
  r2ObjectCount: number;
  userIds: string[];
}

export async function notifyR2CleanupResults({
  userIds,
  r2ObjectCount,
  orphanCount,
  deletedKeys,
  failedKeys,
}: R2CleanupResultsOptions): Promise<void> {
  if (userIds.length === 0 || orphanCount === 0) {
    return;
  }

  const dateKey = new Date().toISOString().slice(0, 10);

  const parts: string[] = [
    `Scanned ${r2ObjectCount} R2 objects. Found ${orphanCount} orphaned files. Deleted ${deletedKeys.length}.`,
  ];

  if (deletedKeys.length > 0) {
    parts.push(
      `Deleted files:\n${deletedKeys.map((k) => `  - ${k}`).join("\n")}`
    );
  }

  if (failedKeys.length > 0) {
    parts.push(
      `Failed to delete ${countOf(failedKeys.length, "file")}:\n${failedKeys.map((k) => `  - ${k}`).join("\n")}`
    );
  }

  const body = parts.join("\n\n");

  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View jobs",
    ctaUrl: `${env.APP_URL}/jobs?queue=cleanup-r2-orphans`,
    heading: "R2 cleanup results",
    paragraphs: parts,
  });

  await sendBulkMessage({
    body,
    clickAction: "/jobs?queue=cleanup-r2-orphans",
    emailHtml,
    idempotencyKey: `r2-cleanup-${dateKey}`,
    inboxBody: `${orphanCount} orphaned files found, ${deletedKeys.length} deleted`,
    title: "🗑️ R2 cleanup results",
    topic: TOPICS.ACCOUNT,
    userIds,
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

  const body = `${countOf(pendingCount, "photo")} across ${countOf(eventCount, "event")} ${pendingCount === 1 ? "is" : "are"} waiting for your review.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Review photos",
    ctaUrl: `${env.APP_URL}/events`,
    heading: "Photos need review",
    paragraphs: [body],
  });
  await sendBulkMessage({
    body,
    clickAction: "/events",
    digest: {
      actionLabel: "Review",
      meta: `Across ${countOf(eventCount, "event")}`,
      name: `${countOf(pendingCount, "photo")} waiting for review`,
    },
    emailHtml,
    idempotencyKey: `photo-approval-reminder-${dateKey}`,
    title: "👀 Photos need review",
    topic: TOPICS.EVENTS_PHOTOS,
    userIds,
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
    ctaLabel: "View event",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Coming up!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      list: { label: "View events", path: "/events" },
      meta: `Starts in ${label} · ${when}${location ? ` · ${location}` : ""}`,
      name: eventName,
    },
    emailHtml,
    idempotencyKey: `event-reminder-${eventId}-${intervalMinutes}-${userId}`,
    // "Starts in 30 min" is wrong five minutes later.
    immediate: true,
    title: "⏰ Coming up!",
    to: userId,
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
    ctaLabel: "Share feedback",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "How was it?",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Share feedback",
      list: { label: "View events", path: "/events" },
      meta: "How was it? Share your feedback",
      name: eventName,
    },
    emailHtml,
    idempotencyKey: `feedback-nudge-${eventId}-${userId}`,
    title: "💬 How was it?",
    to: userId,
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
    ctaLabel: "Mark attendance",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Attendance reminder",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Mark attendance",
      list: { label: "View events", path: "/events" },
      meta: "Attendance not marked yet",
      name: eventName,
    },
    emailHtml,
    idempotencyKey: `attendance-reminder-${eventId}-${userId}`,
    title: "📋 Attendance reminder",
    to: userId,
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
    ctaLabel: "Share photos",
    ctaUrl: `${env.APP_URL}/events/${eventId}`,
    heading: "Got pics?",
    paragraphs: [body],
  });
  await sendBulkMessage({
    body,
    clickAction: `/events/${eventId}`,
    digest: {
      actionLabel: "Upload photos",
      list: { label: "View events", path: "/events" },
      meta: "Got photos? Upload them for the team",
      name: eventName,
    },
    emailHtml,
    idempotencyKey: `photo-nudge-${eventId}`,
    title: "📸 Got pics?",
    topic: TOPICS.EVENTS_PHOTOS,
    userIds,
  });
}
