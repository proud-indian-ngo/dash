import { createHash } from "node:crypto";

import { db } from "@pi-dash/db";
import {
  claimCertificateEmails,
  discardFiling,
  FilingError,
  type FilingRowView,
  type FilingSubmission,
  insertCertificates,
  insertFiling,
  loadFiledSequences,
  loadFilingHeader,
  loadFilingMatchRows,
  loadFilingRows,
  lockFilingYear,
  type NewCertificate,
  nextFilingSequence,
  recordFilingSubmission,
} from "@pi-dash/db/queries/donation-filings";
import { env } from "@pi-dash/env/server";
import { enqueue, inTransaction } from "@pi-dash/jobs/enqueue";
import { MAX_FILINGS_PER_YEAR } from "@pi-dash/shared/donations-return";
import type { FinancialYearRange } from "@pi-dash/shared/income";
import { uuidv7 } from "uuidv7";

import {
  CertificateUploadError,
  extractPdfText,
  matchCertificates,
  type ReadCertificate,
  readCertificateFields,
  unpackCertificateUpload,
} from "@/lib/donation-filings/certificate-parser";
import {
  MAX_CERTIFICATE_UPLOAD_BYTES,
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
  submit: "The submission couldn't be saved.",
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
      if (sequence > MAX_FILINGS_PER_YEAR) {
        throw new DonationsReturnError(
          `A year takes at most ${MAX_FILINGS_PER_YEAR} filings.`
        );
      }
      const draft = await buildUploadFile(fy, {
        filedSequences: await loadFiledSequences(fy.label, tx),
        reader: tx,
        sequence,
      });
      const id = uuidv7();
      const bytes = new TextEncoder().encode(draft.file.csv);
      const objectKey = `${filingFolder(id)}/${draft.file.filename}`;
      await getS3().write(objectKey, bytes, { type: "text/csv" });
      await insertFiling(tx, {
        createdBy: userId,
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

export const discard = (filingId: string, userId: string): Promise<void> =>
  safely("discard", () => discardFiling(filingId, userId, new Date()));

export interface CertificateUploadResult {
  alreadyStored: { fileName: string; rowId: string }[];
  matched: {
    acknowledgementNumber: string;
    fileName: string;
    matchedBy: "pre_arn" | "details";
    rowId: string;
  }[];
  unmatched: { fileName: string; reason: UnmatchedReason }[];
}

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
    const filing = await loadFilingHeader(filingId);
    if (!filing) {
      throw new FilingError("Filing not found.");
    }
    if (filing.status !== "submitted") {
      throw new FilingError(
        "Record the portal's acknowledgement before adding certificates."
      );
    }
    const bytes = new Uint8Array(Buffer.from(upload.base64, "base64"));
    if (bytes.byteLength > MAX_CERTIFICATE_UPLOAD_BYTES) {
      throw new CertificateUploadError(
        "The file is too large. Upload the certificates in parts."
      );
    }
    const { files, skipped } = unpackCertificateUpload(upload.fileName, bytes);
    const read: ReadCertificate[] = [];
    for (const file of files) {
      let fields: ReadCertificate["fields"] = null;
      try {
        fields = readCertificateFields(await extractPdfText(file.bytes));
      } catch {
        fields = null;
      }
      read.push({ fields, name: file.name, sha256: sha256(file.bytes) });
    }
    const decisions = matchCertificates(
      read,
      await loadFilingMatchRows(filingId),
      filing.acknowledgementNumber
    );
    const result: CertificateUploadResult = {
      alreadyStored: [],
      matched: [],
      unmatched: skipped.map((file) => ({
        fileName: file.name,
        reason: file.reason,
      })),
    };
    const toStore: NewCertificate[] = [];
    const s3 = getS3();
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
      const id = uuidv7();
      const fileObjectKey = `${filingFolder(filingId)}/certificates/${id}.pdf`;
      await s3.write(fileObjectKey, file.bytes, { type: "application/pdf" });
      toStore.push({
        acknowledgementNumber: decision.acknowledgementNumber,
        fileName: file.name.split("/").at(-1) ?? file.name,
        fileObjectKey,
        fileSha256: fileRead.sha256,
        id,
        matchedBy: decision.matchedBy,
        rowId: decision.rowId,
      });
      result.matched.push({
        acknowledgementNumber: decision.acknowledgementNumber,
        fileName: file.name,
        matchedBy: decision.matchedBy,
        rowId: decision.rowId,
      });
    }
    await insertCertificates(filingId, toStore, userId, new Date());
    return result;
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
