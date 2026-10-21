import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { contribution } from "../income";
import { party } from "../party";
import { partyIdTypeEnum, privateSchema } from "./party-private";

/**
 * Donations return filings (Form 113) and the Form 114 certificates the
 * portal returns for them. Server only: rows hold each donor's name,
 * address and ID number (encrypted), and the files are private R2 objects
 * read through audited routes. See finance-receipts-and-returns.md.
 */

export const donationFilingStatusEnum = privateSchema.enum(
  "donation_filing_status",
  ["prepared", "submitted", "discarded"]
);

export const donationCertificateMatchEnum = privateSchema.enum(
  "donation_certificate_match",
  ["pre_arn", "details"]
);

export const donationCertificateEmailFailureEnum = privateSchema.enum(
  "donation_certificate_email_failure",
  ["no_email", "suppressed", "not_configured", "failed"]
);

/**
 * One Form 113 upload. Recording it freezes the rows and keeps the exact
 * upload file; finance then records the portal's acknowledgement number and
 * transaction ID. A prepared filing may be discarded, which frees its gifts
 * but keeps its number and Pre-ARNs so neither is ever reused.
 */
export const donationFiling = privateSchema.table(
  "donation_filing",
  {
    acknowledgementNumber: text("acknowledgement_number"),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    discardedAt: timestamp("discarded_at"),
    discardedBy: text("discarded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name").notNull(),
    fileObjectKey: text("file_object_key").notNull(),
    fileSha256: text("file_sha256").notNull(),
    /** The day the portal accepted the upload, as on its acknowledgement. */
    filedOn: date("filed_on"),
    /** "2026-27". */
    fiscalYear: text("fiscal_year").notNull(),
    giftCount: integer("gift_count").notNull(),
    id: uuid("id").primaryKey(),
    rowCount: integer("row_count").notNull(),
    /** Filing number within the year, from 1; never reused. */
    sequence: integer("sequence").notNull(),
    status: donationFilingStatusEnum("status").default("prepared").notNull(),
    submittedAt: timestamp("submitted_at"),
    submittedBy: text("submitted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    transactionId: text("transaction_id"),
  },
  (t) => [
    uniqueIndex("donation_filing_fy_sequence_uidx").on(
      t.fiscalYear,
      t.sequence
    ),
    uniqueIndex("donation_filing_object_key_uidx").on(t.fileObjectKey),
    check(
      "donation_filing_submitted_fields",
      sql`(${t.status} = 'submitted') = (${t.filedOn} IS NOT NULL AND ${t.acknowledgementNumber} IS NOT NULL AND ${t.transactionId} IS NOT NULL)`
    ),
    check(
      "donation_filing_discarded_fields",
      sql`(${t.status} = 'discarded') = (${t.discardedAt} IS NOT NULL)`
    ),
    check("donation_filing_sequence_positive", sql`${t.sequence} > 0`),
  ]
);

/**
 * A row of the upload file, frozen when the filing is recorded: what it
 * printed about the donor, with the ID number encrypted under the row's ID.
 * Never updated.
 */
export const donationFilingRow = privateSchema.table(
  "donation_filing_row",
  {
    address: text("address").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull(),
    donationTypeCode: text("donation_type_code").notNull(),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => donationFiling.id, { onDelete: "restrict" }),
    giftCount: integer("gift_count").notNull(),
    id: uuid("id").primaryKey(),
    idCode: text("id_code").notNull(),
    /** Encrypted with DATA_ENCRYPTION_KEY, bound to the row ID. */
    idNumberEncrypted: text("id_number_encrypted").notNull(),
    idNumberLast4: text("id_number_last4"),
    idType: partyIdTypeEnum("id_type").notNull(),
    modeCode: text("mode_code").notNull(),
    name: text("name").notNull(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "restrict" }),
    /** The portal-issued Pre-Acknowledgement Number written on the row; null when the column was left empty. */
    preArn: text("pre_arn"),
    /** "Sr. No." in the upload file, from 1. */
    srNo: integer("sr_no").notNull(),
  },
  (t) => [
    uniqueIndex("donation_filing_row_pre_arn_uidx").on(t.preArn),
    uniqueIndex("donation_filing_row_filing_sr_uidx").on(t.filingId, t.srNo),
    index("donation_filing_row_partyId_idx").on(t.partyId),
  ]
);

/**
 * Which gifts a live filing row adds up. The gift is the key, so a gift
 * sits in at most one filing; discarding a filing deletes its links.
 */
export const donationFilingGift = privateSchema.table(
  "donation_filing_gift",
  {
    /** The gift's net amount as filed, so later changes show as drift. */
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    contributionId: uuid("contribution_id")
      .primaryKey()
      .references(() => contribution.id, { onDelete: "restrict" }),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => donationFiling.id, { onDelete: "restrict" }),
    rowId: uuid("row_id")
      .notNull()
      .references(() => donationFilingRow.id, { onDelete: "restrict" }),
  },
  (t) => [index("donation_filing_gift_rowId_idx").on(t.rowId)]
);

/**
 * A Form 114 certificate the portal generated for one filing row, stored as
 * the portal's PDF. Email state: queueing sets `emailRequestId` (one per
 * send, so a deliberate resend is a new email and a retry is not); the job
 * stamps `emailedAt` or `emailFailure`.
 */
export const donationCertificate = privateSchema.table(
  "donation_certificate",
  {
    /** The certificate's own acknowledgement number, needed for revisions. */
    acknowledgementNumber: text("acknowledgement_number").notNull(),
    /**
     * When finance confirmed the match. A Pre-ARN match is confirmed as it
     * is stored; a details match waits for review and is never emailed
     * until confirmed.
     */
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: text("confirmed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    emailedAt: timestamp("emailed_at"),
    emailFailure: donationCertificateEmailFailureEnum("email_failure"),
    emailQueuedAt: timestamp("email_queued_at"),
    emailRequestId: uuid("email_request_id"),
    /** The file's name as uploaded (inside the ZIP, if any). */
    fileName: text("file_name").notNull(),
    fileObjectKey: text("file_object_key").notNull(),
    fileSha256: text("file_sha256").notNull(),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => donationFiling.id, { onDelete: "restrict" }),
    id: uuid("id").primaryKey(),
    matchedBy: donationCertificateMatchEnum("matched_by").notNull(),
    rowId: uuid("row_id")
      .notNull()
      .references(() => donationFilingRow.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("donation_certificate_row_uidx").on(t.rowId),
    uniqueIndex("donation_certificate_ack_uidx").on(t.acknowledgementNumber),
    uniqueIndex("donation_certificate_object_key_uidx").on(t.fileObjectKey),
    index("donation_certificate_filingId_idx").on(t.filingId),
  ]
);
