import type { DigestRow } from "@pi-dash/shared/notification-digest";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { jsonb } from "../jsonb";
import { privateSchema } from "./party-private";

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
    /** The WhatsApp text sent when this is the recipient's only message. */
    whatsappText: text("whatsapp_text"),
  },
  (table) => [index("held_notification_created_at_idx").on(table.createdAt)]
);

/**
 * One recipient and channel of a held notification. The flush job claims a
 * recipient's unsent rows for a topic and channel with one `batch_id` once
 * the oldest is past the window, sends them, then stamps `sent_at`. A claim
 * not sent within the lease (the run died or the group failed) is taken
 * over by a later run, counting `attempts`, and given up after three.
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
  ]
);
