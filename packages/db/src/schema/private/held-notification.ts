import type { DigestRow } from "@pi-dash/shared/notification-digest";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { jsonb } from "../jsonb";
import { privateSchema } from "./party-private";

/** A filled-in WhatsApp template (`@pi-dash/whatsapp/template-message`). */
export interface HeldWhatsAppTemplate {
  name: string;
  params: Record<string, string>;
  path?: string;
}

export const heldNotificationChannelValues = ["email", "whatsapp"] as const;
export type HeldNotificationChannel =
  (typeof heldNotificationChannelValues)[number];

export const heldNotificationChannelEnum = privateSchema.enum(
  "held_notification_channel",
  heldNotificationChannelValues
);

/**
 * An email or WhatsApp notification waiting out the batching window, keyed by
 * the message's idempotency key. The inbox copy is written straight away; the
 * `flush-held-notifications` job sends what's here, as the original message
 * when a recipient has one in the window or as a digest when they have more.
 */
export const heldNotification = privateSchema.table(
  "held_notification",
  {
    body: text("body").notNull(),
    /**
     * Set when every recipient has been sent and the content (body, HTML,
     * WhatsApp text, digest row) was cleared; the row stays for tracing.
     */
    clearedAt: timestamp("cleared_at"),
    clickAction: text("click_action"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** How the message reads as a digest row; null falls back to title and body. */
    digest: jsonb("digest").$type<DigestRow>(),
    /** The rendered email, with the footer placeholder still in it. */
    emailHtml: text("email_html"),
    key: text("key").primaryKey(),
    title: text("title").notNull(),
    topicId: text("topic_id").notNull(),
    /**
     * The WhatsApp Cloud API template for this message, sent on its own or
     * when the digest template can't be used; null on the GoWA path.
     */
    whatsappTemplate: jsonb("whatsapp_template").$type<HeldWhatsAppTemplate>(),
    /** The WhatsApp text sent when this is the recipient's only message. */
    whatsappText: text("whatsapp_text"),
  },
  (table) => [
    index("held_notification_created_at_idx").on(table.createdAt),
    // The flush job clears sent content every minute.
    index("held_notification_uncleared_idx")
      .on(table.key)
      .where(sql`${table.clearedAt} is null`),
  ]
);

/**
 * One recipient and channel of a held notification. The flush job claims a
 * recipient's unsent rows for a topic and channel with one `batch_id` once
 * the oldest is past the window, sends them, then stamps `sent_at`. A claim
 * not sent within the lease (the run died or the group failed) is taken
 * over by a later run, counting `attempts`, and given up after three.
 *
 * How a sent row ended is recorded in the row: given up has `attempts` at
 * `MAX_ATTEMPTS`, dropped by the kill switch has no `batch_id`, and skipped
 * because the inbox copy was read has `skipped_read`.
 */
export const heldNotificationRecipient = privateSchema.table(
  "held_notification_recipient",
  {
    attempts: integer("attempts").default(0).notNull(),
    batchId: text("batch_id"),
    channel: heldNotificationChannelEnum("channel").notNull(),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    heldKey: text("held_key")
      .notNull()
      .references(() => heldNotification.key, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at"),
    skippedRead: boolean("skipped_read").default(false).notNull(),
    topicId: text("topic_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.heldKey, table.userId, table.channel] }),
    index("held_notification_recipient_unsent_idx")
      .on(table.userId, table.topicId, table.channel, table.createdAt)
      .where(sql`${table.sentAt} is null`),
    index("held_notification_recipient_batch_id_idx").on(table.batchId),
  ]
);
