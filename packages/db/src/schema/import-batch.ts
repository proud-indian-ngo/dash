import {
  importBatchSourceValues,
  importBatchStatusValues,
} from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { fund, orgAccount, programme, project } from "./finance-dimensions";
import { jsonb } from "./jsonb";

export const importBatchSourceEnum = pgEnum(
  "import_batch_source",
  importBatchSourceValues
);
export const importBatchStatusEnum = pgEnum(
  "import_batch_status",
  importBatchStatusValues
);

/** File column header to the pi-dash field it fills, or "ignore". */
export type ImportMapping = Record<string, string>;

/**
 * One uploaded file of contributions, or one India day of Razorpay payments
 * (`razorpay_api`). Syncs through Zero for the Imports tab, so it holds
 * settings and counts only: the rows themselves live in the server-only
 * `private.import_row`.
 */
export const importBatch = pgTable(
  "import_batch",
  {
    completedAt: timestamp("completed_at"),
    conflictCount: integer("conflict_count").default(0).notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** Contribution channel for rows whose file has no channel column (text: the enum lives with contributions). */
    defaultChannel: text("default_channel").notNull(),
    /** dmy, ymd or mdy; how the file writes dates, chosen at mapping. */
    dateFormat: text("date_format"),
    errorCount: integer("error_count").default(0).notNull(),
    /** Hash of the uploaded file; for Razorpay batches the batch key (mode and day). */
    fileHash: text("file_hash").notNull(),
    fileName: text("file_name").notNull(),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => fund.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    importedCount: integer("imported_count").default(0).notNull(),
    linkedCount: integer("linked_count").default(0).notNull(),
    mapping: jsonb("mapping").$type<ImportMapping>(),
    newDonorCount: integer("new_donor_count").default(0).notNull(),
    /** Null only for a Razorpay batch opened before the clearing account was chosen. */
    orgAccountId: uuid("org_account_id").references(() => orgAccount.id, {
      onDelete: "restrict",
    }),
    parserVersion: integer("parser_version").notNull(),
    /** Rows waiting for a reviewer's decision (needs review, left undecided, or no clearing account). */
    pendingCount: integer("pending_count").default(0).notNull(),
    programmeId: uuid("programme_id").references(() => programme.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    rowCount: integer("row_count").notNull(),
    skippedCount: integer("skipped_count").default(0).notNull(),
    source: importBatchSourceEnum("source").notNull(),
    status: importBatchStatusEnum("status").default("draft").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("import_batch_createdAt_idx").on(t.createdAt),
    index("import_batch_source_idx").on(t.source),
    check(
      "import_batch_account_unless_razorpay",
      // Compared as text: a new enum value cannot be used in the migration that adds it.
      sql`${t.source}::text = 'razorpay_api' OR ${t.orgAccountId} IS NOT NULL`
    ),
  ]
);

export const importBatchRelations = relations(importBatch, ({ one }) => ({
  fund: one(fund, { fields: [importBatch.fundId], references: [fund.id] }),
  orgAccount: one(orgAccount, {
    fields: [importBatch.orgAccountId],
    references: [orgAccount.id],
  }),
  programme: one(programme, {
    fields: [importBatch.programmeId],
    references: [programme.id],
  }),
  project: one(project, {
    fields: [importBatch.projectId],
    references: [project.id],
  }),
  uploadedByUser: one(user, {
    fields: [importBatch.uploadedBy],
    references: [user.id],
  }),
}));
