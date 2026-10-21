import type { DonationType, PartyIdType } from "@pi-dash/shared/constants";
import {
  CERTIFICATE_EMAIL_STALE_MS,
  RETURN_DONATION_TYPE_CODES,
  type FiledGift,
  type FilingDrift,
  type FilingPlanRow,
} from "@pi-dash/shared/donations-return";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  max,
  ne,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { encryptSecret, revealSecret, visibleTail } from "../encryption";
import { filingRowIdContext } from "../encryption-contexts";
import { user } from "../schema/auth";
import { contribution, contributionRefund } from "../schema/income";
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

/**
 * Every gift in a live filing, of any year: its filing's number and the net
 * amount it was filed at. Discarded filings hold no links.
 */
export async function loadFiledSequences(
  reader: Reader = db
): Promise<Map<string, FiledGift>> {
  const rows = await reader
    .select({
      amountPaise: donationFilingGift.amountPaise,
      contributionId: donationFilingGift.contributionId,
      sequence: donationFiling.sequence,
    })
    .from(donationFilingGift)
    .innerJoin(
      donationFiling,
      eq(donationFiling.id, donationFilingGift.filingId)
    );
  return new Map(
    rows.map((row) => [
      row.contributionId,
      { amountPaise: row.amountPaise, filingSequence: row.sequence },
    ])
  );
}

/** The live filing holding a gift, if any. */
export async function loadGiftFiling(
  contributionId: string
): Promise<{ sequence: number; status: FilingStatus } | null> {
  const [row] = await db
    .select({
      sequence: donationFiling.sequence,
      status: donationFiling.status,
    })
    .from(donationFilingGift)
    .innerJoin(
      donationFiling,
      eq(donationFiling.id, donationFilingGift.filingId)
    )
    .where(eq(donationFilingGift.contributionId, contributionId))
    .limit(1);
  return row ?? null;
}

/**
 * Pre-ARNs among `values` already on a row of a prepared or submitted
 * filing (discarding a filing clears its rows' Pre-ARNs).
 */
export async function usedPreArns(
  tx: FilingTx,
  values: readonly string[]
): Promise<Set<string>> {
  if (values.length === 0) {
    return new Set();
  }
  const rows = await tx
    .select({ preArn: donationFilingRow.preArn })
    .from(donationFilingRow)
    .where(inArray(donationFilingRow.preArn, [...values]));
  return new Set(rows.flatMap((row) => (row.preArn ? [row.preArn] : [])));
}

export interface NewFilingRow extends FilingPlanRow {
  idType: Exclude<PartyIdType, "none">;
}

export interface NewFiling {
  createdBy: string;
  /** Each gift's net amount as filed. */
  giftNetPaise: ReadonlyMap<string, number>;
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

/** The violated constraint and detail of a database error, through its causes. */
function constraintViolation(
  error: unknown
): { constraint: string; detail: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Object; depth += 1) {
    const e = current as Record<string, unknown>;
    if (typeof e.constraint === "string") {
      return {
        constraint: e.constraint,
        detail: typeof e.detail === "string" ? e.detail : "",
      };
    }
    current = e.cause;
  }
  return null;
}

/**
 * Writes a filing, its frozen rows and the links from each gift to its row,
 * in the caller's transaction. A gift already in a live filing fails the
 * whole insert on the link's primary key, reported as a FilingError naming
 * the gift's donor.
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
  try {
    for (const part of chunks(rows)) {
      await tx.insert(donationFilingRow).values(part.map((row) => row.value));
    }
  } catch (error) {
    const violation = constraintViolation(error);
    if (violation?.constraint !== "donation_filing_row_pre_arn_uidx") {
      throw error;
    }
    const preArn = rows.find(
      (row) => row.value.preArn && violation.detail.includes(row.value.preArn)
    )?.value.preArn;
    throw new FilingError(
      `The Pre-ARN ${preArn ?? "given"} was just used by another filing. Record this filing again with unused Pre-ARNs.`
    );
  }
  const links = rows.flatMap((row) =>
    row.giftIds.map((contributionId) => ({
      amountPaise: filing.giftNetPaise.get(contributionId) ?? 0,
      contributionId,
      filingId: filing.id,
      rowId: row.value.id,
    }))
  );
  try {
    for (const part of chunks(links)) {
      await tx.insert(donationFilingGift).values(part);
    }
  } catch (error) {
    const violation = constraintViolation(error);
    if (violation?.constraint !== "donation_filing_gift_pkey") {
      throw error;
    }
    const giftId = links.find((link) =>
      violation.detail.includes(link.contributionId)
    )?.contributionId;
    const donor = rows.find((row) =>
      giftId ? row.giftIds.includes(giftId) : false
    )?.value.name;
    throw new FilingError(
      giftId
        ? `The gift ${giftId}${donor ? ` from ${donor}` : ""} is already in another filing.`
        : "A gift is already in another filing."
    );
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
 * Takes a recorded submission back (wrong references, or recorded before
 * the upload went through): the filing is prepared again. Only while no
 * certificate is attached, since certificates belong to the submission.
 */
export async function undoFilingSubmission(filingId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const filing = await lockFiling(tx, filingId);
    if (filing.status !== "submitted") {
      throw new FilingError("Only a submitted filing can be taken back.");
    }
    const [attached] = await tx
      .select({ total: count() })
      .from(donationCertificate)
      .where(eq(donationCertificate.filingId, filingId));
    if ((attached?.total ?? 0) > 0) {
      throw new FilingError(
        "Certificates are attached to this filing, so its submission can't be taken back."
      );
    }
    await tx
      .update(donationFiling)
      .set({
        acknowledgementNumber: null,
        filedOn: null,
        status: "prepared",
        submittedAt: null,
        submittedBy: null,
        transactionId: null,
      })
      .where(eq(donationFiling.id, filingId));
  });
}

/**
 * Discards a filing that was never submitted: its gifts are free for the
 * next filing, and so are its Pre-ARNs (the portal counts them unconsumed);
 * its number stays used.
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
    // The portal never saw them, so they stay unconsumed there: free them.
    await tx
      .update(donationFilingRow)
      .set({ preArn: null })
      .where(eq(donationFilingRow.filingId, filingId));
    await tx
      .update(donationFiling)
      .set({ discardedAt: now, discardedBy: userId, status: "discarded" })
      .where(eq(donationFiling.id, filingId));
  });
}

/**
 * How each row's gifts differ now from what was filed: net amount after
 * refunds, a reversal, an Exclude choice, another donor or donation type. Such a row
 * needs a revision on the portal.
 */
export async function loadFilingDrift(
  filingIds: readonly string[],
  reader: Reader = db
): Promise<Map<string, FilingDrift[]>> {
  if (filingIds.length === 0) {
    return new Map();
  }
  const gifts = await reader
    .select({
      amountPaise: contribution.amountPaise,
      deductionEligible: contribution.deductionEligible,
      donationType: contribution.donationType,
      filedPaise: donationFilingGift.amountPaise,
      partyId: contribution.partyId,
      refundedPaise: sql<string>`(
        select coalesce(sum(r.amount_paise), 0)
        from ${contributionRefund} r
        where r.contribution_id = ${contribution}.${sql.identifier("id")}
      )`,
      rowDonationTypeCode: donationFilingRow.donationTypeCode,
      rowId: donationFilingGift.rowId,
      rowPartyId: donationFilingRow.partyId,
      status: contribution.status,
    })
    .from(donationFilingGift)
    .innerJoin(
      contribution,
      eq(contribution.id, donationFilingGift.contributionId)
    )
    .innerJoin(
      donationFilingRow,
      eq(donationFilingRow.id, donationFilingGift.rowId)
    )
    .where(inArray(donationFilingGift.filingId, [...filingIds]));
  const drift = new Map<string, Set<FilingDrift>>();
  for (const gift of gifts) {
    const reasons = drift.get(gift.rowId) ?? new Set<FilingDrift>();
    const net = Math.max(0, gift.amountPaise - Number(gift.refundedPaise));
    if (gift.status === "reversed") {
      reasons.add("reversed");
    } else if (net !== gift.filedPaise) {
      reasons.add("amount");
    }
    if (gift.deductionEligible === "no") {
      reasons.add("excluded");
    }
    if (gift.partyId !== gift.rowPartyId) {
      reasons.add("donor");
    }
    if (
      RETURN_DONATION_TYPE_CODES[gift.donationType as DonationType] !==
      gift.rowDonationTypeCode
    ) {
      reasons.add("donation_type");
    }
    if (reasons.size > 0) {
      drift.set(gift.rowId, reasons);
    }
  }
  return new Map([...drift].map(([rowId, reasons]) => [rowId, [...reasons]]));
}

export interface FilingSummary {
  acknowledgementNumber: string | null;
  certificateCount: number;
  /** Rows whose gifts changed since filing (they need a portal revision). */
  driftCount: number;
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
  const live = filings.filter((filing) => filing.status !== "discarded");
  const drift = await loadFilingDrift(live.map((filing) => filing.id));
  const driftRows =
    drift.size === 0
      ? []
      : await db
          .select({
            filingId: donationFilingRow.filingId,
            id: donationFilingRow.id,
          })
          .from(donationFilingRow)
          .where(inArray(donationFilingRow.id, [...drift.keys()]));
  return filings.map((filing) => {
    const tally = byFiling.get(filing.id);
    return {
      ...filing,
      certificateCount: tally?.certificates ?? 0,
      driftCount: driftRows.filter((row) => row.filingId === filing.id).length,
      emailedCount: tally?.emailed ?? 0,
      emailFailedCount: tally?.failed ?? 0,
      emailQueuedCount: tally?.queued ?? 0,
    };
  });
}

/** The name a certificate's PDF is served and emailed under. */
export const certificateFileName = (acknowledgementNumber: string) =>
  `Form-114-${acknowledgementNumber}.pdf`;

/** Whether the donor can be emailed now: an address that never bounced. */
export type DonorEmailState = "ok" | "none" | "suppressed";

export interface FilingCertificateView {
  acknowledgementNumber: string;
  /** Null while a details match waits for finance to confirm it. */
  confirmedAt: Date | null;
  emailedAt: Date | null;
  emailFailure: CertificateEmailFailure | null;
  emailQueuedAt: Date | null;
  /** `Form-114-<acknowledgement>.pdf`, never the name inside the ZIP. */
  fileName: string;
  id: string;
  matchedBy: CertificateMatch;
}

/** A frozen row as the page shows it: the ID masked, never in full. */
export interface FilingRowView {
  amountPaise: number;
  certificate: FilingCertificateView | null;
  donationTypeCode: string;
  /** How its gifts changed since filing; empty when they haven't. */
  drift: FilingDrift[];
  emailState: DonorEmailState;
  giftCount: number;
  id: string;
  idCode: string;
  idNumberLast4: string | null;
  modeCode: string;
  name: string;
  partyId: string;
  preArn: string | null;
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
      certificateConfirmedAt: donationCertificate.confirmedAt,
      certificateEmailedAt: donationCertificate.emailedAt,
      certificateEmailFailure: donationCertificate.emailFailure,
      certificateEmailQueuedAt: donationCertificate.emailQueuedAt,
      certificateId: donationCertificate.id,
      certificateMatchedBy: donationCertificate.matchedBy,
      donationTypeCode: donationFilingRow.donationTypeCode,
      emailState: emailStateSql,
      giftCount: donationFilingRow.giftCount,
      id: donationFilingRow.id,
      idCode: donationFilingRow.idCode,
      idNumberLast4: donationFilingRow.idNumberLast4,
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
  const drift = await loadFilingDrift([filingId]);
  return rows.map((row) => ({
    amountPaise: row.amountPaise,
    certificate:
      row.certificateId && row.certificateAck && row.certificateMatchedBy
        ? {
            acknowledgementNumber: row.certificateAck,
            confirmedAt: row.certificateConfirmedAt,
            emailedAt: row.certificateEmailedAt,
            emailFailure: row.certificateEmailFailure,
            emailQueuedAt: row.certificateEmailQueuedAt,
            fileName: certificateFileName(row.certificateAck),
            id: row.certificateId,
            matchedBy: row.certificateMatchedBy,
          }
        : null,
    donationTypeCode: row.donationTypeCode,
    drift: drift.get(row.id) ?? [],
    emailState: row.emailState,
    giftCount: row.giftCount,
    id: row.id,
    idCode: row.idCode,
    idNumberLast4: row.idNumberLast4,
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
  preArn: string | null;
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
  /** Stored unconfirmed, for finance to review. */
  needsReview: boolean;
  rowId: string;
  /** The uploaded file's name, for messages; not stored. */
  sourceName: string;
}

/**
 * Stores matched certificates against a submitted filing, then runs
 * `storeFiles` (the R2 writes) before the rows commit, so a refused insert
 * writes no file. A certificate that needs no review is confirmed as
 * stored. An acknowledgement number already stored is reported as a
 * FilingError naming the file.
 */
export async function insertCertificates(
  filingId: string,
  certificates: readonly NewCertificate[],
  userId: string,
  now: Date,
  storeFiles: () => Promise<void>
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
    try {
      for (const part of chunks(certificates)) {
        await tx.insert(donationCertificate).values(
          part.map(({ needsReview, sourceName: _source, ...certificate }) => ({
            ...certificate,
            confirmedAt: needsReview ? null : now,
            confirmedBy: needsReview ? null : userId,
            createdAt: now,
            createdBy: userId,
            filingId,
          }))
        );
      }
    } catch (error) {
      const violation = constraintViolation(error);
      if (violation?.constraint === "donation_certificate_ack_uidx") {
        const file = certificates.find((certificate) =>
          violation.detail.includes(certificate.acknowledgementNumber)
        );
        throw new FilingError(
          `${file?.sourceName ?? "A certificate"} carries an acknowledgement number already stored for another certificate.`
        );
      }
      if (violation?.constraint === "donation_certificate_row_uidx") {
        throw new FilingError(
          "A row already got a certificate meanwhile. Upload again to see the result."
        );
      }
      throw error;
    }
    await storeFiles();
  });
}

/**
 * What other filings already hold, so a certificate of another filing or
 * year is refused: their rows' Pre-ARNs and their certificates' numbers.
 */
export async function loadOtherFilingMarks(filingId: string): Promise<{
  acknowledgementNumbers: Set<string>;
  preArns: Set<string>;
}> {
  const [preArns, acks] = await Promise.all([
    db
      .select({ preArn: donationFilingRow.preArn })
      .from(donationFilingRow)
      .where(
        and(
          ne(donationFilingRow.filingId, filingId),
          isNotNull(donationFilingRow.preArn)
        )
      ),
    db
      .select({ ack: donationCertificate.acknowledgementNumber })
      .from(donationCertificate)
      .where(ne(donationCertificate.filingId, filingId)),
  ]);
  return {
    acknowledgementNumbers: new Set(acks.map((row) => row.ack)),
    preArns: new Set(
      preArns.flatMap((row) => (row.preArn ? [row.preArn] : []))
    ),
  };
}

/** Locks a certificate of a submitted filing for a review decision. */
async function lockCertificateForReview(tx: FilingTx, certificateId: string) {
  const [certificate] = await tx
    .select({
      confirmedAt: donationCertificate.confirmedAt,
      filingId: donationCertificate.filingId,
    })
    .from(donationCertificate)
    .where(eq(donationCertificate.id, certificateId))
    .for("update");
  if (!certificate) {
    throw new FilingError("Certificate not found.");
  }
  if (certificate.confirmedAt) {
    throw new FilingError("This certificate is already confirmed.");
  }
  return certificate;
}

/**
 * Finance confirms a details match after comparing the certificate with
 * the row; only then can it be emailed.
 */
export async function confirmCertificate(
  certificateId: string,
  userId: string,
  now: Date
): Promise<{ filingId: string }> {
  return await db.transaction(async (tx) => {
    const certificate = await lockCertificateForReview(tx, certificateId);
    await tx
      .update(donationCertificate)
      .set({ confirmedAt: now, confirmedBy: userId })
      .where(eq(donationCertificate.id, certificateId));
    return { filingId: certificate.filingId };
  });
}

/**
 * Finance rejects a details match: the certificate is removed, so its row
 * has none again. Its file is left for the orphan cleanup.
 */
export async function rejectCertificate(
  certificateId: string
): Promise<{ filingId: string }> {
  return await db.transaction(async (tx) => {
    const certificate = await lockCertificateForReview(tx, certificateId);
    await tx
      .delete(donationCertificate)
      .where(eq(donationCertificate.id, certificateId));
    return { filingId: certificate.filingId };
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
 * Claims confirmed certificates for emailing in the caller's transaction,
 * so the jobs are sent only if the claim commits. Without `certificateIds`
 * it takes every certificate of the filing never emailed and not on its way
 * (a failed send is taken again under a new request; one queued over
 * `CERTIFICATE_EMAIL_STALE_MS` ago with no outcome, under its own request); with them it is an explicit resend of those,
 * unless one is still on its way.
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
      confirmedAt: donationCertificate.confirmedAt,
      emailedAt: donationCertificate.emailedAt,
      emailFailure: donationCertificate.emailFailure,
      emailQueuedAt: donationCertificate.emailQueuedAt,
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
    const onItsWay =
      certificate.emailQueuedAt !== null &&
      certificate.emailedAt === null &&
      certificate.emailFailure === null &&
      input.now.getTime() - certificate.emailQueuedAt.getTime() <
        CERTIFICATE_EMAIL_STALE_MS;
    const due =
      certificate.confirmedAt !== null &&
      !onItsWay &&
      (input.certificateIds !== undefined || certificate.emailedAt === null);
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
    // A stuck send keeps its request, so it goes out under the same
    // idempotency key and can't be sent twice if the first one did go.
    const stuck =
      certificate.emailRequestId !== null &&
      certificate.emailQueuedAt !== null &&
      certificate.emailedAt === null &&
      certificate.emailFailure === null;
    const requestId =
      stuck && certificate.emailRequestId
        ? certificate.emailRequestId
        : uuidv7();
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
