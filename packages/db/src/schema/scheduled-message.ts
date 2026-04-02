import { relations } from "drizzle-orm";
import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const scheduledMessageStatusValues = [
  "pending",
  "sent",
  "failed",
  "cancelled",
] as const;
export type ScheduledMessageStatus =
  (typeof scheduledMessageStatusValues)[number];
export const scheduledMessageStatusEnum = pgEnum(
  "scheduled_message_status",
  scheduledMessageStatusValues
);

export interface ScheduledMessageRecipient {
  id: string;
  label: string;
  type: "group" | "user";
}

export interface ScheduledMessageAttachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

export const scheduledMessage = pgTable("scheduled_message", {
  id: uuid("id").primaryKey(),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: scheduledMessageStatusEnum("status").default("pending").notNull(),
  recipients: jsonb("recipients")
    .$type<ScheduledMessageRecipient[]>()
    .notNull(),
  attachments: jsonb("attachments").$type<ScheduledMessageAttachment[]>(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const scheduledMessageRelations = relations(
  scheduledMessage,
  ({ one }) => ({
    creator: one(user, {
      fields: [scheduledMessage.createdBy],
      references: [user.id],
    }),
  })
);
