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
import { attachmentTypeEnum, historyActionEnum } from "./shared";

// Vendor-specific enums
const vendorStatusValues = ["pending", "approved"] as const;

export type VendorStatus = (typeof vendorStatusValues)[number];

export const vendorStatusEnum = pgEnum("vendor_status", vendorStatusValues);

const vendorPaymentStatusValues = ["pending", "approved", "rejected"] as const;

export type VendorPaymentStatus = (typeof vendorPaymentStatusValues)[number];

export const vendorPaymentStatusEnum = pgEnum(
  "vendor_payment_status",
  vendorPaymentStatusValues
);

// Vendor table
export const vendor = pgTable(
  "vendor",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone").notNull(),
    bankAccountName: text("bank_account_name").notNull(),
    bankAccountNumber: text("bank_account_number").notNull(),
    bankAccountIfscCode: text("bank_account_ifsc_code").notNull(),
    address: text("address"),
    gstNumber: text("gst_number"),
    panNumber: text("pan_number"),
    status: vendorStatusEnum("status").default("pending").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("vendor_status_idx").on(table.status),
    index("vendor_createdBy_idx").on(table.createdBy),
  ]
);

// Vendor Payment table (invoice request)
export const vendorPayment = pgTable(
  "vendor_payment",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date", { mode: "string" }).notNull(),
    status: vendorPaymentStatusEnum("status").default("pending").notNull(),
    rejectionReason: text("rejection_reason"),
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
    index("vendor_payment_userId_idx").on(table.userId),
    index("vendor_payment_vendorId_idx").on(table.vendorId),
    index("vendor_payment_status_idx").on(table.status),
    check(
      "vendor_payment_rejection_reason_chk",
      sql`((status = 'rejected'::vendor_payment_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::vendor_payment_status) AND (rejection_reason IS NULL))`
    ),
  ]
);

export const vendorPaymentLineItem = pgTable(
  "vendor_payment_line_item",
  {
    id: uuid("id").primaryKey(),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
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
    index("vendor_payment_line_item_vendorPaymentId_idx").on(
      table.vendorPaymentId
    ),
  ]
);

export const vendorPaymentAttachment = pgTable(
  "vendor_payment_attachment",
  {
    id: uuid("id").primaryKey(),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
    type: attachmentTypeEnum("type").notNull(),
    filename: text("filename"),
    objectKey: text("object_key"),
    url: text("url"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("vendor_payment_attachment_vendorPaymentId_idx").on(
      table.vendorPaymentId
    ),
  ]
);

export const vendorPaymentHistory = pgTable(
  "vendor_payment_history",
  {
    id: uuid("id").primaryKey(),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: historyActionEnum("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("vendor_payment_history_vendorPaymentId_idx").on(
      table.vendorPaymentId
    ),
  ]
);

// Relations
export const vendorRelations = relations(vendor, ({ one, many }) => ({
  creator: one(user, {
    fields: [vendor.createdBy],
    references: [user.id],
  }),
  vendorPayments: many(vendorPayment),
}));

export const vendorPaymentRelations = relations(
  vendorPayment,
  ({ one, many }) => ({
    user: one(user, {
      fields: [vendorPayment.userId],
      references: [user.id],
    }),
    vendor: one(vendor, {
      fields: [vendorPayment.vendorId],
      references: [vendor.id],
    }),
    reviewer: one(user, {
      fields: [vendorPayment.reviewedBy],
      references: [user.id],
      relationName: "vendor_payment_reviewer",
    }),
    lineItems: many(vendorPaymentLineItem),
    attachments: many(vendorPaymentAttachment),
    history: many(vendorPaymentHistory),
  })
);

export const vendorPaymentLineItemRelations = relations(
  vendorPaymentLineItem,
  ({ one }) => ({
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentLineItem.vendorPaymentId],
      references: [vendorPayment.id],
    }),
    category: one(expenseCategory, {
      fields: [vendorPaymentLineItem.categoryId],
      references: [expenseCategory.id],
    }),
  })
);

export const vendorPaymentAttachmentRelations = relations(
  vendorPaymentAttachment,
  ({ one }) => ({
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentAttachment.vendorPaymentId],
      references: [vendorPayment.id],
    }),
  })
);

export const vendorPaymentHistoryRelations = relations(
  vendorPaymentHistory,
  ({ one }) => ({
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentHistory.vendorPaymentId],
      references: [vendorPayment.id],
    }),
    actor: one(user, {
      fields: [vendorPaymentHistory.actorId],
      references: [user.id],
    }),
  })
);
