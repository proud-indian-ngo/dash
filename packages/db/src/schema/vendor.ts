import {
  type VendorPaymentStatus as SharedVendorPaymentStatus,
  vendorPaymentStatusValues,
} from "@pi-dash/shared/constants";
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
import { teamEvent } from "./team-event";
import { vendorPaymentTransaction } from "./vendor-payment-transaction";

// Vendor-specific enums
const vendorStatusValues = ["pending", "approved"] as const;

export type VendorStatus = (typeof vendorStatusValues)[number];

export const vendorStatusEnum = pgEnum("vendor_status", vendorStatusValues);

export type VendorPaymentStatus = SharedVendorPaymentStatus;

export const vendorPaymentStatusEnum = pgEnum(
  "vendor_payment_status",
  vendorPaymentStatusValues
);

const attachmentPurposeValues = ["quotation", "invoice"] as const;
export type AttachmentPurpose = (typeof attachmentPurposeValues)[number];
export const attachmentPurposeEnum = pgEnum(
  "attachment_purpose",
  attachmentPurposeValues
);

// Vendor table
export const vendor = pgTable(
  "vendor",
  {
    address: text("address"),
    bankAccountIfscCode: text("bank_account_ifsc_code").notNull(),
    bankAccountName: text("bank_account_name").notNull(),
    bankAccountNumber: text("bank_account_number").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gstNumber: text("gst_number"),
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    panNumber: text("pan_number"),
    status: vendorStatusEnum("status").default("pending").notNull(),
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
    approvalScreenshotKey: text("approval_screenshot_key"),
    city: cityEnum("city").notNull().default("bangalore"),
    createdAt: timestamp("created_at").notNull(),
    eventId: uuid("event_id").references(() => teamEvent.id, {
      onDelete: "set null",
    }),
    id: uuid("id").primaryKey(),
    invoiceDate: date("invoice_date", { mode: "string" }),
    invoiceNumber: text("invoice_number"),
    invoiceRejectionReason: text("invoice_rejection_reason"),
    invoiceReviewedAt: timestamp("invoice_reviewed_at"),
    invoiceReviewedBy: text("invoice_reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: vendorPaymentStatusEnum("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("vendor_payment_userId_idx").on(table.userId),
    index("vendor_payment_vendorId_idx").on(table.vendorId),
    index("vendor_payment_status_idx").on(table.status),
    index("vendor_payment_eventId_idx").on(table.eventId),
    check(
      "vendor_payment_rejection_reason_chk",
      sql`((status = 'rejected'::vendor_payment_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::vendor_payment_status) AND (rejection_reason IS NULL))`
    ),
  ]
);

export const vendorPaymentLineItem = pgTable(
  "vendor_payment_line_item",
  {
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategory.id),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    id: uuid("id").primaryKey(),
    sortOrder: integer("sort_order").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at").notNull(),
    filename: text("filename"),
    id: uuid("id").primaryKey(),
    mimeType: text("mime_type"),
    objectKey: text("object_key"),
    purpose: attachmentPurposeEnum("purpose").default("quotation").notNull(),
    type: attachmentTypeEnum("type").notNull(),
    url: text("url"),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
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
    action: historyActionEnum("action").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    metadata: jsonb("metadata"),
    note: text("note"),
    vendorPaymentId: uuid("vendor_payment_id")
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
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
    attachments: many(vendorPaymentAttachment),
    event: one(teamEvent, {
      fields: [vendorPayment.eventId],
      references: [teamEvent.id],
    }),
    history: many(vendorPaymentHistory),
    invoiceReviewer: one(user, {
      fields: [vendorPayment.invoiceReviewedBy],
      references: [user.id],
      relationName: "vendor_payment_invoice_reviewer",
    }),
    lineItems: many(vendorPaymentLineItem),
    reviewer: one(user, {
      fields: [vendorPayment.reviewedBy],
      references: [user.id],
      relationName: "vendor_payment_reviewer",
    }),
    transactions: many(vendorPaymentTransaction),
    user: one(user, {
      fields: [vendorPayment.userId],
      references: [user.id],
    }),
    vendor: one(vendor, {
      fields: [vendorPayment.vendorId],
      references: [vendor.id],
    }),
  })
);

export const vendorPaymentLineItemRelations = relations(
  vendorPaymentLineItem,
  ({ one }) => ({
    category: one(expenseCategory, {
      fields: [vendorPaymentLineItem.categoryId],
      references: [expenseCategory.id],
    }),
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentLineItem.vendorPaymentId],
      references: [vendorPayment.id],
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
    actor: one(user, {
      fields: [vendorPaymentHistory.actorId],
      references: [user.id],
    }),
    vendorPayment: one(vendorPayment, {
      fields: [vendorPaymentHistory.vendorPaymentId],
      references: [vendorPayment.id],
    }),
  })
);
