import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
import {
  attachmentTypeEnum,
  cityEnum,
  expenseChargedToEnum,
  historyActionEnum,
} from "./shared";
import { teamEvent } from "./team-event";

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
    approvalScreenshotKey: text("approval_screenshot_key"),
    bankAccountIfscCode: text("bank_account_ifsc_code"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    /** Programme the expense is charged to when it has no event. */
    chargedProgrammeId: uuid("charged_programme_id").references(
      () => programme.id,
      { onDelete: "restrict" }
    ),
    /** Optional project under the charged programme. */
    chargedProjectId: uuid("charged_project_id"),
    /** Which work the expense served; see `expenseProgrammeOf`. */
    chargedTo: expenseChargedToEnum("charged_to").notNull(),
    city: cityEnum("city"),
    createdAt: timestamp("created_at").notNull(),
    eventId: uuid("event_id").references(() => teamEvent.id, {
      onDelete: "set null",
    }),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    id: uuid("id").primaryKey(),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: reimbursementStatusEnum("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("reimbursement_userId_idx").on(table.userId),
    index("reimbursement_status_idx").on(table.status),
    index("reimbursement_eventId_idx").on(table.eventId),
    index("reimbursement_chargedProgrammeId_idx").on(table.chargedProgrammeId),
    // A project must sit under the charged programme.
    foreignKey({
      columns: [table.chargedProjectId, table.chargedProgrammeId],
      foreignColumns: [project.id, project.programmeId],
      name: "reimbursement_charged_project_programme_fk",
    }).onDelete("restrict"),
    check(
      "reimbursement_charged_to_chk",
      sql`(${table.chargedTo} = 'event' AND ${table.eventId} IS NOT NULL AND ${table.chargedProgrammeId} IS NULL AND ${table.chargedProjectId} IS NULL) OR (${table.chargedTo} = 'programme' AND ${table.eventId} IS NULL AND ${table.chargedProgrammeId} IS NOT NULL) OR (${table.chargedTo} = 'organisation' AND ${table.eventId} IS NULL AND ${table.chargedProgrammeId} IS NULL AND ${table.chargedProjectId} IS NULL)`
    ),
    check(
      "reimbursement_rejection_reason_chk",
      sql`((status = 'rejected'::reimbursement_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::reimbursement_status) AND (rejection_reason IS NULL))`
    ),
  ]
);

export const reimbursementLineItem = pgTable(
  "reimbursement_line_item",
  {
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategory.id),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    generateVoucher: boolean("generate_voucher").default(false).notNull(),
    id: uuid("id").primaryKey(),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursement.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    voucherAttachmentId: uuid("voucher_attachment_id").references(
      () => reimbursementAttachment.id,
      { onDelete: "set null" }
    ),
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
    createdAt: timestamp("created_at").notNull(),
    filename: text("filename"),
    id: uuid("id").primaryKey(),
    mimeType: text("mime_type"),
    objectKey: text("object_key"),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursement.id, { onDelete: "cascade" }),
    type: attachmentTypeEnum("type").notNull(),
    url: text("url"),
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
    action: historyActionEnum("action").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    metadata: jsonb("metadata"),
    note: text("note"),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursement.id, { onDelete: "cascade" }),
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
    attachments: many(reimbursementAttachment),
    chargedProgramme: one(programme, {
      fields: [reimbursement.chargedProgrammeId],
      references: [programme.id],
    }),
    event: one(teamEvent, {
      fields: [reimbursement.eventId],
      references: [teamEvent.id],
    }),
    history: many(reimbursementHistory),
    lineItems: many(reimbursementLineItem),
    reviewer: one(user, {
      fields: [reimbursement.reviewedBy],
      references: [user.id],
      relationName: "reimbursement_reviewer",
    }),
    user: one(user, {
      fields: [reimbursement.userId],
      references: [user.id],
    }),
  })
);

export const reimbursementLineItemRelations = relations(
  reimbursementLineItem,
  ({ one }) => ({
    category: one(expenseCategory, {
      fields: [reimbursementLineItem.categoryId],
      references: [expenseCategory.id],
    }),
    reimbursement: one(reimbursement, {
      fields: [reimbursementLineItem.reimbursementId],
      references: [reimbursement.id],
    }),
    voucherAttachment: one(reimbursementAttachment, {
      fields: [reimbursementLineItem.voucherAttachmentId],
      references: [reimbursementAttachment.id],
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
    actor: one(user, {
      fields: [reimbursementHistory.actorId],
      references: [user.id],
    }),
    reimbursement: one(reimbursement, {
      fields: [reimbursementHistory.reimbursementId],
      references: [reimbursement.id],
    }),
  })
);
