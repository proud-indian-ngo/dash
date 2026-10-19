import { index, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth";
import { privateSchema } from "./party-private";

export const emailMessageStatusValues = [
  "sent",
  "delayed",
  "delivered",
  "complained",
  "bounced",
  "failed",
  "suppressed",
] as const;
export type EmailMessageStatus = (typeof emailMessageStatusValues)[number];

export const emailMessageStatusEnum = privateSchema.enum(
  "email_message_status",
  emailMessageStatusValues
);

/**
 * One notification email Resend accepted, per recipient, for the 90-day
 * delivery log. The webhook moves `status` on as Resend reports delivery.
 * No address, subject or content is kept.
 */
export const emailMessage = privateSchema.table(
  "email_message",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** The bounce, failure or suppression reason Resend gave. */
    error: text("error"),
    /**
     * The notification's key without channel suffixes, or `digest-${batchId}`
     * for a digest. Null only while a webhook event has beaten the send's
     * own insert.
     */
    key: text("key"),
    resendEmailId: text("resend_email_id").primaryKey(),
    status: emailMessageStatusEnum("status").default("sent").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("email_message_key_user_idx").on(table.key, table.userId),
    index("email_message_created_at_idx").on(table.createdAt),
  ]
);
