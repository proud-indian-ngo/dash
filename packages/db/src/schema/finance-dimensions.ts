import {
  accountHeadTypeValues,
  fcraRoleValues,
  fundRestrictionValues,
  fundSourceValues,
  organisationRegistrationTypeValues,
  orgAccountKindValues,
  projectKindValues,
  projectStatusValues,
} from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { governanceDocument } from "./governance";
import { party } from "./party";

export const projectKindEnum = pgEnum("project_kind", projectKindValues);
export const projectStatusEnum = pgEnum("project_status", projectStatusValues);
export const fundSourceEnum = pgEnum("fund_source", fundSourceValues);
export const fundRestrictionEnum = pgEnum(
  "fund_restriction",
  fundRestrictionValues
);
export const accountHeadTypeEnum = pgEnum(
  "account_head_type",
  accountHeadTypeValues
);
export const orgAccountKindEnum = pgEnum(
  "org_account_kind",
  orgAccountKindValues
);
export const fcraRoleEnum = pgEnum("fcra_role", fcraRoleValues);
export const organisationRegistrationTypeEnum = pgEnum(
  "organisation_registration_type",
  organisationRegistrationTypeValues
);

/** Cause-based programme: the top-level unit for events and money. */
export const programme = pgTable(
  "programme",
  {
    active: boolean("active").default(true).notNull(),
    cause: text("cause"),
    code: text("code").notNull(),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    /** Overrides app_config finance_threshold_default_paise when set. */
    financeThresholdPaise: bigint("finance_threshold_paise", {
      mode: "number",
    }),
    id: uuid("id").primaryKey(),
    leadUserId: text("lead_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("programme_code_uidx").on(t.code),
    uniqueIndex("programme_name_uidx").on(t.name),
  ]
);

/** Time-boxed initiative under a programme: a class year, a Kalakriti edition, a drive, a corporate engagement. */
export const project = pgTable(
  "project",
  {
    code: text("code").notNull(),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    endsOn: date("ends_on"),
    id: uuid("id").primaryKey(),
    /** Platform that sourced an engagement (for example Goodera). */
    intermediaryPartyId: uuid("intermediary_party_id").references(
      () => party.id,
      { onDelete: "restrict" }
    ),
    kind: projectKindEnum("kind").default("other").notNull(),
    name: text("name").notNull(),
    programmeId: uuid("programme_id")
      .notNull()
      .references(() => programme.id, { onDelete: "restrict" }),
    quotedBudgetPaise: bigint("quoted_budget_paise", { mode: "number" }),
    reportDueOn: date("report_due_on"),
    /** Corporate or individual sponsoring an engagement. */
    sponsorPartyId: uuid("sponsor_party_id").references(() => party.id, {
      onDelete: "restrict",
    }),
    startsOn: date("starts_on"),
    status: projectStatusEnum("status").default("active").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("project_code_uidx").on(t.code),
    index("project_programmeId_idx").on(t.programmeId),
    // Target of the (project, programme) foreign keys on expenses, which
    // make the database refuse a project charged under another programme.
    unique("project_id_programme_id_unique").on(t.id, t.programmeId),
  ]
);

/** Pool of money with a source and restriction. */
export const fund = pgTable(
  "fund",
  {
    active: boolean("active").default(true).notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    /** Set when the fund is the designated pool of a grant agreement. */
    grantAgreementId: uuid("grant_agreement_id"),
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    restriction: fundRestrictionEnum("restriction")
      .default("unrestricted")
      .notNull(),
    source: fundSourceEnum("source").default("domestic").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [uniqueIndex("fund_code_uidx").on(t.code)]
);

/** Location dimension; replaces the city enum. */
export const costCentre = pgTable(
  "cost_centre",
  {
    active: boolean("active").default(true).notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    stateUt: text("state_ut"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [uniqueIndex("cost_centre_code_uidx").on(t.code)]
);

/** Natural account; replaces expense_category and maps to the CA's ledger names. */
export const accountHead = pgTable(
  "account_head",
  {
    active: boolean("active").default(true).notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => accountHead.id, {
      onDelete: "restrict",
    }),
    sortOrder: integer("sort_order").default(0).notNull(),
    tallyLedgerName: text("tally_ledger_name"),
    type: accountHeadTypeEnum("type").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("account_head_code_uidx").on(t.code),
    index("account_head_parentId_idx").on(t.parentId),
  ]
);

/** The organisation's own bank, cash and gateway clearing accounts. Bank details stay server-side. */
export const orgAccount = pgTable(
  "org_account",
  {
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").notNull(),
    fcraRole: fcraRoleEnum("fcra_role").default("none").notNull(),
    fundSource: fundSourceEnum("fund_source").default("domestic").notNull(),
    id: uuid("id").primaryKey(),
    /**
     * The main bank account (finance layer 3-3a): reimbursements and vendor
     * payments are paid out of it ("Out of the main bank account (the
     * trust deals in no cash)", finance-ledger-cutover.md section 3). At
     * most one, and only a bank account.
     */
    isMain: boolean("is_main").default(false).notNull(),
    kind: orgAccountKindEnum("kind").notNull(),
    name: text("name").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("org_account_name_uidx").on(t.name),
    uniqueIndex("org_account_is_main_uidx")
      .on(t.isMain)
      .where(sql`${t.isMain}`),
    check(
      "org_account_is_main_bank_chk",
      sql`NOT ${t.isMain} OR ${t.kind} = 'bank'`
    ),
  ]
);

/** April to March financial year. */
export const fiscalYear = pgTable(
  "fiscal_year",
  {
    /** Set by the year close; postings into a closed year are refused. */
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    endsOn: date("ends_on").notNull(),
    id: uuid("id").primaryKey(),
    /** For example "2026-27". */
    label: text("label").notNull(),
    startsOn: date("starts_on").notNull(),
  },
  (t) => [
    uniqueIndex("fiscal_year_label_uidx").on(t.label),
    check("fiscal_year_range_check", sql`${t.endsOn} > ${t.startsOn}`),
  ]
);

/** Monthly period inside a fiscal year; postings into a closed period are rejected. */
export const fiscalPeriod = pgTable(
  "fiscal_period",
  {
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    endsOn: date("ends_on").notNull(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    /** 1 to 12, counted from April. */
    month: integer("month").notNull(),
    startsOn: date("starts_on").notNull(),
  },
  (t) => [
    uniqueIndex("fiscal_period_year_month_uidx").on(t.fiscalYearId, t.month),
    index("fiscal_period_startsOn_idx").on(t.startsOn),
    check("fiscal_period_month_check", sql`${t.month} BETWEEN 1 AND 12`),
    check("fiscal_period_range_check", sql`${t.endsOn} >= ${t.startsOn}`),
  ]
);

/** The trust's own registrations needed on filings (PAN, 12AB, 80G, FCRA, ...). */
export const organisationRegistration = pgTable(
  "organisation_registration",
  {
    /** The certificate in the governance vault. */
    certificateDocumentId: uuid("certificate_document_id").references(
      () => governanceDocument.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    issuedOn: date("issued_on"),
    number: text("number").notNull(),
    /** Permitted activities and States/UTs for FCRA, or any scope note. */
    scopeNote: text("scope_note"),
    type: organisationRegistrationTypeEnum("type").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
  },
  (t) => [index("organisation_registration_type_idx").on(t.type)]
);

export const programmeRelations = relations(programme, ({ one, many }) => ({
  lead: one(user, { fields: [programme.leadUserId], references: [user.id] }),
  projects: many(project),
}));

export const projectRelations = relations(project, ({ one }) => ({
  programme: one(programme, {
    fields: [project.programmeId],
    references: [programme.id],
  }),
}));

export const accountHeadRelations = relations(accountHead, ({ one, many }) => ({
  children: many(accountHead, { relationName: "accountHeadParent" }),
  parent: one(accountHead, {
    fields: [accountHead.parentId],
    references: [accountHead.id],
    relationName: "accountHeadParent",
  }),
}));

export const fiscalYearRelations = relations(fiscalYear, ({ many }) => ({
  periods: many(fiscalPeriod),
}));

export const fiscalPeriodRelations = relations(fiscalPeriod, ({ one }) => ({
  fiscalYear: one(fiscalYear, {
    fields: [fiscalPeriod.fiscalYearId],
    references: [fiscalYear.id],
  }),
}));

export const organisationRegistrationRelations = relations(
  organisationRegistration,
  ({ one }) => ({
    certificate: one(governanceDocument, {
      fields: [organisationRegistration.certificateDocumentId],
      references: [governanceDocument.id],
    }),
  })
);
