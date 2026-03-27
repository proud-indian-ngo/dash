import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { attachmentTypeEnum, historyActionEnum } from "./shared";
import { vendorPayment } from "./vendor";

// Transaction-specific enums
const vendorPaymentTransactionStatusValues = [
  "pending",
  "approved",
  "rejected",
] as const;

export type VendorPaymentTransactionStatus =
  (typeof vendorPaymentTransactionStatusValues)[number];

export const vendorPaymentTransactionStatusEnum = pgEnum(
  "vendor_payment_transaction_status",
  vendorPaymentTransactionStatusValues
);

// Tables
export const vendorPaymentTransaction = pgTable(
  "vendor_payment_transaction",
  {
    id: uuid("id").primaryKey(),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    description: text("description"),
    transactionDate: timestamp("transaction_date").notNull(),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    status: vendorPaymentTransactionStatusEnum("status")
      .default("pending")
      .notNull(),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("vpt_vendorPaymentId_idx").on(table.vendorPaymentId),
    index("vpt_userId_idx").on(table.userId),
    index("vpt_status_idx").on(table.status),
    check(
      "vpt_rejection_reason_chk",
      sql`((status = 'rejected'::vendor_payment_transaction_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::vendor_payment_transaction_status) AND (rejection_reason IS NULL))`
    ),
  ]
);

export const vendorPaymentTransactionAttachment = pgTable(
  "vendor_payment_transaction_attachment",
  {
    id: uuid("id").primaryKey(),
    vendorPaymentTransactionId: uuid("vendor_payment_transaction_id")
      .notNull()
      .references(() => vendorPaymentTransaction.id, { onDelete: "cascade" }),
    type: attachmentTypeEnum("type").notNull(),
    filename: text("filename"),
    objectKey: text("object_key"),
    url: text("url"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("vpta_vendorPaymentTransactionId_idx").on(
      table.vendorPaymentTransactionId
    ),
  ]
);

export const vendorPaymentTransactionHistory = pgTable(
  "vendor_payment_transaction_history",
  {
    id: uuid("id").primaryKey(),
    vendorPaymentTransactionId: uuid("vendor_payment_transaction_id")
      .notNull()
      .references(() => vendorPaymentTransaction.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: historyActionEnum("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("vpth_vendorPaymentTransactionId_idx").on(
      table.vendorPaymentTransactionId
    ),
  ]
);

// Relations
export const vendorPaymentTransactionRelations = relations(
  vendorPaymentTransaction,
  ({ one, many }) => ({
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentTransaction.vendorPaymentId],
      references: [vendorPayment.id],
    }),
    user: one(user, {
      fields: [vendorPaymentTransaction.userId],
      references: [user.id],
    }),
    reviewer: one(user, {
      fields: [vendorPaymentTransaction.reviewedBy],
      references: [user.id],
      relationName: "vpt_reviewer",
    }),
    attachments: many(vendorPaymentTransactionAttachment),
    history: many(vendorPaymentTransactionHistory),
  })
);

export const vendorPaymentTransactionAttachmentRelations = relations(
  vendorPaymentTransactionAttachment,
  ({ one }) => ({
    transaction: one(vendorPaymentTransaction, {
      fields: [vendorPaymentTransactionAttachment.vendorPaymentTransactionId],
      references: [vendorPaymentTransaction.id],
    }),
  })
);

export const vendorPaymentTransactionHistoryRelations = relations(
  vendorPaymentTransactionHistory,
  ({ one }) => ({
    transaction: one(vendorPaymentTransaction, {
      fields: [vendorPaymentTransactionHistory.vendorPaymentTransactionId],
      references: [vendorPaymentTransaction.id],
    }),
    actor: one(user, {
      fields: [vendorPaymentTransactionHistory.actorId],
      references: [user.id],
    }),
  })
);
