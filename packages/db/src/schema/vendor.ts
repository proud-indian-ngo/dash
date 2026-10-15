import { vendorPaymentNoInvoiceReasonValues } from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  date,
  index,
  integer,
  bigint,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { expenseCategory } from "./expense-category";
import { programme, project } from "./finance-dimensions";
import { jsonb } from "./jsonb";
import { party } from "./party";
import {
  attachmentTypeEnum,
  cityEnum,
  expenseChargedToEnum,
  historyActionEnum,
} from "./shared";
import { teamEvent } from "./team-event";
import { vendorPaymentTransaction } from "./vendor-payment-transaction";

// Vendor-specific enums
const vendorStatusValues = ["pending", "approved"] as const;

export type VendorStatus = (typeof vendorStatusValues)[number];

export const vendorStatusEnum = pgEnum("vendor_status", vendorStatusValues);

const vendorPaymentStatusValues = [
  "pending",
  "approved",
  "rejected",
  "partially_paid",
  "paid",
  "invoice_pending",
  "completed",
] as const;

export type VendorPaymentStatus = (typeof vendorPaymentStatusValues)[number];

export const vendorPaymentStatusEnum = pgEnum(
  "vendor_payment_status",
  vendorPaymentStatusValues
);

/** Why a paid request closes without a vendor invoice (rent, tax and the like). */
export const vendorPaymentNoInvoiceReasonEnum = pgEnum(
  "vendor_payment_no_invoice_reason",
  vendorPaymentNoInvoiceReasonValues
);

const attachmentPurposeValues = ["quotation", "invoice"] as const;
export type AttachmentPurpose = (typeof attachmentPurposeValues)[number];
export const attachmentPurposeEnum = pgEnum(
  "attachment_purpose",
  attachmentPurposeValues
);

/**
 * A vendor is a party with the `vendor` role; this row is its supplier
 * profile (approval status and GSTIN), with the same ID as the party. Contact,
 * PAN and bank details live in the private party tables
 * (`schema/private/party-private.ts`) and are read through server functions,
 * so they never sync to the browser.
 */
export const vendor = pgTable(
  "vendor",
  {
    createdAt: timestamp("created_at").notNull(),
    /** Null once the user who added the vendor is deleted; the vendor stays. */
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    gstNumber: text("gst_number"),
    id: uuid("id")
      .primaryKey()
      .references(() => party.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
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
    /** Programme the expense is charged to when it has no event. */
    chargedProgrammeId: uuid("charged_programme_id").references(
      () => programme.id,
      { onDelete: "restrict" }
    ),
    /** Optional project under the charged programme. */
    chargedProjectId: uuid("charged_project_id"),
    /** Which work the expense served; see `expenseProgrammeOf`. */
    chargedTo: expenseChargedToEnum("charged_to").notNull(),
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
    /**
     * Set instead of the invoice number and date when the payment has no
     * invoice; the proof sits in the `invoice` attachments.
     */
    noInvoiceNote: text("no_invoice_note"),
    noInvoiceReason: vendorPaymentNoInvoiceReasonEnum("no_invoice_reason"),
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
    index("vendor_payment_chargedProgrammeId_idx").on(table.chargedProgrammeId),
    // A project must sit under the charged programme.
    foreignKey({
      columns: [table.chargedProjectId, table.chargedProgrammeId],
      foreignColumns: [project.id, project.programmeId],
      name: "vendor_payment_charged_project_programme_fk",
    }).onDelete("restrict"),
    check(
      "vendor_payment_charged_to_chk",
      sql`(${table.chargedTo} = 'event' AND ${table.eventId} IS NOT NULL AND ${table.chargedProgrammeId} IS NULL AND ${table.chargedProjectId} IS NULL) OR (${table.chargedTo} = 'programme' AND ${table.chargedProgrammeId} IS NOT NULL) OR (${table.chargedTo} = 'organisation' AND ${table.chargedProgrammeId} IS NULL AND ${table.chargedProjectId} IS NULL)`
    ),
    check(
      "vendor_payment_rejection_reason_chk",
      sql`((status = 'rejected'::vendor_payment_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::vendor_payment_status) AND (rejection_reason IS NULL))`
    ),
    check(
      "vendor_payment_invoice_or_no_invoice_chk",
      sql`${table.noInvoiceReason} IS NULL OR ${table.invoiceNumber} IS NULL`
    ),
  ]
);

export const vendorPaymentLineItem = pgTable(
  "vendor_payment_line_item",
  {
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
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
  party: one(party, {
    fields: [vendor.id],
    references: [party.id],
  }),
  vendorPayments: many(vendorPayment),
}));

export const vendorPaymentRelations = relations(
  vendorPayment,
  ({ one, many }) => ({
    attachments: many(vendorPaymentAttachment),
    chargedProgramme: one(programme, {
      fields: [vendorPayment.chargedProgrammeId],
      references: [programme.id],
    }),
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
