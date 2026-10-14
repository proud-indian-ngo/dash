import {
  externalIdentityEntityTypeValues,
  externalIdentityProviderValues,
  importRowOutcomeValues,
  processingBasisValues,
} from "@pi-dash/shared/constants";
import {
  boolean,
  date,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { importBatch } from "../import-batch";
import { contribution } from "../income";
import { jsonb } from "../jsonb";
import { party } from "../party";
import { privateSchema } from "./party-private";

export const importRowOutcomeEnum = privateSchema.enum(
  "import_row_outcome",
  importRowOutcomeValues
);
export const externalIdentityProviderEnum = privateSchema.enum(
  "external_identity_provider",
  externalIdentityProviderValues
);
export const externalIdentityEntityTypeEnum = privateSchema.enum(
  "external_identity_entity_type",
  externalIdentityEntityTypeValues
);
export const processingBasisEnum = privateSchema.enum(
  "processing_basis",
  processingBasisValues
);

/**
 * Who issued an external payment ID and which contribution it became. The
 * only automatic dedupe for imports: the same identity with the same payload
 * links to the earlier contribution, a different payload is a conflict.
 * Survives the expiry of the raw rows that produced it.
 */
export const externalIdentity = privateSchema.table(
  "external_identity",
  {
    /** Deleting the contribution forgets the identity, so a re-upload imports it again. */
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contribution.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    entityType: externalIdentityEntityTypeEnum("entity_type").notNull(),
    /** The provider's ID, or for files without one a hash of the row's key fields. */
    externalId: text("external_id").notNull(),
    id: uuid("id").primaryKey(),
    /** Hash of the normalised fields that make up the contribution. */
    payloadHash: text("payload_hash").notNull(),
    provider: externalIdentityProviderEnum("provider").notNull(),
    /** Which account at the provider: the org account the money landed in. */
    providerAccount: text("provider_account").notNull(),
  },
  (t) => [
    uniqueIndex("external_identity_key_uidx").on(
      t.provider,
      t.providerAccount,
      t.entityType,
      t.externalId
    ),
    index("external_identity_contributionId_idx").on(t.contributionId),
  ]
);

/**
 * One row of an uploaded file, or one Razorpay payment. `raw` holds the row
 * as uploaded and is the only copy of the file; the retention job nulls it
 * (imported batches) or deletes the row (batches never imported) once
 * `retain_until` passes, unless `legal_hold` is set. A pending row is never
 * nulled: it still needs its values to be imported.
 */
export const importRow = privateSchema.table(
  "import_row",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatch.id, { onDelete: "cascade" }),
    contributionId: uuid("contribution_id").references(() => contribution.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    decidedAt: timestamp("decided_at"),
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    externalIdentityId: uuid("external_identity_id").references(
      () => externalIdentity.id,
      { onDelete: "set null" }
    ),
    id: uuid("id").primaryKey(),
    legalHold: boolean("legal_hold").default(false).notNull(),
    outcome: importRowOutcomeEnum("outcome").default("pending").notNull(),
    /** A short code such as "duplicate_skipped"; never row content. */
    outcomeReason: text("outcome_reason"),
    /** Why the parser could not read the row cleanly ("malformed_quotes", "extra_cells"); such rows can only be skipped. */
    parseIssue: text("parse_issue"),
    partyId: uuid("party_id").references(() => party.id, {
      onDelete: "set null",
    }),
    /** File column header to cell text; null once the retention job has run. */
    raw: jsonb("raw").$type<Record<string, string>>(),
    rawHash: text("raw_hash").notNull(),
    /** Null while a Razorpay payment waits for an outcome; set once it has one. */
    retainUntil: date("retain_until"),
    retentionBasis: text("retention_basis").notNull(),
    retentionPolicyVersion: text("retention_policy_version").notNull(),
    /** 1-based data row, not counting the header. */
    rowNumber: integer("row_number").notNull(),
  },
  (t) => [
    uniqueIndex("import_row_batch_row_uidx").on(t.batchId, t.rowNumber),
    index("import_row_retainUntil_idx").on(t.retainUntil),
  ]
);

/**
 * Why and how a party's personal data was collected (DPDP). Imports record
 * one per donor created or matched from a file.
 */
export const collectionEvent = privateSchema.table(
  "collection_event",
  {
    /** For example generic_csv or give_do_csv. */
    channel: text("channel").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    evidenceNote: text("evidence_note"),
    id: uuid("id").primaryKey(),
    importBatchId: uuid("import_batch_id").references(() => importBatch.id, {
      onDelete: "restrict",
    }),
    /** Null when the notice the person saw is not ours or not known. */
    noticeVersion: text("notice_version"),
    occurredAt: timestamp("occurred_at").notNull(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "restrict" }),
    processingBasis: processingBasisEnum("processing_basis").notNull(),
    purpose: text("purpose").notNull(),
  },
  (t) => [
    // One record per donor per import batch; also serves lookups by party.
    uniqueIndex("collection_event_party_batch_uidx").on(
      t.partyId,
      t.importBatchId
    ),
  ]
);
