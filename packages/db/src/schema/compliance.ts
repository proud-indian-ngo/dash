import {
  complianceItemStatusValues,
  complianceRuleKindValues,
  type YearDay,
} from "@pi-dash/shared/compliance";
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { governanceDocument } from "./governance";
import { jsonb } from "./jsonb";

/**
 * The compliance calendar (governance phase 4). Templates say what recurs;
 * a daily job creates one item per occurrence, idempotently by source key.
 * An item closes only with evidence from the governance vault.
 */

export const complianceRuleKindEnum = pgEnum(
  "compliance_rule_kind",
  complianceRuleKindValues
);
export const complianceItemStatusEnum = pgEnum(
  "compliance_item_status",
  complianceItemStatusValues
);

export const complianceTemplate = pgTable(
  "compliance_template",
  {
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** For "yearly": the days it falls due in each financial year. */
    dates: jsonb("dates").$type<YearDay[] | null>(),
    description: text("description"),
    id: uuid("id").primaryKey(),
    /** Stable key; the default calendar is ensured by it. */
    key: text("key").notNull(),
    kind: complianceRuleKindEnum("kind").notNull(),
    /** For "registration" and "term_end": days from the expiry or last day. */
    offsetDays: integer("offset_days"),
    /** Who does it; empty means everyone with governance.manage. */
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** For "registration": the registration type it follows. */
    registrationType: text("registration_type"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [uniqueIndex("compliance_template_key_uidx").on(t.key)]
);

export const complianceItem = pgTable(
  "compliance_item",
  {
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    dueOn: date("due_on").notNull(),
    evidenceDocumentId: uuid("evidence_document_id").references(
      () => governanceDocument.id,
      { onDelete: "restrict" }
    ),
    fiscalYear: text("fiscal_year").notNull(),
    id: uuid("id").primaryKey(),
    note: text("note"),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** template key and period; null for an item added by hand. */
    sourceKey: text("source_key"),
    status: complianceItemStatusEnum("status").default("open").notNull(),
    templateId: uuid("template_id").references(() => complianceTemplate.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("compliance_item_source_uidx").on(t.sourceKey),
    index("compliance_item_due_idx").on(t.status, t.dueOn),
  ]
);

export const complianceTemplateRelations = relations(
  complianceTemplate,
  ({ many, one }) => ({
    items: many(complianceItem),
    owner: one(user, {
      fields: [complianceTemplate.ownerUserId],
      references: [user.id],
    }),
  })
);

export const complianceItemRelations = relations(complianceItem, ({ one }) => ({
  evidence: one(governanceDocument, {
    fields: [complianceItem.evidenceDocumentId],
    references: [governanceDocument.id],
  }),
  template: one(complianceTemplate, {
    fields: [complianceItem.templateId],
    references: [complianceTemplate.id],
  }),
}));
