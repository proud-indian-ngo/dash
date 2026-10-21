import { createHash } from "node:crypto";

import { db } from "@pi-dash/db";
import {
  certificateFileName,
  claimCertificateEmails,
  discardFiling,
  FilingError,
  type FilingHeader,
  type FilingRowView,
  type FilingSubmission,
  insertCertificates,
  insertFiling,
  loadFiledSequences,
  loadFilingHeader,
  loadFilingMatchRows,
  loadFilingRows,
  loadOtherFilingMarks,
  lockFilingYear,
  type NewCertificate,
  nextFilingSequence,
  recordFilingSubmission,
  rejectCertificate,
  confirmCertificate,
  undoFilingSubmission,
} from "@pi-dash/db/queries/donation-filings";
import { env } from "@pi-dash/env/server";
import { enqueue, inTransaction } from "@pi-dash/jobs/enqueue";
import type { FinancialYearRange } from "@pi-dash/shared/income";
import { uuidv7 } from "uuidv7";

import {
  assessAssignedCertificate,
  CertificateUploadError,
  extractPdfText,
  type FilingContext,
  matchCertificates,
  type ReadCertificate,
  readCertificateFields,
  unpackCertificateUpload,
} from "@/lib/donation-filings/certificate-parser";
import {
  MAX_CERTIFICATE_UPLOAD_BYTES,
  UNMATCHED_REASON_LABELS,
  type UnmatchedReason,
} from "@/lib/donation-filings/certificate-terms";
import {
  buildUploadFile,
  DonationsReturnError,
  type ReturnFile,
} from "@/lib/donations-return-export";
import { getS3 } from "@/lib/s3";
import { withSafeErrors } from "@/lib/safe-errors";

/**
 * Server only: donations return filings and Form 114 certificates. Files are
 * private R2 objects under `<prefix>/donation-filings/<filingId>/`, read only
 * through the audited routes. Refusals reach the browser as written; any
 * other error is logged by name only, because query errors quote donor
 * details.
 */

const MESSAGES = {
  certificates: "The certificates couldn't be added.",
  discard: "The filing couldn't be discarded.",
  email: "The certificates couldn't be queued for email.",
  record: "The filing couldn't be recorded.",
  rows: "The filing couldn't be loaded.",
  review: "The certificate couldn't be updated.",
  submit: "The submission couldn't be saved.",
  undo: "The submission couldn't be taken back.",
} as const;

const safely = <T>(step: keyof typeof MESSAGES, work: () => Promise<T>) =>
  withSafeErrors(
    {
      fields: { event: "donation_filing_failed", step },
      isUserFacing: (error) =>
        error instanceof FilingError ||
        error instanceof DonationsReturnError ||
        error instanceof CertificateUploadError,
      message: MESSAGES[step],
      path: "donation-filings",
    },
    work
  );

const filingFolder = (filingId: string) =>
  `${env.R2_KEY_PREFIX}/donation-filings/${filingId}`;

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export interface RecordedFiling {
  file: ReturnFile;
  filingId: string;
  giftCount: number;
  rowCount: number;
  sequence: number;
}

/**
 * Freezes the ready gifts not yet filed into the year's next filing and
 * keeps its upload file. One transaction per year at a time, so two people
 * recording at once can't file a gift twice; the file is written before the
 * rows commit, and an unreferenced file is swept by the orphan cleanup.
 */
export const recordFiling = (
  fy: FinancialYearRange,
  userId: string
): Promise<RecordedFiling> =>
  safely("record", () =>
    db.transaction(async (tx) => {
      await lockFilingYear(tx, fy.label);
      const sequence = await nextFilingSequence(tx, fy.label);
      const draft = await buildUploadFile(fy, {
        filedGifts: await loadFiledSequences(tx),
        reader: tx,
        sequence,
      });
      const id = uuidv7();
      const bytes = new TextEncoder().encode(draft.file.csv);
      const objectKey = `${filingFolder(id)}/${draft.file.filename}`;
      await getS3().write(objectKey, bytes, { type: "text/csv" });
      await insertFiling(tx, {
        createdBy: userId,
        giftNetPaise: draft.giftNetPaise,
        file: {
          name: draft.file.filename,
          objectKey,
          sha256: sha256(bytes),
        },
        fiscalYear: fy.label,
        id,
        now: new Date(),
        rows: draft.rows,
        sequence,
      });
      return {
        file: draft.file,
        filingId: id,
        giftCount: draft.giftCount,
        rowCount: draft.rows.length,
        sequence,
      };
    })
  );

export const loadRows = (filingId: string): Promise<FilingRowView[]> =>
  safely("rows", () => loadFilingRows(filingId));

export const submitFiling = (
  filingId: string,
  submission: FilingSubmission,
  userId: string
): Promise<void> =>
  safely("submit", () =>
    recordFilingSubmission(filingId, submission, userId, new Date())
  );

export const undoSubmission = (filingId: string): Promise<void> =>
  safely("undo", () => undoFilingSubmission(filingId));

/** Confirms or rejects a details match after finance compared it. */
export const reviewCertificate = (
  certificateId: string,
  decision: "confirm" | "reject",
  userId: string
): Promise<{ filingId: string }> =>
  safely("review", () =>
    decision === "confirm"
      ? confirmCertificate(certificateId, userId, new Date())
      : rejectCertificate(certificateId)
  );

export const discard = (filingId: string, userId: string): Promise<void> =>
  safely("discard", () => discardFiling(filingId, userId, new Date()));

export interface CertificateUploadResult {
  alreadyStored: { fileName: string; rowId: string }[];
  matched: {
    acknowledgementNumber: string;
    fileName: string;
    matchedBy: "details";
    needsReview: true;
    rowId: string;
  }[];
  unmatched: { fileName: string; reason: UnmatchedReason }[];
}

/**
 * Reads an upload (the portal's ZIP or single PDFs), matches each PDF to a
 * row of the filing and stores the matched ones. Unmatched files are
 * reported, never stored.
 */
/** Reads a PDF's certificate fields; null when its text can't be read. */
async function readFields(bytes: Uint8Array) {
  try {
    return readCertificateFields(await extractPdfText(bytes));
  } catch {
    return null;
  }
}

async function filingContext(filing: FilingHeader): Promise<FilingContext> {
  const others = await loadOtherFilingMarks(filing.id);
  return {
    acknowledgementNumber: filing.acknowledgementNumber,
    fiscalYear: filing.fiscalYear,
    otherAcknowledgementNumbers: others.acknowledgementNumbers,
  };
}

async function requireSubmittedFiling(filingId: string) {
  const filing = await loadFilingHeader(filingId);
  if (!filing) {
    throw new FilingError("Filing not found.");
  }
  if (filing.status !== "submitted") {
    throw new FilingError(
      "Record the portal's acknowledgement before adding certificates."
    );
  }
  return filing;
}

function decodeUpload(base64: string) {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength > MAX_CERTIFICATE_UPLOAD_BYTES) {
    throw new CertificateUploadError(
      "The file is too large. Upload the certificates in parts."
    );
  }
  return bytes;
}

/**
 * Inserts the certificates and writes their PDFs before the rows commit:
 * nothing is written for a refused insert, and the files written are
 * deleted again when the transaction fails.
 */
async function storeCertificates(
  filingId: string,
  items: readonly { bytes: Uint8Array; certificate: NewCertificate }[],
  userId: string
) {
  const s3 = getS3();
  const written: string[] = [];
  try {
    await insertCertificates(
      filingId,
      items.map((item) => item.certificate),
      userId,
      new Date(),
      async () => {
        for (const item of items) {
          await s3.write(item.certificate.fileObjectKey, item.bytes, {
            type: "application/pdf",
          });
          written.push(item.certificate.fileObjectKey);
        }
      }
    );
  } catch (error) {
    await Promise.allSettled(written.map((key) => s3.delete(key)));
    throw error;
  }
}

const newCertificate = (
  filingId: string,
  values: Omit<NewCertificate, "fileName" | "fileObjectKey" | "id">
): NewCertificate => {
  const id = uuidv7();
  return {
    ...values,
    fileName: certificateFileName(values.acknowledgementNumber),
    fileObjectKey: `${filingFolder(filingId)}/certificates/${id}.pdf`,
    id,
  };
};

/**
 * Reads an upload (the portal's ZIP or single PDFs), matches each PDF to a
 * row of the filing and stores the matched ones. Unmatched files are
 * reported, never stored.
 */
export const uploadCertificates = (
  filingId: string,
  upload: { base64: string; fileName: string },
  userId: string
): Promise<CertificateUploadResult> =>
  safely("certificates", async () => {
    const filing = await requireSubmittedFiling(filingId);
    const bytes = decodeUpload(upload.base64);
    const { files, skipped } = unpackCertificateUpload(upload.fileName, bytes);
    const read: ReadCertificate[] = [];
    for (const file of files) {
      read.push({
        fields: await readFields(file.bytes),
        name: file.name,
        sha256: sha256(file.bytes),
      });
    }
    const decisions = matchCertificates(
      read,
      await loadFilingMatchRows(filingId),
      await filingContext(filing)
    );
    const result: CertificateUploadResult = {
      alreadyStored: [],
      matched: [],
      unmatched: skipped.map((file) => ({
        fileName: file.name,
        reason: file.reason,
      })),
    };
    const toStore: { bytes: Uint8Array; certificate: NewCertificate }[] = [];
    for (const [index, decision] of decisions.entries()) {
      const file = files[index];
      const fileRead = read[index];
      if (!(file && fileRead)) {
        continue;
      }
      if (decision.kind === "unmatched") {
        result.unmatched.push({ fileName: file.name, reason: decision.reason });
        continue;
      }
      if (decision.kind === "already_stored") {
        result.alreadyStored.push({
          fileName: file.name,
          rowId: decision.rowId,
        });
        continue;
      }
      toStore.push({
        bytes: file.bytes,
        certificate: newCertificate(filingId, {
          acknowledgementNumber: decision.acknowledgementNumber,
          fileSha256: fileRead.sha256,
          matchedBy: decision.matchedBy,
          rowId: decision.rowId,
          sourceName: file.name,
        }),
      });
      result.matched.push({
        acknowledgementNumber: decision.acknowledgementNumber,
        fileName: file.name,
        matchedBy: decision.matchedBy,
        needsReview: decision.needsReview,
        rowId: decision.rowId,
      });
    }
    await storeCertificates(filingId, toStore, userId);
    return result;
  });

/**
 * Finance assigns one certificate PDF to a row by hand, for a certificate
 * matching couldn't place (such as two cash rows of the same donor and
 * amount). It goes to review like a details match.
 */
export const assignCertificate = (
  filingId: string,
  rowId: string,
  upload: { base64: string; fileName: string },
  userId: string
): Promise<{ acknowledgementNumber: string }> =>
  safely("certificates", async () => {
    const filing = await requireSubmittedFiling(filingId);
    const { files } = unpackCertificateUpload(
      upload.fileName,
      decodeUpload(upload.base64)
    );
    const [file] = files;
    if (!file || files.length > 1) {
      throw new CertificateUploadError("Choose one certificate PDF.");
    }
    const row = (await loadFilingMatchRows(filingId)).find(
      (candidate) => candidate.id === rowId
    );
    if (!row) {
      throw new FilingError("That row isn't in this filing.");
    }
    if (row.certificate) {
      throw new FilingError("That row already has a certificate.");
    }
    const fields = await readFields(file.bytes);
    if (!fields) {
      throw new CertificateUploadError(UNMATCHED_REASON_LABELS.unreadable);
    }
    const assessed = assessAssignedCertificate(
      fields,
      await filingContext(filing)
    );
    if ("reason" in assessed) {
      throw new CertificateUploadError(
        UNMATCHED_REASON_LABELS[assessed.reason]
      );
    }
    await storeCertificates(
      filingId,
      [
        {
          bytes: file.bytes,
          certificate: newCertificate(filingId, {
            acknowledgementNumber: assessed.acknowledgementNumber,
            fileSha256: sha256(file.bytes),
            matchedBy: "manual",
            rowId,
            sourceName: file.name,
          }),
        },
      ],
      userId
    );
    return assessed;
  });

export interface QueuedCertificateEmails {
  noEmail: string[];
  queued: number;
  suppressed: string[];
}

/**
 * Queues one email job per certificate claimed, in the claim's transaction,
 * so a job exists exactly when its claim commits.
 */
export const queueCertificateEmails = (
  filingId: string,
  certificateIds?: readonly string[]
): Promise<QueuedCertificateEmails> =>
  safely("email", () =>
    db.transaction(async (tx) => {
      const plan = await claimCertificateEmails(tx, {
        certificateIds,
        filingId,
        now: new Date(),
      });
      for (const claim of plan.claimed) {
        await enqueue("send-donation-certificate", claim, {
          db: inTransaction(tx),
          singletonKey: `donation-certificate-${claim.certificateId}-${claim.requestId}`,
        });
      }
      return {
        noEmail: plan.noEmail,
        queued: plan.claimed.length,
        suppressed: plan.suppressed,
      };
    })
  );
