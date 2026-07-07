import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { expenseCategory } from "./expense-category";
import { attachmentTypeEnum, cityEnum, historyActionEnum } from "./shared";

// Advance-payment-specific enums
const advancePaymentStatusValues = ["pending", "approved", "rejected"] as const;

export type AdvancePaymentStatus = (typeof advancePaymentStatusValues)[number];

export const advancePaymentStatusEnum = pgEnum(
  "advance_payment_status",
  advancePaymentStatusValues
);

// Tables
export const advancePayment = pgTable(
  "advance_payment",
  {
    approvalScreenshotKey: text("approval_screenshot_key"),
    bankAccountIfscCode: text("bank_account_ifsc_code"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    city: cityEnum("city"),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: advancePaymentStatusEnum("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("advance_payment_userId_idx").on(table.userId),
    index("advance_payment_status_idx").on(table.status),
  ]
);

export const advancePaymentLineItem = pgTable(
  "advance_payment_line_item",
  {
    advancePaymentId: uuid("advance_payment_id")
      .notNull()
      .references(() => advancePayment.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategory.id),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    id: uuid("id").primaryKey(),
    sortOrder: integer("sort_order").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("advance_payment_line_item_advancePaymentId_idx").on(
      table.advancePaymentId
    ),
  ]
);

export const advancePaymentAttachment = pgTable(
  "advance_payment_attachment",
  {
    advancePaymentId: uuid("advance_payment_id")
      .notNull()
      .references(() => advancePayment.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    filename: text("filename"),
    id: uuid("id").primaryKey(),
    mimeType: text("mime_type"),
    objectKey: text("object_key"),
    type: attachmentTypeEnum("type").notNull(),
    url: text("url"),
  },
  (table) => [
    index("advance_payment_attachment_advancePaymentId_idx").on(
      table.advancePaymentId
    ),
  ]
);

export const advancePaymentHistory = pgTable(
  "advance_payment_history",
  {
    action: historyActionEnum("action").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    advancePaymentId: uuid("advance_payment_id")
      .notNull()
      .references(() => advancePayment.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    metadata: jsonb("metadata"),
    note: text("note"),
  },
  (table) => [
    index("advance_payment_history_advancePaymentId_idx").on(
      table.advancePaymentId
    ),
  ]
);

// Relations
export const advancePaymentRelations = relations(
  advancePayment,
  ({ one, many }) => ({
    attachments: many(advancePaymentAttachment),
    history: many(advancePaymentHistory),
    lineItems: many(advancePaymentLineItem),
    reviewer: one(user, {
      fields: [advancePayment.reviewedBy],
      references: [user.id],
      relationName: "advance_payment_reviewer",
    }),
    user: one(user, {
      fields: [advancePayment.userId],
      references: [user.id],
    }),
  })
);

export const advancePaymentLineItemRelations = relations(
  advancePaymentLineItem,
  ({ one }) => ({
    advancePayment: one(advancePayment, {
      fields: [advancePaymentLineItem.advancePaymentId],
      references: [advancePayment.id],
    }),
    category: one(expenseCategory, {
      fields: [advancePaymentLineItem.categoryId],
      references: [expenseCategory.id],
    }),
  })
);

export const advancePaymentAttachmentRelations = relations(
  advancePaymentAttachment,
  ({ one }) => ({
    advancePayment: one(advancePayment, {
      fields: [advancePaymentAttachment.advancePaymentId],
      references: [advancePayment.id],
    }),
  })
);

export const advancePaymentHistoryRelations = relations(
  advancePaymentHistory,
  ({ one }) => ({
    actor: one(user, {
      fields: [advancePaymentHistory.actorId],
      references: [user.id],
    }),
    advancePayment: one(advancePayment, {
      fields: [advancePaymentHistory.advancePaymentId],
      references: [advancePayment.id],
    }),
  })
);
