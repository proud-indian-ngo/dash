import {
  contributionChannelValues,
  contributionReportingModeValues,
  contributionSourceValues,
  contributionStatusValues,
  deductionEligibleValues,
  donationTypeValues,
  otherIncomeKindValues,
} from "@pi-dash/shared/constants";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { fund, orgAccount, programme, project } from "./finance-dimensions";
import { party } from "./party";

export const contributionChannelEnum = pgEnum(
  "contribution_channel",
  contributionChannelValues
);
export const contributionReportingModeEnum = pgEnum(
  "contribution_reporting_mode",
  contributionReportingModeValues
);
export const donationTypeEnum = pgEnum("donation_type", donationTypeValues);
export const deductionEligibleEnum = pgEnum(
  "deduction_eligible",
  deductionEligibleValues
);
export const contributionStatusEnum = pgEnum(
  "contribution_status",
  contributionStatusValues
);
export const contributionSourceEnum = pgEnum(
  "contribution_source",
  contributionSourceValues
);
export const otherIncomeKindEnum = pgEnum(
  "other_income_kind",
  otherIncomeKindValues
);

/**
 * A gift received from a donor party. Phase 2 records it as a staging
 * document only: no receipt number and no posting until the posting layer
 * ships. Donor contact and ID details stay in `party_private`.
 */
export const contribution = pgTable(
  "contribution",
  {
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    channel: contributionChannelEnum("channel").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    currency: text("currency").default("INR").notNull(),
    deductionEligible: deductionEligibleEnum("deduction_eligible")
      .default("unknown")
      .notNull(),
    donationType: donationTypeEnum("donation_type")
      .default("voluntary")
      .notNull(),
    /** Required when donation_type is other. */
    donationTypeDescription: text("donation_type_description"),
    eligibilityReason: text("eligibility_reason"),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => fund.id, { onDelete: "restrict" }),
    gatewayFeePaise: bigint("gateway_fee_paise", { mode: "number" })
      .default(0)
      .notNull(),
    gatewayTaxPaise: bigint("gateway_tax_paise", { mode: "number" })
      .default(0)
      .notNull(),
    id: uuid("id").primaryKey(),
    inKindDescription: text("in_kind_description"),
    inKindValuationBasis: text("in_kind_valuation_basis"),
    /** Platform the gift came through (give.do, a donor-advised fund). */
    intermediaryPartyId: uuid("intermediary_party_id").references(
      () => party.id,
      { onDelete: "restrict" }
    ),
    notes: text("notes"),
    /** Null only for in-kind gifts, which never touch an account. */
    orgAccountId: uuid("org_account_id").references(() => orgAccount.id, {
      onDelete: "restrict",
    }),
    originalAmountPaise: bigint("original_amount_paise", { mode: "number" }),
    originalCurrency: text("original_currency"),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "restrict" }),
    programmeId: uuid("programme_id").references(() => programme.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "restrict",
    }),
    receivedOn: date("received_on").notNull(),
    /** UTR, cheque number or gateway payment id. */
    reference: text("reference"),
    reportingMode: contributionReportingModeEnum("reporting_mode").notNull(),
    /** Required when reporting_mode is other. */
    reportingModeDescription: text("reporting_mode_description"),
    source: contributionSourceEnum("source").default("manual").notNull(),
    status: contributionStatusEnum("status").default("received").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    index("contribution_partyId_idx").on(t.partyId),
    index("contribution_receivedOn_idx").on(t.receivedOn),
    index("contribution_status_idx").on(t.status),
    check("contribution_amount_positive", sql`${t.amountPaise} > 0`),
    check(
      "contribution_gateway_charges_nonnegative",
      sql`${t.gatewayFeePaise} >= 0 AND ${t.gatewayTaxPaise} >= 0`
    ),
    check(
      "contribution_account_unless_in_kind",
      sql`${t.channel} = 'in_kind' OR ${t.orgAccountId} IS NOT NULL`
    ),
  ]
);

/** Interest, grant returns and other income that is not a donation. */
export const otherIncome = pgTable(
  "other_income",
  {
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => fund.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    kind: otherIncomeKindEnum("kind").notNull(),
    orgAccountId: uuid("org_account_id")
      .notNull()
      .references(() => orgAccount.id, { onDelete: "restrict" }),
    receivedOn: date("received_on").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    index("other_income_receivedOn_idx").on(t.receivedOn),
    check("other_income_amount_positive", sql`${t.amountPaise} > 0`),
  ]
);

export const contributionRelations = relations(contribution, ({ one }) => ({
  createdByUser: one(user, {
    fields: [contribution.createdBy],
    references: [user.id],
  }),
  fund: one(fund, { fields: [contribution.fundId], references: [fund.id] }),
  intermediary: one(party, {
    fields: [contribution.intermediaryPartyId],
    references: [party.id],
    relationName: "contributionIntermediary",
  }),
  orgAccount: one(orgAccount, {
    fields: [contribution.orgAccountId],
    references: [orgAccount.id],
  }),
  party: one(party, {
    fields: [contribution.partyId],
    references: [party.id],
    relationName: "contributionDonor",
  }),
  programme: one(programme, {
    fields: [contribution.programmeId],
    references: [programme.id],
  }),
  project: one(project, {
    fields: [contribution.projectId],
    references: [project.id],
  }),
}));

export const otherIncomeRelations = relations(otherIncome, ({ one }) => ({
  createdByUser: one(user, {
    fields: [otherIncome.createdBy],
    references: [user.id],
  }),
  fund: one(fund, { fields: [otherIncome.fundId], references: [fund.id] }),
  orgAccount: one(orgAccount, {
    fields: [otherIncome.orgAccountId],
    references: [orgAccount.id],
  }),
}));
