import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../auth";
import { privateSchema } from "./party-private";

export const whatsappMessageStatusValues = [
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;
export type WhatsAppMessageStatus =
  (typeof whatsappMessageStatusValues)[number];

export const whatsappMessageStatusEnum = privateSchema.enum(
  "whatsapp_message_status",
  whatsappMessageStatusValues
);

/**
 * One message sent through the WhatsApp Cloud API. Meta's send call has no
 * idempotency key, so a send first claims its key here: a retried job finds
 * the claim and skips, and a failed send deletes it so a retry can try
 * again. The webhook moves `status` on as Meta reports delivery. No phone
 * number or message text is kept.
 */
export const whatsappMessage = privateSchema.table(
  "whatsapp_message",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Meta's error code and title when delivery failed. */
    error: text("error"),
    idempotencyKey: text("idempotency_key").primaryKey(),
    status: whatsappMessageStatusEnum("status").default("sending").notNull(),
    /** Template name, or `text` for a free-form reply. */
    template: text("template").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Meta's message ID, which the webhook's status updates refer to. */
    wamid: text("wamid"),
  },
  (table) => [
    uniqueIndex("whatsapp_message_wamid_idx").on(table.wamid),
    index("whatsapp_message_created_at_idx").on(table.createdAt),
  ]
);
