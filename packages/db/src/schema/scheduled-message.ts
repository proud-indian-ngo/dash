import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export interface ScheduledMessageAttachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

export const scheduledMessage = pgTable("scheduled_message", {
  id: uuid("id").primaryKey(),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  attachments: jsonb("attachments").$type<ScheduledMessageAttachment[]>(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

const scheduledMessageRecipientTypeValues = ["group", "user"] as const;
export type ScheduledMessageRecipientType =
  (typeof scheduledMessageRecipientTypeValues)[number];
export const scheduledMessageRecipientTypeEnum = pgEnum(
  "scheduled_message_recipient_type",
  scheduledMessageRecipientTypeValues
);

const scheduledMessageRecipientStatusValues = [
  "pending",
  "sent",
  "failed",
  "cancelled",
] as const;
export type ScheduledMessageRecipientStatus =
  (typeof scheduledMessageRecipientStatusValues)[number];
export const scheduledMessageRecipientStatusEnum = pgEnum(
  "scheduled_message_recipient_status",
  scheduledMessageRecipientStatusValues
);

export const scheduledMessageRecipient = pgTable(
  "scheduled_message_recipient",
  {
    id: uuid("id").primaryKey(),
    scheduledMessageId: uuid("scheduled_message_id")
      .notNull()
      .references(() => scheduledMessage.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id").notNull(),
    label: text("label").notNull(),
    type: scheduledMessageRecipientTypeEnum("type").notNull(),
    status: scheduledMessageRecipientStatusEnum("status")
      .default("pending")
      .notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at"),
    retryCount: integer("retry_count").default(0).notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("scheduled_message_recipient_scheduledMessageId_idx").on(
      table.scheduledMessageId
    ),
  ]
);

export const scheduledMessageRelations = relations(
  scheduledMessage,
  ({ one, many }) => ({
    creator: one(user, {
      fields: [scheduledMessage.createdBy],
      references: [user.id],
    }),
    recipients: many(scheduledMessageRecipient),
  })
);

export const scheduledMessageRecipientRelations = relations(
  scheduledMessageRecipient,
  ({ one }) => ({
    scheduledMessage: one(scheduledMessage, {
      fields: [scheduledMessageRecipient.scheduledMessageId],
      references: [scheduledMessage.id],
    }),
  })
);

export type ScheduledMessageDerivedStatus =
  | "pending"
  | "sent"
  | "failed"
  | "cancelled"
  | "partial";
