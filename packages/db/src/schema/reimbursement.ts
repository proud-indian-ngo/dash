import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
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

// Reimbursement-specific enums
const reimbursementStatusValues = ["pending", "approved", "rejected"] as const;

export type ReimbursementStatus = (typeof reimbursementStatusValues)[number];

export const reimbursementStatusEnum = pgEnum(
  "reimbursement_status",
  reimbursementStatusValues
);

// Tables
export const reimbursement = pgTable(
  "reimbursement",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    city: cityEnum("city"),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    status: reimbursementStatusEnum("status").default("pending").notNull(),
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
    index("reimbursement_userId_idx").on(table.userId),
    index("reimbursement_status_idx").on(table.status),
    check(
      "reimbursement_rejection_reason_chk",
      sql`((status = 'rejected'::reimbursement_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::reimbursement_status) AND (rejection_reason IS NULL))`
    ),
  ]
);

export const reimbursementLineItem = pgTable(
  "reimbursement_line_item",
  {
    id: uuid("id").primaryKey(),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursement.id, { onDelete: "cascade" }),
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
    index("reimbursement_line_item_reimbursementId_idx").on(
      table.reimbursementId
    ),
  ]
);

export const reimbursementAttachment = pgTable(
  "reimbursement_attachment",
  {
    id: uuid("id").primaryKey(),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursement.id, { onDelete: "cascade" }),
    type: attachmentTypeEnum("type").notNull(),
    filename: text("filename"),
    objectKey: text("object_key"),
    url: text("url"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("reimbursement_attachment_reimbursementId_idx").on(
      table.reimbursementId
    ),
  ]
);

export const reimbursementHistory = pgTable(
  "reimbursement_history",
  {
    id: uuid("id").primaryKey(),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursement.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: historyActionEnum("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("reimbursement_history_reimbursementId_idx").on(
      table.reimbursementId
    ),
  ]
);

// Relations
export const reimbursementRelations = relations(
  reimbursement,
  ({ one, many }) => ({
    user: one(user, {
      fields: [reimbursement.userId],
      references: [user.id],
    }),
    reviewer: one(user, {
      fields: [reimbursement.reviewedBy],
      references: [user.id],
      relationName: "reimbursement_reviewer",
    }),
    lineItems: many(reimbursementLineItem),
    attachments: many(reimbursementAttachment),
    history: many(reimbursementHistory),
  })
);

export const reimbursementLineItemRelations = relations(
  reimbursementLineItem,
  ({ one }) => ({
    reimbursement: one(reimbursement, {
      fields: [reimbursementLineItem.reimbursementId],
      references: [reimbursement.id],
    }),
    category: one(expenseCategory, {
      fields: [reimbursementLineItem.categoryId],
      references: [expenseCategory.id],
    }),
  })
);

export const reimbursementAttachmentRelations = relations(
  reimbursementAttachment,
  ({ one }) => ({
    reimbursement: one(reimbursement, {
      fields: [reimbursementAttachment.reimbursementId],
      references: [reimbursement.id],
    }),
  })
);

export const reimbursementHistoryRelations = relations(
  reimbursementHistory,
  ({ one }) => ({
    reimbursement: one(reimbursement, {
      fields: [reimbursementHistory.reimbursementId],
      references: [reimbursement.id],
    }),
    actor: one(user, {
      fields: [reimbursementHistory.actorId],
      references: [user.id],
    }),
  })
);
