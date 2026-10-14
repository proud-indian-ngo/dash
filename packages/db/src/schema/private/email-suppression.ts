import { text, timestamp } from "drizzle-orm/pg-core";

import { privateSchema } from "./party-private";

export const emailSuppressionReasonValues = [
  "hard_bounce",
  "complaint",
] as const;
export type EmailSuppressionReason =
  (typeof emailSuppressionReasonValues)[number];

export const emailSuppressionReasonEnum = privateSchema.enum(
  "email_suppression_reason",
  emailSuppressionReasonValues
);

/**
 * Addresses Resend reported as hard-bounced or marked as spam, written by the
 * `/api/email/webhook` route. Notification email skips every row here; auth
 * email (verification, password reset) skips only hard bounces. An admin
 * clears a row with "Resume email" on the user's sheet. Keyed by the
 * lower-cased address so it survives the user being deleted and re-created.
 */
export const emailSuppression = privateSchema.table("email_suppression", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  email: text("email").primaryKey(),
  reason: emailSuppressionReasonEnum("reason").notNull(),
  /** The Resend email that bounced or was reported, for tracing in Resend. */
  resendEmailId: text("resend_email_id"),
});
