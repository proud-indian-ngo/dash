import type { StatusTone } from "@/components/shared/status-badge";

/**
 * How one notification fared for one person on each channel. The statuses
 * are computed in SQL (`lib/server/notification-delivery.ts`), so filters,
 * paging and the total all run in Postgres; this module holds what the page
 * shows for them. Times are epoch milliseconds.
 */

export const INBOX_STATUSES = [
  "unread",
  "read",
  "archived",
  "off",
  "none",
] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const WHATSAPP_STATUSES = [
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "held",
  "summary",
  "skipped_read",
  "gave_up",
  "no_whatsapp",
  "off",
  "not_sent",
] as const;
export type WhatsAppDeliveryStatus = (typeof WHATSAPP_STATUSES)[number];

export const EMAIL_STATUSES = [
  "sent",
  "delayed",
  "delivered",
  "complained",
  "bounced",
  "failed",
  "suppressed",
  "held",
  "summary",
  "not_tracked",
  "skipped_read",
  "gave_up",
  "not_sent",
  "none",
] as const;
export type EmailDeliveryStatus = (typeof EMAIL_STATUSES)[number];

/** One recipient and channel of a batched message. */
export interface HeldFacts {
  attempts: number;
  batchId: string | null;
  /** Messages sent under the same batch id, this one included. */
  batchSize: number;
  claimedAt: number | null;
  createdAt: number;
  sentAt: number | null;
}

/** A row of the WhatsApp Cloud API send log. */
export interface WhatsAppLogFacts {
  createdAt: number;
  error: string | null;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  template: string;
  updatedAt: number;
}

/** A row of the email delivery log. */
export interface EmailLogFacts {
  createdAt: number;
  error: string | null;
  status:
    | "sent"
    | "delayed"
    | "delivered"
    | "complained"
    | "bounced"
    | "failed"
    | "suppressed";
  updatedAt: number;
}

/** The label of a channel that doesn't apply to the message. */
export const NO_STATUS = "\u2014";

interface StatusDisplay {
  label: string;
  tone: StatusTone;
}

export const INBOX_STATUS: Record<InboxStatus, StatusDisplay> = {
  archived: { label: "Archived", tone: "neutral" },
  none: { label: NO_STATUS, tone: "neutral" },
  off: { label: "Inbox off", tone: "neutral" },
  read: { label: "Read", tone: "success" },
  unread: { label: "Unread", tone: "info" },
};

export const WHATSAPP_STATUS: Record<WhatsAppDeliveryStatus, StatusDisplay> = {
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  gave_up: { label: "Gave up", tone: "danger" },
  held: { label: "Held", tone: "warning" },
  no_whatsapp: { label: "No WhatsApp", tone: "neutral" },
  not_sent: { label: "Not sent", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
  read: { label: "Read", tone: "success" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "info" },
  skipped_read: { label: "Skipped: read in inbox", tone: "neutral" },
  summary: { label: "Sent in summary", tone: "info" },
};

export const EMAIL_STATUS: Record<EmailDeliveryStatus, StatusDisplay> = {
  bounced: { label: "Bounced", tone: "danger" },
  complained: { label: "Complained", tone: "danger" },
  delayed: { label: "Delayed", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  gave_up: { label: "Gave up", tone: "danger" },
  held: { label: "Held", tone: "warning" },
  none: { label: NO_STATUS, tone: "neutral" },
  not_sent: { label: "Not sent", tone: "neutral" },
  not_tracked: { label: "Not tracked", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  skipped_read: { label: "Skipped: read in inbox", tone: "neutral" },
  summary: { label: "Sent in summary", tone: "info" },
  suppressed: { label: "Suppressed", tone: "danger" },
};

export function statusOptions(
  statuses: Record<string, StatusDisplay>
): { label: string; value: string }[] {
  return Object.entries(statuses).map(([value, { label }]) => ({
    label: value === "none" ? "None" : label,
    value,
  }));
}

/** One person's copy of one notification, as the page lists it. */
export interface DeliveryRow {
  createdAt: number;
  email: EmailDeliveryStatus;
  emailHeld: HeldFacts | null;
  emailLog: EmailLogFacts | null;
  emailSummaryLog: EmailLogFacts | null;
  id: string;
  inbox: InboxStatus;
  /** The message's idempotency key, without channel suffixes. */
  key: string;
  recipientName: string | null;
  suppressedAt: number | null;
  /** The title, or the template's label for a WhatsApp-only message. */
  title: string;
  topicId: string | null;
  userId: string | null;
  whatsapp: WhatsAppDeliveryStatus;
  whatsappHeld: HeldFacts | null;
  whatsappLog: WhatsAppLogFacts | null;
  whatsappSummaryLog: WhatsAppLogFacts | null;
}

/** The topic, or where a message without one came from. */
export function deliverySubtitle(row: DeliveryRow): string {
  if (row.topicId) {
    return row.topicId;
  }
  return row.inbox === "off" ? "Inbox off" : "WhatsApp only";
}

export interface DeliveryStats {
  emailsDelivered: number;
  /** Bounced, failed, or refused by Resend's suppression list. */
  emailsNotDelivered: number;
  notificationsSent: number;
  whatsappDelivered: number;
  whatsappFailed: number;
}

/** Days the page covers, the same as the WhatsApp send log keeps. */
export const DELIVERY_HISTORY_DAYS = 90;
export const DELIVERY_STATS_DAYS = 7;

const INDIA_TIME = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

/**
 * `DATE_TIME` ("19 Oct 2026, 9:40 am") in India time. Built from parts
 * because each engine joins a whole formatted date its own way.
 */
export function formatIndiaTime(epochMs: number | null): string {
  if (epochMs === null) {
    return "—";
  }
  const part = Object.fromEntries(
    INDIA_TIME.formatToParts(epochMs).map((p) => [p.type, p.value])
  );
  return `${part.day} ${part.month} ${part.year}, ${part.hour}:${part.minute} ${part.dayPeriod?.toLowerCase()}`;
}
