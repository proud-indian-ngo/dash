import { pgEnum } from "drizzle-orm/pg-core";

// Shared enum values
export const cityValues = ["bangalore", "mumbai"] as const;
export type City = (typeof cityValues)[number];

export const attachmentTypeValues = ["file", "url"] as const;
export type AttachmentType = (typeof attachmentTypeValues)[number];

export const historyActionValues = [
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "invoice_submitted",
  "invoice_updated",
  "invoice_approved",
  "invoice_rejected",
] as const;
export type HistoryAction = (typeof historyActionValues)[number];

// Shared Postgres enums
// Postgres enum name is "reimbursement_city" from initial migration (0006)
export const cityEnum = pgEnum("reimbursement_city", cityValues);
export const attachmentTypeEnum = pgEnum(
  "attachment_type",
  attachmentTypeValues
);
export const historyActionEnum = pgEnum("history_action", historyActionValues);
