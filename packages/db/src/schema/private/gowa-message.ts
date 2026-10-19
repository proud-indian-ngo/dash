import {
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { scheduledMessage } from "../scheduled-message";
import { teamEvent } from "../team-event";
import { privateSchema } from "./party-private";

export const gowaMessageKindValues = ["group_post", "direct"] as const;
export type GowaMessageKind = (typeof gowaMessageKindValues)[number];

export const gowaMessageKindEnum = privateSchema.enum(
  "gowa_message_kind",
  gowaMessageKindValues
);

/** What sent the message; the delivery page builds its title from this. */
export type GowaMessageSource =
  | "event_created"
  | "event_reminder"
  | "event_update"
  | "weekly_digest"
  | "rsvp_poll"
  | "poll_cancelled"
  | "scheduled"
  | "notification";

/**
 * One message sent through GoWA, for the 90-day delivery log: a group post,
 * or a direct message to one person. A media send is one row whose parts
 * carry the WhatsApp message IDs. Direct rows keep the user, never the
 * phone. A row with `error` set was never sent; otherwise its status comes
 * from the receipts.
 */
export const gowaMessage = privateSchema.table(
  "gowa_message",
  {
    attachmentCount: integer("attachment_count").default(0).notNull(),
    /** The group's JID for a group post; null for a direct message. */
    chatJid: text("chat_jid"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    error: text("error"),
    eventId: uuid("event_id").references(() => teamEvent.id, {
      onDelete: "set null",
    }),
    id: uuid("id").primaryKey(),
    /** The notification's WhatsApp key, for a `notification` send. */
    idempotencyKey: text("idempotency_key"),
    kind: gowaMessageKindEnum("kind").notNull(),
    scheduledMessageId: uuid("scheduled_message_id").references(
      () => scheduledMessage.id,
      { onDelete: "set null" }
    ),
    source: text("source").$type<GowaMessageSource>().notNull(),
    /** The text as sent; a media send's caption. */
    text: text("text").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("gowa_message_created_at_idx").on(table.createdAt),
    index("gowa_message_idempotency_key_idx").on(table.idempotencyKey),
  ]
);

/**
 * The WhatsApp message IDs of a send: one for text, one per attachment for
 * media. Receipts refer to these IDs, so they join here.
 */
export const gowaMessagePart = privateSchema.table(
  "gowa_message_part",
  {
    gowaMessageId: uuid("gowa_message_id")
      .notNull()
      .references(() => gowaMessage.id, { onDelete: "cascade" }),
    messageId: text("message_id").primaryKey(),
  },
  (table) => [
    index("gowa_message_part_gowa_message_idx").on(table.gowaMessageId),
  ]
);

/**
 * One person's delivery and read receipts for one WhatsApp message, from
 * GoWA's `message.ack` webhook. Written without checking the send's row, so
 * a receipt that beats the send's insert is kept; the page joins on the
 * message ID, and receipts for messages never logged are pruned. People are
 * matched to users by phone when read.
 */
export const gowaReceipt = privateSchema.table(
  "gowa_receipt",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at"),
    /** GoWA's label for the person; may be their number. */
    displayName: text("display_name"),
    messageId: text("message_id").notNull(),
    /** The JID that acknowledged, `<phone>@s.whatsapp.net` or an `@lid`. */
    personJid: text("person_jid").notNull(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.personJid] }),
    index("gowa_receipt_created_at_idx").on(table.createdAt),
  ]
);
