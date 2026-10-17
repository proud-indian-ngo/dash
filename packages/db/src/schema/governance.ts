import {
  castingVoteRuleValues,
  governanceDocumentFormatValues,
  governanceDocumentKindValues,
  quorumKindValues,
  resolutionThresholdValues,
  trusteeCessationBasisValues,
  trusteeOfficeValues,
  trusteeTermBasisValues,
} from "@pi-dash/shared/governance";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
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
import { jsonb } from "./jsonb";

/**
 * Governance: the trustee register, the deed's rules by version, and the
 * vault of the trust's constitutional documents. See
 * docs/architecture/governance.md. Rows sync through Zero to
 * `governance.view`; PAN and Aadhaar live in `private.trustee_private`.
 */

export const trusteeOfficeEnum = pgEnum(
  "trustee_office_kind",
  trusteeOfficeValues
);
export const trusteeTermBasisEnum = pgEnum(
  "trustee_term_basis",
  trusteeTermBasisValues
);
export const trusteeCessationBasisEnum = pgEnum(
  "trustee_cessation_basis",
  trusteeCessationBasisValues
);
export const governanceDocumentKindEnum = pgEnum(
  "governance_document_kind",
  governanceDocumentKindValues
);
export const governanceDocumentFormatEnum = pgEnum(
  "governance_document_format",
  governanceDocumentFormatValues
);
export const quorumKindEnum = pgEnum("quorum_kind", quorumKindValues);
export const castingVoteRuleEnum = pgEnum(
  "casting_vote_rule",
  castingVoteRuleValues
);
export const resolutionThresholdEnum = pgEnum(
  "resolution_threshold",
  resolutionThresholdValues
);

/** Signature check the signing service ran on a signed PDF; IDs and certificate facts only. */
export interface GovernanceValidationReport {
  /** "valid" when every signature is intact and covers its revision; otherwise why not. */
  status: "valid" | "invalid" | "no_signatures" | "unavailable";
  checkedAt: string;
  signatures: {
    fieldName: string;
    signerName: string | null;
    subject: string;
    issuer: string;
    serial: string;
    sha256Fingerprint: string;
    notBefore: string | null;
    notAfter: string | null;
    signingTime: string | null;
    timestamped: boolean;
    intact: boolean;
    /** The signer's certificate chains to one of the configured roots. */
    trusted: boolean;
    /** The signature covers the whole file as it was when signed. */
    coversWholeRevision: boolean;
    /** Changes made after this signature, as pyHanko reports them. */
    modificationLevel: string | null;
    /** Trustee whose name matches the certificate, when one does. */
    matchedTrusteeId: string | null;
  }[];
  /** Email headers for an .eml; never the body. */
  email?: {
    from: string | null;
    to: string | null;
    date: string | null;
    subject: string | null;
    messageId: string | null;
    dkimSigned: boolean;
    attachments: string[];
  };
  message?: string;
}

/** A file in the governance vault: deeds, certificates, resolutions, resignations, evidence. */
export const governanceDocument = pgTable(
  "governance_document",
  {
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at").notNull(),
    datedOn: date("dated_on").notNull(),
    id: uuid("id").primaryKey(),
    kind: governanceDocumentKindEnum("kind").notNull(),
    /** Free-text note, for example what the document proves and its limits. */
    note: text("note"),
    /** R2 key under `governance/`; read only through a guarded short-lived URL. */
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sourceFormat: governanceDocumentFormatEnum("source_format").notNull(),
    title: text("title").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    validatedAt: timestamp("validated_at"),
    validationReport:
      jsonb("validation_report").$type<GovernanceValidationReport>(),
  },
  (t) => [
    index("governance_document_kind_idx").on(t.kind, t.datedOn),
    uniqueIndex("governance_document_object_key_uidx").on(t.objectKey),
  ]
);

/** The deed's rules in force from a date; version 1 is the deed as registered. */
export const deedVersion = pgTable(
  "deed_version",
  {
    amendmentThreshold: resolutionThresholdEnum("amendment_threshold")
      .default("two_thirds_in_office")
      .notNull(),
    castingVote: castingVoteRuleEnum("casting_vote").notNull(),
    /** Offices that may issue a circular, in fallback order. */
    circularIssuers: jsonb("circular_issuers")
      .$type<(typeof trusteeOfficeValues)[number][]>()
      .notNull(),
    coOptionMaxYears: integer("co_option_max_years").notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** The registered deed or deed of amendment in the vault. */
    documentId: uuid("document_id").references(() => governanceDocument.id, {
      onDelete: "restrict",
    }),
    effectiveFrom: date("effective_from").notNull(),
    electronicCirculation: boolean("electronic_circulation").notNull(),
    id: uuid("id").primaryKey(),
    maxTrustees: integer("max_trustees").notNull(),
    minTrustees: integer("min_trustees").notNull(),
    noticeDays: integer("notice_days").notNull(),
    number: integer("number").notNull(),
    quorumFloor: integer("quorum_floor").notNull(),
    quorumKind: quorumKindEnum("quorum_kind").notNull(),
    quorumRequiredOffice: trusteeOfficeEnum("quorum_required_office"),
    /** A head count for `fixed`; a percentage of trustees in office for `fraction`. */
    quorumValue: integer("quorum_value").notNull(),
    title: text("title").notNull(),
    videoCountsPresent: boolean("video_counts_present").notNull(),
  },
  (t) => [
    uniqueIndex("deed_version_number_uidx").on(t.number),
    check(
      "deed_version_trustees_check",
      sql`${t.minTrustees} >= 1 AND ${t.maxTrustees} >= ${t.minTrustees}`
    ),
    check(
      "deed_version_quorum_check",
      sql`${t.quorumValue} > 0 AND ${t.quorumFloor} >= 0 AND (${t.quorumKind} = 'fixed' OR ${t.quorumValue} <= 100)`
    ),
  ]
);

/** A person on the trustee register, past or present. */
export const trustee = pgTable(
  "trustee",
  {
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    /** Co-Founder named in the deed; a status, not an office. */
    isCoFounder: boolean("is_co_founder").default(false).notNull(),
    legalName: text("legal_name").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    /** The pi-dash account that votes and signs as this trustee; null for former trustees without one. */
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("trustee_user_uidx").on(t.userId)]
);

const evidence = (name: string) =>
  uuid(name).references((): AnyPgColumn => governanceDocument.id, {
    onDelete: "restrict",
  });

/** A period as a trustee. */
export const trusteeTerm = pgTable(
  "trustee_term",
  {
    /** The trustee's written acceptance (clause 4.24). */
    acceptanceDocumentId: evidence("acceptance_document_id"),
    basis: trusteeTermBasisEnum("basis").notNull(),
    cessationBasis: trusteeCessationBasisEnum("cessation_basis"),
    createdAt: timestamp("created_at").notNull(),
    /** The day the trustee stopped being one: not in office from this day. */
    endedOn: date("ended_on"),
    endEvidenceDocumentId: evidence("end_evidence_document_id"),
    /** Last day of a fixed term, inclusive; null for life. */
    endsOn: date("ends_on"),
    id: uuid("id").primaryKey(),
    startEvidenceDocumentId: evidence("start_evidence_document_id"),
    startsOn: date("starts_on").notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at").notNull(),
    /** What the record rests on and its limits, e.g. "meeting inquorate; relies on 4.5". */
    validityNote: text("validity_note"),
  },
  (t) => [
    index("trustee_term_trustee_idx").on(t.trusteeId, t.startsOn),
    check(
      "trustee_term_dates_check",
      sql`(${t.endsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}) AND (${t.endedOn} IS NULL OR ${t.endedOn} > ${t.startsOn})`
    ),
    check(
      "trustee_term_cessation_check",
      sql`(${t.endedOn} IS NULL) = (${t.cessationBasis} IS NULL)`
    ),
  ]
);

/** A period in an office of the trust. */
export const trusteeOffice = pgTable(
  "trustee_office",
  {
    createdAt: timestamp("created_at").notNull(),
    /** Not in the office from this day; null while held (it then ends with the term). */
    endedOn: date("ended_on"),
    endEvidenceDocumentId: evidence("end_evidence_document_id"),
    id: uuid("id").primaryKey(),
    office: trusteeOfficeEnum("office").notNull(),
    startEvidenceDocumentId: evidence("start_evidence_document_id"),
    startsOn: date("starts_on").notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at").notNull(),
    validityNote: text("validity_note"),
  },
  (t) => [
    index("trustee_office_trustee_idx").on(t.trusteeId, t.startsOn),
    index("trustee_office_office_idx").on(t.office, t.startsOn),
    check(
      "trustee_office_dates_check",
      sql`${t.endedOn} IS NULL OR ${t.endedOn} > ${t.startsOn}`
    ),
  ]
);

export const trusteeRelations = relations(trustee, ({ one, many }) => ({
  offices: many(trusteeOffice),
  terms: many(trusteeTerm),
  user: one(user, { fields: [trustee.userId], references: [user.id] }),
}));

export const trusteeTermRelations = relations(trusteeTerm, ({ one }) => ({
  acceptanceDocument: one(governanceDocument, {
    fields: [trusteeTerm.acceptanceDocumentId],
    references: [governanceDocument.id],
    relationName: "termAcceptance",
  }),
  endEvidence: one(governanceDocument, {
    fields: [trusteeTerm.endEvidenceDocumentId],
    references: [governanceDocument.id],
    relationName: "termEndEvidence",
  }),
  startEvidence: one(governanceDocument, {
    fields: [trusteeTerm.startEvidenceDocumentId],
    references: [governanceDocument.id],
    relationName: "termStartEvidence",
  }),
  trustee: one(trustee, {
    fields: [trusteeTerm.trusteeId],
    references: [trustee.id],
  }),
}));

export const trusteeOfficeRelations = relations(trusteeOffice, ({ one }) => ({
  endEvidence: one(governanceDocument, {
    fields: [trusteeOffice.endEvidenceDocumentId],
    references: [governanceDocument.id],
    relationName: "officeEndEvidence",
  }),
  startEvidence: one(governanceDocument, {
    fields: [trusteeOffice.startEvidenceDocumentId],
    references: [governanceDocument.id],
    relationName: "officeStartEvidence",
  }),
  trustee: one(trustee, {
    fields: [trusteeOffice.trusteeId],
    references: [trustee.id],
  }),
}));

export const deedVersionRelations = relations(deedVersion, ({ one }) => ({
  document: one(governanceDocument, {
    fields: [deedVersion.documentId],
    references: [governanceDocument.id],
  }),
}));

export const governanceDocumentRelations = relations(
  governanceDocument,
  ({ one }) => ({
    uploader: one(user, {
      fields: [governanceDocument.uploadedBy],
      references: [user.id],
    }),
  })
);
