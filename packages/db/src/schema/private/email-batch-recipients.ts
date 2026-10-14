import { index, text, timestamp } from "drizzle-orm/pg-core";

import { jsonb } from "../jsonb";
import { privateSchema } from "./party-private";

export interface EmailBatchRecipient {
  email: string;
  userId: string;
}

/**
 * The recipient list a bulk notification email was first sent to, keyed by
 * its Resend idempotency key. Resend rejects a reused key whose payload
 * changed, so a retried job resends this list instead of re-reading
 * preferences that may have changed since. Rows outlive Resend's 24-hour key
 * window briefly and are then deleted.
 */
export const emailBatchRecipients = privateSchema.table(
  "email_batch_recipients",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    idempotencyKey: text("idempotency_key").primaryKey(),
    recipients: jsonb("recipients").$type<EmailBatchRecipient[]>().notNull(),
  },
  (table) => [
    index("email_batch_recipients_created_at_idx").on(table.createdAt),
  ]
);
