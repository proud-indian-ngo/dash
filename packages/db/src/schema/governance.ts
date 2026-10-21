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
import {
  type ResolutionEffect,
  resolutionKindValues,
  resolutionResponseValues,
  resolutionStatusValues,
  resolutionTemplateKeyValues,
  signatureMethodValues,
} from "@pi-dash/shared/resolutions";
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

export const resolutionStatusEnum = pgEnum(
  "resolution_status",
  resolutionStatusValues
);
export const resolutionKindEnum = pgEnum(
  "resolution_kind",
  resolutionKindValues
);
export const resolutionTemplateKeyEnum = pgEnum(
  "resolution_template_key",
  resolutionTemplateKeyValues
);
export const resolutionResponseEnum = pgEnum(
  "resolution_response_kind",
  resolutionResponseValues
);
export const signatureMethodEnum = pgEnum(
  "signature_method",
  signatureMethodValues
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
    /**
     * The signer's certificate chains to one of the configured roots and
     * isn't known revoked, now or when its trusted timestamp says it was made.
     */
    trusted: boolean;
    /** A certification (DocMDP) signature, which limits later signatures. */
    certifies?: boolean;
    /** The fields the signature locks (FieldMDP), from its dictionary and its field's /Lock. */
    locks?: { action: "all" | "exclude" | "include"; fields: string[] }[];
    /** The signature covers the whole file as it was when signed. */
    coversWholeRevision: boolean;
    /** Changes made after this signature, as pyHanko reports them. */
    modificationLevel: string | null;
    /** Trustee whose name matches the certificate, when one does. */
    matchedTrusteeId: string | null;
    /** Set when the check itself failed: the exception's class name. */
    error?: string;
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
  /**
   * When checked against the copy a signer was given: the most the revisions
   * appended to it change, as pyHanko reports it ("OTHER" when not allowed).
   */
  changesSinceBase?: string;
  /** With `changesSinceBase`: the signature fields the copy a signer was given already had. */
  baseSignatureFields?: string[];
  /** Every text field's value: a circular's answers fields. */
  textFields?: Record<string, string>;
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
    /**
     * The long-term copy: the file with revocation data and a document
     * timestamp (PAdES B-LTA), re-timestamped yearly. The original file never
     * changes; this copy extends it.
     */
    archiveObjectKey: text("archive_object_key"),
    archiveSha256: text("archive_sha256"),
    archivedAt: timestamp("archived_at"),
    /** When the archive copy needs its next document timestamp. */
    archiveRenewOn: date("archive_renew_on"),
    validatedAt: timestamp("validated_at"),
    validationReport:
      jsonb("validation_report").$type<GovernanceValidationReport>(),
  },
  (t) => [
    index("governance_document_kind_idx").on(t.kind, t.datedOn),
    uniqueIndex("governance_document_object_key_uidx").on(t.objectKey),
    // One document per file: resolutions passed on the same PDF share it.
    uniqueIndex("governance_document_sha256_uidx").on(t.sha256),
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
    /** The resolution that ended this term, when pi-dash ran it. */
    endSourceResolutionId: uuid("end_source_resolution_id").references(
      (): AnyPgColumn => resolution.id,
      { onDelete: "restrict" }
    ),
    /** Last day of a fixed term, inclusive; null for life. */
    endsOn: date("ends_on"),
    id: uuid("id").primaryKey(),
    /** The resolution that started this term, when pi-dash ran it. */
    sourceResolutionId: uuid("source_resolution_id").references(
      (): AnyPgColumn => resolution.id,
      { onDelete: "restrict" }
    ),
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
    /** The resolution that ended this office, when pi-dash ran it. */
    endSourceResolutionId: uuid("end_source_resolution_id").references(
      (): AnyPgColumn => resolution.id,
      { onDelete: "restrict" }
    ),
    id: uuid("id").primaryKey(),
    office: trusteeOfficeEnum("office").notNull(),
    /** The resolution that designated this office holder, when pi-dash ran it. */
    sourceResolutionId: uuid("source_resolution_id").references(
      (): AnyPgColumn => resolution.id,
      { onDelete: "restrict" }
    ),
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

/**
 * One issue of resolutions by circulation: the drafts the Managing Trustee
 * sent together, as one PDF that each trustee signs once. Open while any of
 * its resolutions is still issued.
 */
export const circular = pgTable("circular", {
  createdAt: timestamp("created_at").notNull(),
  id: uuid("id").primaryKey(),
  issuedAt: timestamp("issued_at").notNull(),
  issuedByTrusteeId: uuid("issued_by_trustee_id")
    .notNull()
    .references(() => trustee.id, { onDelete: "restrict" }),
  responseDueOn: date("response_due_on").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * A decision of the Board. Circular resolutions are drafted by
 * governance.manage, issued by the Managing Trustee in a circular, assented
 * to (by signing the circular) or objected to by each trustee in office, and
 * pass or fail on their own by the deed's rules. A passed or failed
 * resolution never changes.
 */
export const resolution = pgTable(
  "resolution",
  {
    /** Resolution this one amends, if any. */
    amendsResolutionId: uuid("amends_resolution_id").references(
      (): AnyPgColumn => resolution.id,
      { onDelete: "restrict" }
    ),
    body: text("body").notNull(),
    /** The circular it was issued in; null for drafts, meetings and history. */
    circularId: uuid("circular_id").references(() => circular.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at").notNull(),
    decidedAt: timestamp("decided_at"),
    deedVersionId: uuid("deed_version_id").references(() => deedVersion.id, {
      onDelete: "restrict",
    }),
    draftedBy: text("drafted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** The register change it makes when it passes. */
    effect: jsonb("effect").$type<ResolutionEffect>().notNull(),
    /** The vault copy of the final signed PDF, once passed. */
    finalDocumentId: uuid("final_document_id").references(
      () => governanceDocument.id,
      { onDelete: "restrict" }
    ),
    /** "2026-27"; set with the number. */
    fiscalYear: text("fiscal_year"),
    /** Recorded from paper, not run in pi-dash. */
    historical: boolean("historical").default(false).notNull(),
    id: uuid("id").primaryKey(),
    kind: resolutionKindEnum("kind").default("circular").notNull(),
    /** PI/TR/2026-27/003, assigned when it passes. */
    number: text("number"),
    outcomeNote: text("outcome_note"),
    /** Its place in the circular, from 1. */
    position: integer("position"),
    /** Day the decision was taken: passed, failed or withdrawn. */
    decidedOn: date("decided_on"),
    rescindsResolutionId: uuid("rescinds_resolution_id").references(
      (): AnyPgColumn => resolution.id,
      { onDelete: "restrict" }
    ),
    sequence: integer("sequence"),
    status: resolutionStatusEnum("status").default("draft").notNull(),
    templateKey: resolutionTemplateKeyEnum("template_key").notNull(),
    threshold: resolutionThresholdEnum("threshold"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    validityNote: text("validity_note"),
  },
  (t) => [
    uniqueIndex("resolution_number_uidx").on(t.number),
    uniqueIndex("resolution_fy_sequence_uidx").on(t.fiscalYear, t.sequence),
    index("resolution_status_idx").on(t.status),
    uniqueIndex("resolution_circular_position_uidx").on(
      t.circularId,
      t.position
    ),
    check(
      "resolution_number_check",
      sql`(${t.number} IS NULL) = (${t.sequence} IS NULL)`
    ),
  ]
);

/** The PDF a circular was issued with; signatures go onto `latest`. */
export const circularRevision = pgTable(
  "circular_revision",
  {
    circularId: uuid("circular_id")
      .notNull()
      .references(() => circular.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    /** The PDF with every signature so far; each signer extends it. */
    latestObjectKey: text("latest_object_key").notNull(),
    latestSha256: text("latest_sha256").notNull(),
    /** The prepared PDF as issued, with an empty field per trustee. */
    objectKey: text("object_key").notNull(),
    revision: integer("revision").notNull(),
    sha256: text("sha256").notNull(),
  },
  (t) => [uniqueIndex("circular_revision_uidx").on(t.circularId, t.revision)]
);

/** One per trustee in office at issue: their answer, conflict and signature on the circular. */
export const resolutionResponse = pgTable(
  "resolution_response",
  {
    conflictDeclared: boolean("conflict_declared").default(false).notNull(),
    conflictNote: text("conflict_note"),
    /** The trustee's signature field in the PDF. */
    fieldName: text("field_name").notNull(),
    id: uuid("id").primaryKey(),
    /** Why they objected; shown to the board. */
    reason: text("reason"),
    resolutionId: uuid("resolution_id")
      .notNull()
      .references(() => resolution.id, { onDelete: "restrict" }),
    respondedAt: timestamp("responded_at"),
    response: resolutionResponseEnum("response").default("pending").notNull(),
    signatureId: uuid("signature_id").references(
      (): AnyPgColumn => circularSignature.id,
      { onDelete: "restrict" }
    ),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    /** The trustee's account at issue, so their pages and card can find it. */
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("resolution_response_uidx").on(t.resolutionId, t.trusteeId),
    index("resolution_response_user_idx").on(t.userId, t.response),
  ]
);

/**
 * A trustee's signature on a circular's PDF, with the facts the signing
 * service checked. It assents to every resolution they hadn't objected to
 * or declared a conflict on; `answers` is that list as filled into the PDF.
 */
export const circularSignature = pgTable(
  "circular_signature",
  {
    answers: text("answers"),
    certificateSha256: text("certificate_sha256"),
    circularId: uuid("circular_id")
      .notNull()
      .references(() => circular.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    fieldName: text("field_name").notNull(),
    id: uuid("id").primaryKey(),
    issuer: text("issuer"),
    method: signatureMethodEnum("method").notNull(),
    /** The PDF as it stood after this signature. */
    objectKey: text("object_key").notNull(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => circularRevision.id, { onDelete: "restrict" }),
    serial: text("serial"),
    sha256: text("sha256").notNull(),
    signerName: text("signer_name"),
    /** From the signature itself (the signer's clock), not the upload. */
    signingTime: timestamp("signing_time"),
    timestamped: boolean("timestamped").default(false).notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    trusted: boolean("trusted").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("circular_signature_field_uidx").on(t.revisionId, t.fieldName),
    index("circular_signature_circular_idx").on(t.circularId, t.trusteeId),
  ]
);

/** A trustee's DSC, read from their token by the helper. */
export const signingCertificate = pgTable(
  "signing_certificate",
  {
    /** CA certificates the token holds, DER in base64, for the signature's chain. */
    chain: jsonb("chain").$type<string[]>().notNull(),
    /** The certificate, DER in base64. Public. */
    der: text("der").notNull(),
    enrolledAt: timestamp("enrolled_at").notNull(),
    id: uuid("id").primaryKey(),
    issuer: text("issuer").notNull(),
    method: signatureMethodEnum("method").default("dsc_helper").notNull(),
    notAfter: timestamp("not_after").notNull(),
    notBefore: timestamp("not_before").notNull(),
    revokedAt: timestamp("revoked_at"),
    serial: text("serial").notNull(),
    sha256: text("sha256").notNull(),
    subject: text("subject").notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("signing_certificate_trustee_sha_uidx").on(
      t.trusteeId,
      t.sha256
    ),
  ]
);

export const signingCertificateRelations = relations(
  signingCertificate,
  ({ one }) => ({
    trustee: one(trustee, {
      fields: [signingCertificate.trusteeId],
      references: [trustee.id],
    }),
  })
);

export const circularRelations = relations(circular, ({ many, one }) => ({
  issuedBy: one(trustee, {
    fields: [circular.issuedByTrusteeId],
    references: [trustee.id],
  }),
  resolutions: many(resolution),
  revisions: many(circularRevision),
  signatures: many(circularSignature),
}));

export const resolutionRelations = relations(resolution, ({ many, one }) => ({
  circular: one(circular, {
    fields: [resolution.circularId],
    references: [circular.id],
  }),
  finalDocument: one(governanceDocument, {
    fields: [resolution.finalDocumentId],
    references: [governanceDocument.id],
  }),
  responses: many(resolutionResponse),
}));

export const circularRevisionRelations = relations(
  circularRevision,
  ({ one }) => ({
    circular: one(circular, {
      fields: [circularRevision.circularId],
      references: [circular.id],
    }),
  })
);

export const resolutionResponseRelations = relations(
  resolutionResponse,
  ({ one }) => ({
    resolution: one(resolution, {
      fields: [resolutionResponse.resolutionId],
      references: [resolution.id],
    }),
    signature: one(circularSignature, {
      fields: [resolutionResponse.signatureId],
      references: [circularSignature.id],
    }),
    trustee: one(trustee, {
      fields: [resolutionResponse.trusteeId],
      references: [trustee.id],
    }),
  })
);

export const circularSignatureRelations = relations(
  circularSignature,
  ({ one }) => ({
    circular: one(circular, {
      fields: [circularSignature.circularId],
      references: [circular.id],
    }),
    trustee: one(trustee, {
      fields: [circularSignature.trusteeId],
      references: [trustee.id],
    }),
  })
);

export const trusteeRelations = relations(trustee, ({ one, many }) => ({
  certificates: many(signingCertificate),
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
