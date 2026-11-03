import { type EmailList, renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { eventLabel } from "@pi-dash/shared/event-label";
import { formatReminderInterval } from "@pi-dash/shared/event-reminders";
import { isCloudApiEnabled } from "@pi-dash/whatsapp/cloud";
import { logGowaSend } from "@pi-dash/whatsapp/gowa-log";
import { sendWhatsAppGroupMessage } from "@pi-dash/whatsapp/messaging";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";
import { createRequestLogger } from "evlog";

import { formatEventWhen } from "../event-time";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

/** "1 photo", "3 photos". */
function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** A report's plain text, for the inbox and WhatsApp. */
function reportText(summary: string, lists: EmailList[]): string {
  return [
    summary,
    ...lists.map(
      (list) =>
        `${list.title}:\n${list.items.map((item) => `  - ${item}`).join("\n")}`
    ),
  ].join("\n\n");
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
  /** Where the email and inbox link open; the dashboard by default. */
  path?: string;
  counts: {
    advancePayments: number;
    reimbursements: number;
    /** Vendor invoices (or no-invoice reasons) awaiting approval. */
    vendorInvoices: number;
    vendorPayments: number;
    /** Approved vendor payments not yet fully paid. */
    vendorPaymentsToPay: number;
  };
  userId: string;
}

interface FeedbackDeadlineOptions {
  eventId: string;
  eventName: string;
  userId: string;
  startTime: number;
}

interface PhotoApprovalReminderOptions {
  eventCount: number;
  pendingCount: number;
  userIds: string[];
}

export async function notifyStaleRequests({
  userId,
  counts,
  path = "/",
}: StaleRequestsOptions): Promise<void> {
  const total =
    counts.reimbursements +
    counts.advancePayments +
    counts.vendorPayments +
    counts.vendorPaymentsToPay +
    counts.vendorInvoices;
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
  if (counts.vendorPaymentsToPay > 0) {
    parts.push(
      `${countOf(counts.vendorPaymentsToPay, "approved vendor payment")} to pay`
    );
  }
  if (counts.vendorInvoices > 0) {
    parts.push(countOf(counts.vendorInvoices, "vendor invoice"));
  }

  const dateKey = new Date().toISOString().slice(0, 10);

  const body = `You've got ${parts.join(", ")} waiting on you — some have been sitting for 3+ days.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Review now",
    ctaUrl: `${env.APP_URL}${path}`,
    heading: "Requests need attention",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: path,
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
    whatsappTemplate: whatsappTemplate("requests_awaiting_approval", {
      waiting: parts.join(", "),
    }),
  });
}

export async function notifyFeedbackDeadline({
  userId,
  eventName,
  startTime,
  eventId,
}: FeedbackDeadlineOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const dateKey = new Date().toISOString().slice(0, 10);

  const body = `Feedback for ${label} closes tomorrow — don't miss your chance to share!`;
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
      name: label,
    },
    emailHtml,
    idempotencyKey: `feedback-deadline-${eventId}-${userId}-${dateKey}`,
    title: "⏰ Last chance for feedback",
    to: userId,
    topic: TOPICS.EVENTS_FEEDBACK,
    whatsappTemplate: whatsappTemplate(
      "feedback_closing",
      { event: label },
      `/events/${eventId}`
    ),
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
  const summary = `Scanned groups: ${groupList}`;
  const lists: EmailList[] = [];

  if (deactivatedUsers.length > 0) {
    lists.push({
      items: deactivatedUsers.map((u) => `${u.name} (${u.phone})`),
      title: `Auto-deactivated ${countOf(deactivatedUsers.length, "user")} not found in any scanned group`,
    });
  }

  if (reactivatedUsers.length > 0) {
    lists.push({
      items: reactivatedUsers.map((u) => `${u.name} (${u.phone})`),
      title: `Auto-reactivated ${countOf(reactivatedUsers.length, "user")} found in scanned groups`,
    });
  }

  for (const group of unregisteredByGroup) {
    lists.push({
      items: group.phones,
      title: `${countOf(group.phones.length, "unregistered phone")} in "${group.groupName}"`,
    });
  }

  const body = reportText(summary, lists);
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
    lists,
    paragraphs: [summary],
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
    // An ops report for admins with no WhatsApp template: GoWA deployments
    // still get it on WhatsApp as text; on the Cloud API it's inbox and email.
    skipWhatsApp: isCloudApiEnabled(),
    whatsappTemplate: null,
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

  const summary = `Scanned ${r2ObjectCount} R2 objects. Found ${orphanCount} orphaned files. Deleted ${deletedKeys.length}.`;
  const lists: EmailList[] = [];

  // Failures need action, so they come first.
  if (failedKeys.length > 0) {
    lists.push({
      items: failedKeys,
      title: `Failed to delete ${countOf(failedKeys.length, "file")}`,
    });
  }

  if (deletedKeys.length > 0) {
    lists.push({
      items: deletedKeys,
      title: `Deleted ${countOf(deletedKeys.length, "file")}`,
    });
  }

  const body = reportText(summary, lists);

  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View jobs",
    ctaUrl: `${env.APP_URL}/jobs?queue=cleanup-r2-orphans`,
    heading: "R2 cleanup results",
    lists,
    paragraphs: [summary],
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
    // An ops report for admins with no WhatsApp template: GoWA deployments
    // still get it on WhatsApp as text; on the Cloud API it's inbox and email.
    skipWhatsApp: isCloudApiEnabled(),
    whatsappTemplate: null,
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
    whatsappTemplate: whatsappTemplate(
      "photos_need_approval",
      {
        events: countOf(eventCount, "event"),
        photos: countOf(pendingCount, "photo"),
      },
      "/events"
    ),
  });
}

// ── Event Reminders ─────────────────────────────────────────────────────────

interface EventReminderOptions {
  eventId: string;
  eventName: string;
  instanceDate?: string | null;
  intervalMinutes: number;
  location: string | null;
  startTime: number;
  userId: string;
}

export async function notifyEventReminder({
  userId,
  eventName,
  eventId,
  instanceDate,
  intervalMinutes,
  location,
  startTime,
}: EventReminderOptions): Promise<void> {
  const label = formatReminderInterval(intervalMinutes);
  // "Sat, 18 Oct, 10:00 am", as in the other event messages.
  const when = formatEventWhen(startTime);
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
    idempotencyKey: `event-reminder-${eventId}${instanceDate ? `-${instanceDate}` : ""}-${intervalMinutes}-${userId}`,
    // "Starts in 30 min" is wrong five minutes later.
    immediate: true,
    title: "⏰ Coming up!",
    to: userId,
    topic: TOPICS.EVENTS_SCHEDULE,
    whatsappTemplate: whatsappTemplate(
      "event_reminder",
      {
        details: `on ${when}${location ? ` at ${location}` : ""}`,
        event: eventName,
        starts_in: label,
      },
      `/events/${eventId}`
    ),
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

  const text = lines.join("\n");
  const messageId = await sendWhatsAppGroupMessage(groupJid, text);
  await logGowaSend(
    {
      chatJid: groupJid,
      eventId,
      kind: "group_post",
      source: "event_reminder",
      text,
    },
    [messageId]
  );
  log.set({ event: "group_reminder_sent" });
  log.emit();
}

interface FeedbackNudgeOptions {
  eventId: string;
  eventName: string;
  userId: string;
  startTime: number;
}

export async function notifyFeedbackNudge({
  userId,
  eventName,
  startTime,
  eventId,
}: FeedbackNudgeOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `How was ${label}? Share your thoughts while it's still fresh!`;
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
      name: label,
    },
    emailHtml,
    idempotencyKey: `feedback-nudge-${eventId}-${userId}`,
    title: "💬 How was it?",
    to: userId,
    topic: TOPICS.EVENTS_FEEDBACK,
    whatsappTemplate: whatsappTemplate(
      "feedback_open",
      { event: label },
      `/events/${eventId}`
    ),
  });
}

interface AttendanceNotMarkedOptions {
  eventId: string;
  eventName: string;
  userId: string;
  startTime: number;
}

export async function notifyAttendanceNotMarked({
  userId,
  eventName,
  startTime,
  eventId,
}: AttendanceNotMarkedOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  const body = `Attendance for ${label} hasn't been marked yet — could you update it?`;
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
      name: label,
    },
    emailHtml,
    idempotencyKey: `attendance-reminder-${eventId}-${userId}`,
    title: "📋 Attendance reminder",
    to: userId,
    topic: TOPICS.EVENTS_SCHEDULE,
    whatsappTemplate: whatsappTemplate(
      "event_attendance_reminder",
      { event: label },
      `/events/${eventId}`
    ),
  });
}

interface PhotoUploadNudgeOptions {
  eventId: string;
  eventName: string;
  userIds: string[];
  startTime: number;
}

export async function notifyPhotoUploadNudge({
  userIds,
  eventName,
  startTime,
  eventId,
}: PhotoUploadNudgeOptions): Promise<void> {
  const label = eventLabel(eventName, startTime);
  if (userIds.length === 0) {
    return;
  }
  const body = `Got any photos from ${label}? Upload them so the team can see!`;
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
      name: label,
    },
    emailHtml,
    idempotencyKey: `photo-nudge-${eventId}`,
    title: "📸 Got pics?",
    topic: TOPICS.EVENTS_PHOTOS,
    userIds,
    whatsappTemplate: whatsappTemplate(
      "photos_upload_request",
      { event: label },
      `/events/${eventId}`
    ),
  });
}
