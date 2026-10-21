import type { PartyIdType } from "@pi-dash/shared/constants";
import type { FilingPlanRow } from "@pi-dash/shared/donations-return";
import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { encryptSecret, revealSecret, visibleTail } from "../encryption";
import { filingRowIdContext } from "../encryption-contexts";
import { user } from "../schema/auth";
import {
  donationCertificate,
  donationFiling,
  donationFilingGift,
  donationFilingRow,
} from "../schema/private/donation-filings";
import { emailSuppression } from "../schema/private/email-suppression";
import { partyPrivate } from "../schema/private/party-private";

/**
 * Donations return filings and their Form 114 certificates (server only).
 * Recording a filing freezes its rows and links each gift to the row that
 * carries it; a gift's link is its primary key, so no gift is ever in two
 * live filings. Rows are never updated. ID numbers are encrypted under the
 * row ID and decrypted only to match certificates.
 */

export type FilingTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

export type FilingStatus = (typeof donationFiling.$inferSelect)["status"];
export type CertificateMatch =
  (typeof donationCertificate.$inferSelect)["matchedBy"];
export type CertificateEmailFailure = NonNullable<
  (typeof donationCertificate.$inferSelect)["emailFailure"]
>;

/** A refusal written for the person acting; any other error is hidden. */
export class FilingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilingError";
  }
}

/** Serialises recording and discarding filings of one year. */
export async function lockFilingYear(
  tx: FilingTx,
  fiscalYear: string
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`donation_filing:${fiscalYear}`}, 0))`
  );
}

/** The next filing number of the year; discarded filings keep theirs. */
export async function nextFilingSequence(
  tx: FilingTx,
  fiscalYear: string
): Promise<number> {
  const [row] = await tx
    .select({ last: max(donationFiling.sequence) })
    .from(donationFiling)
    .where(eq(donationFiling.fiscalYear, fiscalYear));
  return (row?.last ?? 0) + 1;
}

/** Gift ID to filing number, for gifts in a live filing of the year. */
export async function loadFiledSequences(
  fiscalYear: string,
  reader: Reader = db
): Promise<Map<string, number>> {
  const rows = await reader
    .select({
      contributionId: donationFilingGift.contributionId,
      sequence: donationFiling.sequence,
    })
    .from(donationFilingGift)
    .innerJoin(
      donationFiling,
      eq(donationFiling.id, donationFilingGift.filingId)
    )
    .where(eq(donationFiling.fiscalYear, fiscalYear));
  return new Map(rows.map((row) => [row.contributionId, row.sequence]));
}

export interface NewFilingRow extends FilingPlanRow {
  idType: Exclude<PartyIdType, "none">;
}

export interface NewFiling {
  createdBy: string;
  file: { name: string; objectKey: string; sha256: string };
  fiscalYear: string;
  id: string;
  now: Date;
  rows: readonly NewFilingRow[];
  sequence: number;
}

/** Postgres takes at most 65,535 parameters per statement. */
const INSERT_CHUNK = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += INSERT_CHUNK) {
    out.push(items.slice(i, i + INSERT_CHUNK));
  }
  return out;
}

/**
 * Writes a filing, its frozen rows and the links from each gift to its row,
 * in the caller's transaction. A gift already in a live filing fails the
 * whole insert on the link's primary key.
 */
export async function insertFiling(tx: FilingTx, filing: NewFiling) {
  const rows = filing.rows.map((row) => {
    const id = uuidv7();
    return {
      giftIds: row.giftIds,
      value: {
        address: row.address,
        amountPaise: row.amountPaise,
        createdAt: filing.now,
        donationTypeCode: row.donationTypeCode,
        filingId: filing.id,
        giftCount: row.giftIds.length,
        id,
        idCode: row.idCode,
        idNumberEncrypted: encryptSecret(row.idNumber, filingRowIdContext(id)),
        idNumberLast4: visibleTail(row.idNumber),
        idType: row.idType,
        modeCode: row.modeCode,
        name: row.name,
        partyId: row.partyId,
        preArn: row.preArn,
        srNo: row.srNo,
      },
    };
  });
  await tx.insert(donationFiling).values({
    createdAt: filing.now,
    createdBy: filing.createdBy,
    fileName: filing.file.name,
    fileObjectKey: filing.file.objectKey,
    fileSha256: filing.file.sha256,
    fiscalYear: filing.fiscalYear,
    giftCount: rows.reduce((sum, row) => sum + row.giftIds.length, 0),
    id: filing.id,
    rowCount: rows.length,
    sequence: filing.sequence,
    status: "prepared",
    totalPaise: rows.reduce((sum, row) => sum + row.value.amountPaise, 0),
  });
  for (const part of chunks(rows)) {
    await tx.insert(donationFilingRow).values(part.map((row) => row.value));
  }
  const links = rows.flatMap((row) =>
    row.giftIds.map((contributionId) => ({
      contributionId,
      filingId: filing.id,
      rowId: row.value.id,
    }))
  );
  for (const part of chunks(links)) {
    await tx.insert(donationFilingGift).values(part);
  }
}

async function lockFiling(tx: FilingTx, filingId: string) {
  const [row] = await tx
    .select({
      fiscalYear: donationFiling.fiscalYear,
      status: donationFiling.status,
    })
    .from(donationFiling)
    .where(eq(donationFiling.id, filingId))
    .for("update");
  if (!row) {
    throw new FilingError("Filing not found.");
  }
  return row;
}

export interface FilingSubmission {
  acknowledgementNumber: string;
  /** yyyy-MM-dd. */
  filedOn: string;
  transactionId: string;
}

/**
 * Records (or corrects) what the portal gave back for an upload. Rows stay
 * as they are; only the filing's references change.
 */
export async function recordFilingSubmission(
  filingId: string,
  submission: FilingSubmission,
  userId: string,
  now: Date
): Promise<void> {
  await db.transaction(async (tx) => {
    const filing = await lockFiling(tx, filingId);
    if (filing.status === "discarded") {
      throw new FilingError("A discarded filing can't be submitted.");
    }
    await tx
      .update(donationFiling)
      .set({
        acknowledgementNumber: submission.acknowledgementNumber,
        filedOn: submission.filedOn,
        status: "submitted",
        submittedAt: now,
        submittedBy: userId,
        transactionId: submission.transactionId,
      })
      .where(eq(donationFiling.id, filingId));
  });
}

/**
 * Discards a filing that was never submitted: its gifts are free for the
 * next filing, while its number and Pre-ARNs stay used.
 */
export async function discardFiling(
  filingId: string,
  userId: string,
  now: Date
): Promise<void> {
  await db.transaction(async (tx) => {
    const filing = await lockFiling(tx, filingId);
    if (filing.status !== "prepared") {
      throw new FilingError(
        filing.status === "submitted"
          ? "A submitted filing can't be discarded. Changes need a revision on the portal."
          : "This filing is already discarded."
      );
    }
    await lockFilingYear(tx, filing.fiscalYear);
    await tx
      .delete(donationFilingGift)
      .where(eq(donationFilingGift.filingId, filingId));
    await tx
      .update(donationFiling)
      .set({ discardedAt: now, discardedBy: userId, status: "discarded" })
      .where(eq(donationFiling.id, filingId));
  });
}

export interface FilingSummary {
  acknowledgementNumber: string | null;
  certificateCount: number;
  createdAt: Date;
  createdByName: string | null;
  emailedCount: number;
  emailFailedCount: number;
  emailQueuedCount: number;
  fileName: string;
  filedOn: string | null;
  fiscalYear: string;
  giftCount: number;
  id: string;
  rowCount: number;
  sequence: number;
  status: FilingStatus;
  totalPaise: number;
  transactionId: string | null;
}

/** A year's filings, newest first, with certificate and email counts. */
export async function listFilings(
  fiscalYear: string
): Promise<FilingSummary[]> {
  const filings = await db
    .select({
      acknowledgementNumber: donationFiling.acknowledgementNumber,
      createdAt: donationFiling.createdAt,
      createdByName: user.name,
      fileName: donationFiling.fileName,
      filedOn: donationFiling.filedOn,
      fiscalYear: donationFiling.fiscalYear,
      giftCount: donationFiling.giftCount,
      id: donationFiling.id,
      rowCount: donationFiling.rowCount,
      sequence: donationFiling.sequence,
      status: donationFiling.status,
      totalPaise: donationFiling.totalPaise,
      transactionId: donationFiling.transactionId,
    })
    .from(donationFiling)
    .leftJoin(user, eq(user.id, donationFiling.createdBy))
    .where(eq(donationFiling.fiscalYear, fiscalYear))
    .orderBy(sql`${donationFiling.sequence} DESC`);
  if (filings.length === 0) {
    return [];
  }
  const counts = await db
    .select({
      certificates: count(),
      emailed: count(donationCertificate.emailedAt),
      failed: count(donationCertificate.emailFailure),
      filingId: donationCertificate.filingId,
      queued:
        sql<number>`count(*) FILTER (WHERE ${donationCertificate.emailRequestId} IS NOT NULL AND ${donationCertificate.emailedAt} IS NULL AND ${donationCertificate.emailFailure} IS NULL)`.mapWith(
          Number
        ),
    })
    .from(donationCertificate)
    .where(
      inArray(
        donationCertificate.filingId,
        filings.map((filing) => filing.id)
      )
    )
    .groupBy(donationCertificate.filingId);
  const byFiling = new Map(counts.map((row) => [row.filingId, row]));
  return filings.map((filing) => {
    const tally = byFiling.get(filing.id);
    return {
      ...filing,
      certificateCount: tally?.certificates ?? 0,
      emailedCount: tally?.emailed ?? 0,
      emailFailedCount: tally?.failed ?? 0,
      emailQueuedCount: tally?.queued ?? 0,
    };
  });
}

/** Whether the donor can be emailed now: an address that never bounced. */
export type DonorEmailState = "ok" | "none" | "suppressed";

export interface FilingCertificateView {
  acknowledgementNumber: string;
  emailedAt: Date | null;
  emailFailure: CertificateEmailFailure | null;
  emailQueuedAt: Date | null;
  fileName: string;
  id: string;
  matchedBy: CertificateMatch;
}

/** A frozen row as the page shows it: never the ID number. */
export interface FilingRowView {
  amountPaise: number;
  certificate: FilingCertificateView | null;
  donationTypeCode: string;
  emailState: DonorEmailState;
  giftCount: number;
  id: string;
  modeCode: string;
  name: string;
  partyId: string;
  preArn: string;
  srNo: number;
}

const emailStateSql = sql<DonorEmailState>`CASE
  WHEN coalesce(trim(${partyPrivate.email}), '') = '' THEN 'none'
  WHEN ${emailSuppression.email} IS NOT NULL THEN 'suppressed'
  ELSE 'ok' END`;

export async function loadFilingRows(
  filingId: string
): Promise<FilingRowView[]> {
  const rows = await db
    .select({
      amountPaise: donationFilingRow.amountPaise,
      certificateAck: donationCertificate.acknowledgementNumber,
      certificateEmailedAt: donationCertificate.emailedAt,
      certificateEmailFailure: donationCertificate.emailFailure,
      certificateEmailQueuedAt: donationCertificate.emailQueuedAt,
      certificateFileName: donationCertificate.fileName,
      certificateId: donationCertificate.id,
      certificateMatchedBy: donationCertificate.matchedBy,
      donationTypeCode: donationFilingRow.donationTypeCode,
      emailState: emailStateSql,
      giftCount: donationFilingRow.giftCount,
      id: donationFilingRow.id,
      modeCode: donationFilingRow.modeCode,
      name: donationFilingRow.name,
      partyId: donationFilingRow.partyId,
      preArn: donationFilingRow.preArn,
      srNo: donationFilingRow.srNo,
    })
    .from(donationFilingRow)
    .leftJoin(
      donationCertificate,
      eq(donationCertificate.rowId, donationFilingRow.id)
    )
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, donationFilingRow.partyId))
    .leftJoin(
      emailSuppression,
      eq(emailSuppression.email, sql`lower(trim(${partyPrivate.email}))`)
    )
    .where(eq(donationFilingRow.filingId, filingId))
    .orderBy(asc(donationFilingRow.srNo));
  return rows.map((row) => ({
    amountPaise: row.amountPaise,
    certificate:
      row.certificateId && row.certificateAck && row.certificateMatchedBy
        ? {
            acknowledgementNumber: row.certificateAck,
            emailedAt: row.certificateEmailedAt,
            emailFailure: row.certificateEmailFailure,
            emailQueuedAt: row.certificateEmailQueuedAt,
            fileName: row.certificateFileName ?? "",
            id: row.certificateId,
            matchedBy: row.certificateMatchedBy,
          }
        : null,
    donationTypeCode: row.donationTypeCode,
    emailState: row.emailState,
    giftCount: row.giftCount,
    id: row.id,
    modeCode: row.modeCode,
    name: row.name,
    partyId: row.partyId,
    preArn: row.preArn,
    srNo: row.srNo,
  }));
}

export interface FilingHeader {
  acknowledgementNumber: string | null;
  fileName: string;
  fileObjectKey: string;
  fiscalYear: string;
  id: string;
  sequence: number;
  status: FilingStatus;
}

export async function loadFilingHeader(
  filingId: string
): Promise<FilingHeader | null> {
  const [row] = await db
    .select({
      acknowledgementNumber: donationFiling.acknowledgementNumber,
      fileName: donationFiling.fileName,
      fileObjectKey: donationFiling.fileObjectKey,
      fiscalYear: donationFiling.fiscalYear,
      id: donationFiling.id,
      sequence: donationFiling.sequence,
      status: donationFiling.status,
    })
    .from(donationFiling)
    .where(eq(donationFiling.id, filingId))
    .limit(1);
  return row ?? null;
}

/** A row as certificate matching needs it, with the ID number decrypted. */
export interface FilingMatchRow {
  amountPaise: number;
  certificate: { acknowledgementNumber: string; fileSha256: string } | null;
  donationTypeCode: string;
  id: string;
  /** Null when the stored value can't be decrypted with the current key. */
  idNumber: string | null;
  modeCode: string;
  name: string;
  preArn: string;
}

export async function loadFilingMatchRows(
  filingId: string
): Promise<FilingMatchRow[]> {
  const rows = await db
    .select({
      amountPaise: donationFilingRow.amountPaise,
      certificateAck: donationCertificate.acknowledgementNumber,
      certificateSha256: donationCertificate.fileSha256,
      donationTypeCode: donationFilingRow.donationTypeCode,
      id: donationFilingRow.id,
      idNumberEncrypted: donationFilingRow.idNumberEncrypted,
      modeCode: donationFilingRow.modeCode,
      name: donationFilingRow.name,
      preArn: donationFilingRow.preArn,
    })
    .from(donationFilingRow)
    .leftJoin(
      donationCertificate,
      eq(donationCertificate.rowId, donationFilingRow.id)
    )
    .where(eq(donationFilingRow.filingId, filingId))
    .orderBy(asc(donationFilingRow.srNo));
  return rows.map((row) => {
    let idNumber: string | null = null;
    try {
      idNumber = revealSecret(
        row.idNumberEncrypted,
        filingRowIdContext(row.id)
      );
    } catch {
      idNumber = null;
    }
    return {
      amountPaise: row.amountPaise,
      certificate:
        row.certificateAck && row.certificateSha256
          ? {
              acknowledgementNumber: row.certificateAck,
              fileSha256: row.certificateSha256,
            }
          : null,
      donationTypeCode: row.donationTypeCode,
      id: row.id,
      idNumber,
      modeCode: row.modeCode,
      name: row.name,
      preArn: row.preArn,
    };
  });
}

export interface NewCertificate {
  acknowledgementNumber: string;
  fileName: string;
  fileObjectKey: string;
  fileSha256: string;
  id: string;
  matchedBy: CertificateMatch;
  rowId: string;
}

/** Stores matched certificates against a submitted filing, in one transaction. */
export async function insertCertificates(
  filingId: string,
  certificates: readonly NewCertificate[],
  userId: string,
  now: Date
): Promise<void> {
  if (certificates.length === 0) {
    return;
  }
  await db.transaction(async (tx) => {
    const filing = await lockFiling(tx, filingId);
    if (filing.status !== "submitted") {
      throw new FilingError(
        "Record the portal's acknowledgement before adding certificates."
      );
    }
    for (const part of chunks(certificates)) {
      await tx.insert(donationCertificate).values(
        part.map((certificate) => ({
          ...certificate,
          createdAt: now,
          createdBy: userId,
          filingId,
        }))
      );
    }
  });
}

export interface CertificateEmailClaim {
  certificateId: string;
  requestId: string;
}

export interface CertificateEmailPlan {
  claimed: CertificateEmailClaim[];
  /** Donor names whose certificates can't be emailed, for manual sending. */
  noEmail: string[];
  suppressed: string[];
}

/**
 * Claims certificates for emailing in the caller's transaction, so the jobs
 * are sent only if the claim commits. Without `certificateIds` it takes every
 * certificate of the filing never emailed and not already on its way (a
 * failed send is taken again); with them it is an explicit resend of those.
 * Each claim gets a new request ID: the job sends only while the certificate
 * still carries it, so one certificate never has two sends in flight. The
 * filing's row lock serialises claims, so two clicks can't both claim.
 */
export async function claimCertificateEmails(
  tx: FilingTx,
  input: { certificateIds?: readonly string[]; filingId: string; now: Date }
): Promise<CertificateEmailPlan> {
  const filing = await lockFiling(tx, input.filingId);
  if (filing.status !== "submitted") {
    throw new FilingError(
      "Only a submitted filing's certificates are emailed."
    );
  }
  const candidates = await tx
    .select({
      emailedAt: donationCertificate.emailedAt,
      emailFailure: donationCertificate.emailFailure,
      emailRequestId: donationCertificate.emailRequestId,
      emailState: emailStateSql,
      id: donationCertificate.id,
      name: donationFilingRow.name,
    })
    .from(donationCertificate)
    .innerJoin(
      donationFilingRow,
      eq(donationFilingRow.id, donationCertificate.rowId)
    )
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, donationFilingRow.partyId))
    .leftJoin(
      emailSuppression,
      eq(emailSuppression.email, sql`lower(trim(${partyPrivate.email}))`)
    )
    .where(
      and(
        eq(donationCertificate.filingId, input.filingId),
        input.certificateIds
          ? inArray(donationCertificate.id, [...input.certificateIds])
          : undefined
      )
    )
    .orderBy(asc(donationFilingRow.srNo));
  const plan: CertificateEmailPlan = {
    claimed: [],
    noEmail: [],
    suppressed: [],
  };
  for (const certificate of candidates) {
    const due =
      input.certificateIds !== undefined ||
      (certificate.emailedAt === null &&
        (certificate.emailRequestId === null ||
          certificate.emailFailure !== null));
    if (!due) {
      continue;
    }
    if (certificate.emailState === "none") {
      plan.noEmail.push(certificate.name);
      continue;
    }
    if (certificate.emailState === "suppressed") {
      plan.suppressed.push(certificate.name);
      continue;
    }
    const requestId = uuidv7();
    await tx
      .update(donationCertificate)
      .set({
        emailedAt: null,
        emailFailure: null,
        emailQueuedAt: input.now,
        emailRequestId: requestId,
      })
      .where(eq(donationCertificate.id, certificate.id));
    plan.claimed.push({ certificateId: certificate.id, requestId });
  }
  return plan;
}

export interface CertificateEmailTarget {
  acknowledgementNumber: string;
  donorName: string;
  /** The donor's current address; null when none is stored. */
  email: string | null;
  emailedAt: Date | null;
  emailRequestId: string | null;
  fileName: string;
  fileObjectKey: string;
  fiscalYear: string;
  id: string;
}

export async function loadCertificateEmailTarget(
  certificateId: string
): Promise<CertificateEmailTarget | null> {
  const [row] = await db
    .select({
      acknowledgementNumber: donationCertificate.acknowledgementNumber,
      donorName: donationFilingRow.name,
      email: partyPrivate.email,
      emailedAt: donationCertificate.emailedAt,
      emailRequestId: donationCertificate.emailRequestId,
      fileName: donationCertificate.fileName,
      fileObjectKey: donationCertificate.fileObjectKey,
      fiscalYear: donationFiling.fiscalYear,
      id: donationCertificate.id,
    })
    .from(donationCertificate)
    .innerJoin(
      donationFilingRow,
      eq(donationFilingRow.id, donationCertificate.rowId)
    )
    .innerJoin(
      donationFiling,
      eq(donationFiling.id, donationCertificate.filingId)
    )
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, donationFilingRow.partyId))
    .where(eq(donationCertificate.id, certificateId))
    .limit(1);
  if (!row) {
    return null;
  }
  return { ...row, email: row.email?.trim() || null };
}

/** Stamps a send, only for the request that made it. */
export async function markCertificateEmailed(
  certificateId: string,
  requestId: string,
  at: Date
): Promise<void> {
  await db
    .update(donationCertificate)
    .set({ emailedAt: at, emailFailure: null })
    .where(
      and(
        eq(donationCertificate.id, certificateId),
        eq(donationCertificate.emailRequestId, requestId)
      )
    );
}

export async function markCertificateEmailFailed(
  certificateId: string,
  requestId: string,
  failure: CertificateEmailFailure
): Promise<void> {
  await db
    .update(donationCertificate)
    .set({ emailFailure: failure })
    .where(
      and(
        eq(donationCertificate.id, certificateId),
        eq(donationCertificate.emailRequestId, requestId),
        sql`${donationCertificate.emailedAt} IS NULL`
      )
    );
}

/** A certificate's stored PDF, for the audited download route. */
export async function loadCertificateFile(certificateId: string) {
  const [row] = await db
    .select({
      acknowledgementNumber: donationCertificate.acknowledgementNumber,
      fileObjectKey: donationCertificate.fileObjectKey,
    })
    .from(donationCertificate)
    .where(eq(donationCertificate.id, certificateId))
    .limit(1);
  return row ?? null;
}
