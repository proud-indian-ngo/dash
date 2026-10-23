import {
  grantDonationTypeValues,
  grantStatusValues,
} from "@pi-dash/shared/constants";
import {
  type UtilisationCertificateSnapshot,
  utilisationCertificateStatusValues,
} from "@pi-dash/shared/utilisation-certificates";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { accountHead, programme, project } from "./finance-dimensions";
import { governanceDocument, trustee } from "./governance";
import { contribution } from "./income";
import { jsonb } from "./jsonb";
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
    /** The agreement asks for a CA's certificate on each utilisation certificate. */
    needsCaCertificate: boolean("needs_ca_certificate")
      .default(false)
      .notNull(),
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
    // (btree_gist, daterange) lives in a custom migration, since Drizzle can't
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

export const utilisationCertificateStatusEnum = pgEnum(
  "utilisation_certificate_status",
  utilisationCertificateStatusValues
);

/**
 * A utilisation certificate for a period of a grant (finance-grants.md).
 * Its figures are frozen when finance prepares it and the PDF is rendered
 * once from them; each DSC signature appends to that file. Numbered
 * `UC/2026-27/001` from `private.utilisation_certificate_counter`, so the
 * series never skips: a discarded certificate keeps its number.
 */
export const utilisationCertificate = pgTable(
  "utilisation_certificate",
  {
    /** CA's UDIN, once finance records the CA's certificate. */
    caUdin: text("ca_udin"),
    /** The CA-countersigned PDF or the CA's separate report. */
    caFilename: text("ca_filename"),
    caObjectKey: text("ca_object_key"),
    caRecordedAt: timestamp("ca_recorded_at"),
    caRecordedBy: text("ca_recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Frozen from the grant at prepare: the certificate is final only after the CA step. */
    caRequired: boolean("ca_required").notNull(),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at"),
    cancelledBy: text("cancelled_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    /**
     * The long-term copy of the trustees' signed PDF (revocation data and a
     * document timestamp, PAdES B-LTA), made once both have signed. When the
     * certificate is final it moves to the vault document, which then holds
     * it and its yearly renewal.
     */
    archiveObjectKey: text("archive_object_key"),
    archiveSha256: text("archive_sha256"),
    archivedAt: timestamp("archived_at"),
    /** When the long-term copy needs its next document timestamp. */
    archiveRenewOn: date("archive_renew_on"),
    /** The vault document the final certificate is filed as. */
    documentId: uuid("document_id").references(() => governanceDocument.id, {
      onDelete: "restrict",
    }),
    financeSignedAt: timestamp("finance_signed_at"),
    /** Signs second, as Chief Finance Officer. */
    financeTrusteeId: uuid("finance_trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    /** "2026-27", of the day it was prepared. */
    fiscalYear: text("fiscal_year").notNull(),
    fromOn: date("from_on").notNull(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grantAgreement.id, { onDelete: "restrict" }),
    headSignedAt: timestamp("head_signed_at"),
    /** Signs first, as Head of the Organisation. */
    headTrusteeId: uuid("head_trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    /** Interest earned in the period, as finance entered it. */
    interestPaise: bigint("interest_paise", { mode: "number" }).notNull(),
    /** R2 key of the latest copy: the prepared PDF, then each signed one. */
    latestObjectKey: text("latest_object_key").notNull(),
    latestSha256: text("latest_sha256").notNull(),
    number: text("number").notNull(),
    preparedBy: text("prepared_by").references(() => user.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence").notNull(),
    snapshot: jsonb("snapshot")
      .$type<UtilisationCertificateSnapshot>()
      .notNull(),
    status: utilisationCertificateStatusEnum("status").notNull(),
    toOn: date("to_on").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    index("utilisation_certificate_grantId_idx").on(t.grantId),
    unique("utilisation_certificate_number_unique").on(t.number),
    unique("utilisation_certificate_sequence_unique").on(
      t.fiscalYear,
      t.sequence
    ),
    check(
      "utilisation_certificate_period_check",
      sql`${t.toOn} >= ${t.fromOn}`
    ),
    check(
      "utilisation_certificate_interest_check",
      sql`${t.interestPaise} >= 0`
    ),
    check(
      "utilisation_certificate_signers_check",
      sql`${t.headTrusteeId} <> ${t.financeTrusteeId}`
    ),
  ]
);

export const utilisationCertificateRelations = relations(
  utilisationCertificate,
  ({ one }) => ({
    financeTrustee: one(trustee, {
      fields: [utilisationCertificate.financeTrusteeId],
      references: [trustee.id],
      relationName: "utilisationCertificateFinance",
    }),
    grant: one(grantAgreement, {
      fields: [utilisationCertificate.grantId],
      references: [grantAgreement.id],
    }),
    headTrustee: one(trustee, {
      fields: [utilisationCertificate.headTrusteeId],
      references: [trustee.id],
      relationName: "utilisationCertificateHead",
    }),
  })
);

export const grantAgreementRelations = relations(
  grantAgreement,
  ({ many, one }) => ({
    budgetLines: many(grantBudgetLine),
    certificates: many(utilisationCertificate),
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
