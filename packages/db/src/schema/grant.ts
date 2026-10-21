import {
  grantDonationTypeValues,
  grantStatusValues,
} from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { accountHead, programme, project } from "./finance-dimensions";
import { contribution } from "./income";
import { party } from "./party";

export const grantDonationTypeEnum = pgEnum(
  "grant_donation_type",
  grantDonationTypeValues
);
export const grantStatusEnum = pgEnum("grant_status", grantStatusValues);

/**
 * A grant agreement (CSR or a specific grant) that funds one project. It
 * tracks existing income and expense and never posts: money stays in the
 * General Fund. Received money is the contributions linked to it; spending
 * is the project's expense in the books within its period. Named
 * `grant_agreement` because GRANT is reserved in SQL.
 */
export const grantAgreement = pgTable(
  "grant_agreement",
  {
    /** The signed agreement, an R2 key under `attachments/grants/<id>/`. */
    agreementFilename: text("agreement_filename"),
    agreementMimeType: text("agreement_mime_type"),
    agreementObjectKey: text("agreement_object_key"),
    agreementOn: date("agreement_on"),
    agreementReference: text("agreement_reference"),
    createdAt: timestamp("created_at").notNull(),
    donationType: grantDonationTypeEnum("donation_type").notNull(),
    endsOn: date("ends_on").notNull(),
    id: uuid("id").primaryKey(),
    notes: text("notes"),
    /** The grantor: a party with a donor, sponsor or grantor role. */
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "restrict" }),
    programmeId: uuid("programme_id")
      .notNull()
      .references(() => programme.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").notNull(),
    sanctionedPaise: bigint("sanctioned_paise", { mode: "number" }).notNull(),
    /** The Schedule VII item the agreement names, as written there. */
    scheduleViiItem: text("schedule_vii_item"),
    startsOn: date("starts_on").notNull(),
    status: grantStatusEnum("status").default("active").notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    // A grant funds one project; a project's grants never overlap in time.
    // The exclusion constraint `grant_agreement_project_period_excl`
    // (btree_gist, daterange) lives in the custom migration 0184_grant_period_exclusion, since Drizzle can't
    // declare one.
    index("grant_agreement_projectId_idx").on(t.projectId),
    foreignKey({
      columns: [t.projectId, t.programmeId],
      foreignColumns: [project.id, project.programmeId],
      name: "grant_agreement_project_programme_fk",
    }).onDelete("restrict"),
    // Target of the contribution link, which must match the grantor and project.
    unique("grant_agreement_link_unique").on(
      t.id,
      t.partyId,
      t.programmeId,
      t.projectId
    ),
    index("grant_agreement_partyId_idx").on(t.partyId),
    check("grant_agreement_sanctioned_positive", sql`${t.sanctionedPaise} > 0`),
    check("grant_agreement_period_check", sql`${t.endsOn} >= ${t.startsOn}`),
  ]
);

/** One expected instalment of a grant. Money received is linked contributions. */
export const grantTranche = pgTable(
  "grant_tranche",
  {
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    expectedOn: date("expected_on").notNull(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grantAgreement.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    note: text("note"),
  },
  (t) => [
    index("grant_tranche_grantId_idx").on(t.grantId),
    // Target of the contribution's (tranche, grant) foreign key.
    unique("grant_tranche_id_grant_unique").on(t.id, t.grantId),
    check("grant_tranche_amount_positive", sql`${t.amountPaise} > 0`),
  ]
);

/** One expense head's amount in a grant's budget. A head without a line has no budget. */
export const grantBudgetLine = pgTable(
  "grant_budget_line",
  {
    accountHeadId: uuid("account_head_id")
      .notNull()
      .references(() => accountHead.id, { onDelete: "restrict" }),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grantAgreement.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
  },
  (t) => [
    unique("grant_budget_line_grant_head_unique").on(
      t.grantId,
      t.accountHeadId
    ),
    check("grant_budget_line_amount_check", sql`${t.amountPaise} >= 0`),
  ]
);

export const grantAgreementRelations = relations(
  grantAgreement,
  ({ many, one }) => ({
    budgetLines: many(grantBudgetLine),
    contributions: many(contribution),
    party: one(party, {
      fields: [grantAgreement.partyId],
      references: [party.id],
    }),
    programme: one(programme, {
      fields: [grantAgreement.programmeId],
      references: [programme.id],
    }),
    project: one(project, {
      fields: [grantAgreement.projectId],
      references: [project.id],
    }),
    tranches: many(grantTranche),
  })
);

export const grantTrancheRelations = relations(grantTranche, ({ one }) => ({
  grant: one(grantAgreement, {
    fields: [grantTranche.grantId],
    references: [grantAgreement.id],
  }),
}));

export const grantBudgetLineRelations = relations(
  grantBudgetLine,
  ({ one }) => ({
    grant: one(grantAgreement, {
      fields: [grantBudgetLine.grantId],
      references: [grantAgreement.id],
    }),
  })
);
