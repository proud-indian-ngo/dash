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
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    id: uuid("id").primaryKey(),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: vendorPaymentTransactionStatusEnum("status")
      .default("pending")
      .notNull(),
    transactionDate: timestamp("transaction_date").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at").notNull(),
    filename: text("filename"),
    id: uuid("id").primaryKey(),
    mimeType: text("mime_type"),
    objectKey: text("object_key"),
    type: attachmentTypeEnum("type").notNull(),
    url: text("url"),
    vendorPaymentTransactionId: uuid("vendor_payment_transaction_id")
      .notNull()
      .references(() => vendorPaymentTransaction.id, { onDelete: "cascade" }),
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
    action: historyActionEnum("action").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    metadata: jsonb("metadata"),
    note: text("note"),
    vendorPaymentTransactionId: uuid("vendor_payment_transaction_id")
      .notNull()
      .references(() => vendorPaymentTransaction.id, { onDelete: "cascade" }),
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
    attachments: many(vendorPaymentTransactionAttachment),
    history: many(vendorPaymentTransactionHistory),
    reviewer: one(user, {
      fields: [vendorPaymentTransaction.reviewedBy],
      references: [user.id],
      relationName: "vpt_reviewer",
    }),
    user: one(user, {
      fields: [vendorPaymentTransaction.userId],
      references: [user.id],
    }),
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentTransaction.vendorPaymentId],
      references: [vendorPayment.id],
    }),
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
    actor: one(user, {
      fields: [vendorPaymentTransactionHistory.actorId],
      references: [user.id],
    }),
    transaction: one(vendorPaymentTransaction, {
      fields: [vendorPaymentTransactionHistory.vendorPaymentTransactionId],
      references: [vendorPaymentTransaction.id],
    }),
  })
);
