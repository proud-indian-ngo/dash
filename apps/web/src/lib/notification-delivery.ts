import type { GowaMessageSource } from "@pi-dash/db/schema/private/gowa-message";

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

/** How the WhatsApp copy went out. */
export const DELIVERED_BY = [
  "whatsapp_api",
  "whatsapp_gateway",
  "whatsapp_group",
  "none",
] as const;
export type DeliveredBy = (typeof DELIVERED_BY)[number];

export const DELIVERED_BY_LABEL: Record<DeliveredBy, string> = {
  none: "\u2014",
  whatsapp_api: "WhatsApp API",
  whatsapp_gateway: "WhatsApp gateway",
  whatsapp_group: "WhatsApp group",
};

/** What sent a GoWA message, the start of its title. */
export const GATEWAY_SOURCE_LABEL: Record<GowaMessageSource, string> = {
  event_created: "New event",
  event_reminder: "Event reminder",
  event_update: "Event update",
  notification: "WhatsApp message",
  poll_cancelled: "Event cancelled",
  rsvp_poll: "RSVP poll",
  scheduled: "Scheduled message",
  weekly_digest: "Weekly events digest",
};

/**
 * A message sent through GoWA. Receipts are counted per person: a read
 * counts as delivered too. How many were in the group isn't known.
 */
export interface GatewayFacts {
  createdAt: number;
  deliveredCount: number;
  error: string | null;
  /** The first delivery and read receipt. */
  firstDeliveredAt: number | null;
  firstReadAt: number | null;
  kind: "group_post" | "direct";
  readCount: number;
}

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
  deliveredBy: DeliveredBy;
  email: EmailDeliveryStatus;
  emailHeld: HeldFacts | null;
  emailLog: EmailLogFacts | null;
  emailSummaryLog: EmailLogFacts | null;
  gateway: GatewayFacts | null;
  id: string;
  inbox: InboxStatus;
  /** The message's idempotency key without channel suffixes, or `gowa-${id}`. */
  key: string;
  /** The person, or the group for a group post. */
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
  if (row.deliveredBy === "whatsapp_group") {
    return "Group post";
  }
  return row.inbox === "off" ? "Inbox off" : "WhatsApp only";
}

const PHONE_LIKE = /^[+\d\s()-]+$/;
const PHONE_JID = /^(\d+)@s\.whatsapp\.net$/;

/** A number with all but its country code and last three digits hidden. */
export function maskPhone(digits: string): string {
  const country = digits.length > 10 ? `+${digits.slice(0, -10)} ` : "";
  return `${country}•••• ••${digits.slice(-3)}`;
}

/**
 * Who a receipt came from, never as a full number: the dashboard user with
 * that phone, else GoWA's display name unless it is itself a number, else
 * the number masked.
 */
export function receiptPersonName(
  jid: string,
  displayName: string | null,
  userName: string | null
): string {
  if (userName) {
    return userName;
  }
  if (displayName && !PHONE_LIKE.test(displayName)) {
    return displayName;
  }
  const phone = PHONE_JID.exec(jid)?.[1];
  return phone ? maskPhone(phone) : "Unknown number";
}

/** A group post's receipts, as "Delivered to 48 · Read by 21". */
export function groupReceiptSummary(gateway: GatewayFacts): string {
  return `Delivered to ${gateway.deliveredCount} · Read by ${gateway.readCount}`;
}

export interface DeliveryStats {
  emailsDelivered: number;
  /** Bounced, failed, or refused by Resend's suppression list. */
  emailsNotDelivered: number;
  notificationsSent: number;
  /** Cloud API and gateway direct messages; group posts aren't counted. */
  whatsappDelivered: number;
  /** Cloud API and gateway sends, group posts included. */
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
