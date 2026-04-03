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
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    city: cityEnum("city"),
    status: advancePaymentStatusEnum("status").default("pending").notNull(),
    rejectionReason: text("rejection_reason"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    bankAccountIfscCode: text("bank_account_ifsc_code"),
    approvalScreenshotKey: text("approval_screenshot_key"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("advance_payment_userId_idx").on(table.userId),
    index("advance_payment_status_idx").on(table.status),
  ]
);

export const advancePaymentLineItem = pgTable(
  "advance_payment_line_item",
  {
    id: uuid("id").primaryKey(),
    advancePaymentId: uuid("advance_payment_id")
      .notNull()
      .references(() => advancePayment.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategory.id),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").notNull(),
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
    id: uuid("id").primaryKey(),
    advancePaymentId: uuid("advance_payment_id")
      .notNull()
      .references(() => advancePayment.id, { onDelete: "cascade" }),
    type: attachmentTypeEnum("type").notNull(),
    filename: text("filename"),
    objectKey: text("object_key"),
    url: text("url"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").notNull(),
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
    id: uuid("id").primaryKey(),
    advancePaymentId: uuid("advance_payment_id")
      .notNull()
      .references(() => advancePayment.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: historyActionEnum("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull(),
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
    user: one(user, {
      fields: [advancePayment.userId],
      references: [user.id],
    }),
    reviewer: one(user, {
      fields: [advancePayment.reviewedBy],
      references: [user.id],
      relationName: "advance_payment_reviewer",
    }),
    lineItems: many(advancePaymentLineItem),
    attachments: many(advancePaymentAttachment),
    history: many(advancePaymentHistory),
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
    advancePayment: one(advancePayment, {
      fields: [advancePaymentHistory.advancePaymentId],
      references: [advancePayment.id],
    }),
    actor: one(user, {
      fields: [advancePaymentHistory.actorId],
      references: [user.id],
    }),
  })
);
