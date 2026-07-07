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
  attachments: jsonb("attachments").$type<ScheduledMessageAttachment[]>(),
  createdAt: timestamp("created_at").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  id: uuid("id").primaryKey(),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
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
    createdAt: timestamp("created_at").notNull(),
    error: text("error"),
    id: uuid("id").primaryKey(),
    label: text("label").notNull(),
    recipientId: text("recipient_id").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    scheduledMessageId: uuid("scheduled_message_id")
      .notNull()
      .references(() => scheduledMessage.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at"),
    status: scheduledMessageRecipientStatusEnum("status")
      .default("pending")
      .notNull(),
    type: scheduledMessageRecipientTypeEnum("type").notNull(),
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
