import {
  type DeclaredInterest,
  declarationStatusValues,
  policyAudienceValues,
} from "@pi-dash/shared/declarations";
import { relations, sql } from "drizzle-orm";
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
import { governanceDocument, trustee } from "./governance";
import { jsonb } from "./jsonb";

/**
 * Yearly conflict-of-interest declarations and the policy register.
 * Rules in packages/shared/src/declarations.ts.
 */

export const conflictDeclarationStatusEnum = pgEnum(
  "conflict_declaration_status",
  declarationStatusValues
);

/**
 * A trustee's declaration for one financial year. It counts once they sign
 * it with their DSC, and the last signed one counts; declaring again
 * replaces the one waiting for their signature.
 */
export const conflictDeclaration = pgTable(
  "conflict_declaration",
  {
    createdAt: timestamp("created_at").notNull(),
    declaredAt: timestamp("declared_at").notNull(),
    declaredBy: text("declared_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** The signed PDF in the vault. */
    documentId: uuid("document_id").references(() => governanceDocument.id, {
      onDelete: "restrict",
    }),
    /** "2026-27". */
    fiscalYear: text("fiscal_year").notNull(),
    id: uuid("id").primaryKey(),
    interests: jsonb("interests").$type<DeclaredInterest[]>().notNull(),
    nothingToDeclare: boolean("nothing_to_declare").notNull(),
    /** R2 key of the generated PDF the trustee signs. */
    objectKey: text("object_key"),
    /** Of the generated PDF, so a signature is accepted only on that copy. */
    sha256: text("sha256"),
    status: conflictDeclarationStatusEnum("status").notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    index("conflict_declaration_trustee_year_idx").on(
      t.trusteeId,
      t.fiscalYear
    ),
    uniqueIndex("conflict_declaration_awaiting_uidx")
      .on(t.trusteeId, t.fiscalYear)
      .where(sql`${t.status} = 'awaiting_signature'`),
  ]
);

export const policyAudienceEnum = pgEnum(
  "policy_audience",
  policyAudienceValues
);

export const policy = pgTable(
  "policy",
  {
    audience: policyAudienceEnum("audience").default("everyone").notNull(),
    createdAt: timestamp("created_at").notNull(),
    description: text("description"),
    /** Volunteers must acknowledge the version in force before joining events with children. */
    gatesChildren: boolean("gates_children").default(false).notNull(),
    id: uuid("id").primaryKey(),
    /** Stable key for policies the app knows about (child safeguarding). */
    key: text("key"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [uniqueIndex("policy_key_uidx").on(t.key)]
);

export const policyVersion = pgTable(
  "policy_version",
  {
    /** The approved policy in the vault. */
    documentId: uuid("document_id")
      .notNull()
      .references(() => governanceDocument.id, { onDelete: "restrict" }),
    effectiveOn: date("effective_on").notNull(),
    id: uuid("id").primaryKey(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policy.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at").notNull(),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** What changed, shown with the acknowledgement. */
    summary: text("summary"),
    version: integer("version").notNull(),
  },
  (t) => [uniqueIndex("policy_version_uidx").on(t.policyId, t.version)]
);

export const policyAcknowledgement = pgTable(
  "policy_acknowledgement",
  {
    acknowledgedAt: timestamp("acknowledged_at").notNull(),
    id: uuid("id").primaryKey(),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => policyVersion.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("policy_acknowledgement_uidx").on(t.policyVersionId, t.userId),
    index("policy_acknowledgement_user_idx").on(t.userId),
  ]
);

export const conflictDeclarationRelations = relations(
  conflictDeclaration,
  ({ one }) => ({
    document: one(governanceDocument, {
      fields: [conflictDeclaration.documentId],
      references: [governanceDocument.id],
    }),
    trustee: one(trustee, {
      fields: [conflictDeclaration.trusteeId],
      references: [trustee.id],
    }),
  })
);

export const policyRelations = relations(policy, ({ many }) => ({
  versions: many(policyVersion),
}));

export const policyVersionRelations = relations(
  policyVersion,
  ({ many, one }) => ({
    acknowledgements: many(policyAcknowledgement),
    document: one(governanceDocument, {
      fields: [policyVersion.documentId],
      references: [governanceDocument.id],
    }),
    policy: one(policy, {
      fields: [policyVersion.policyId],
      references: [policy.id],
    }),
  })
);

export const policyAcknowledgementRelations = relations(
  policyAcknowledgement,
  ({ one }) => ({
    user: one(user, {
      fields: [policyAcknowledgement.userId],
      references: [user.id],
    }),
    version: one(policyVersion, {
      fields: [policyAcknowledgement.policyVersionId],
      references: [policyVersion.id],
    }),
  })
);
