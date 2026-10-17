import {
  findGovernanceDocumentBySha256,
  insertGovernanceDocument,
  trusteeNamesForMatching,
} from "@pi-dash/db/queries/governance";
import {
  currentRevision,
  type Decision,
  getResolution,
  recordSignature,
  responseFor,
  setFinalDocument,
} from "@pi-dash/db/queries/resolutions";
import { setArchiveCopy } from "@pi-dash/db/queries/signing";
import { env } from "@pi-dash/env/server";
import { addDays, DOCUMENT_TITLE_MAX } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createRequestLogger } from "evlog";

import { getS3 } from "../s3";
import { CircularError, checkSignedUpload, sha256Of } from "./circulars";
import { finalizeForArchive, validateSignedPdf } from "./signing-service";

/** Days between the archive copy's document timestamps. */
const ARCHIVE_RENEW_DAYS = 365;

const resolutionKey = (resolutionId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/governance/resolutions/${resolutionId}/${name}`;

/**
 * Takes a PDF a trustee signed (uploaded from Acrobat, or finished by the
 * signing service for the helper), checks it against the latest copy,
 * stores it and records the assent. Passing files the final copy in the
 * vault and makes its long-term copy.
 */
export async function acceptSignedPdf(input: {
  /** For the helper: the enrolled certificate the signature must come from. */
  expectedCertificateSha256?: string;
  method: "acrobat_upload" | "dsc_helper";
  resolutionId: string;
  trustee: { id: string; legalName: string };
  uploaded: Uint8Array;
  userId: string;
}): Promise<Decision> {
  const response = await responseFor(input.resolutionId, input.trustee.id);
  const revision = await currentRevision(input.resolutionId);
  if (!(response && revision)) {
    throw new CircularError(
      "You weren't a trustee in office when this was issued."
    );
  }
  const s3 = await getS3();
  const current = new Uint8Array(
    await s3.file(revision.latestObjectKey).arrayBuffer()
  );
  const [report, currentReport, names] = await Promise.all([
    validateSignedPdf(input.uploaded),
    validateSignedPdf(current),
    trusteeNamesForMatching(),
  ]);
  const signature = checkSignedUpload({
    current,
    fieldName: response.fieldName,
    report,
    signedBefore: currentReport.signatures.length,
    trustee: {
      id: input.trustee.id,
      names: names.find((n) => n.id === input.trustee.id)?.names ?? [
        input.trustee.legalName,
      ],
    },
    uploaded: input.uploaded,
  });
  if (
    input.expectedCertificateSha256 &&
    signature.sha256Fingerprint.toLowerCase() !==
      input.expectedCertificateSha256.toLowerCase()
  ) {
    throw new CircularError(
      "The signature isn't from the certificate enrolled for you."
    );
  }
  const sha256 = sha256Of(input.uploaded);
  const objectKey = resolutionKey(
    input.resolutionId,
    `signed-${String(currentReport.signatures.length + 1)}.pdf`
  );
  await s3.write(objectKey, input.uploaded, { type: "application/pdf" });
  const decision = await recordSignature({
    basedOnSha256: revision.latestSha256,
    createdBy: input.userId,
    method: input.method,
    objectKey,
    resolutionId: input.resolutionId,
    sha256,
    signature: { ...signature, matchedTrusteeId: input.trustee.id },
    today: todayInKolkata(),
    trusteeId: input.trustee.id,
  });
  if (decision.status === "passed") {
    await fileFinalCopy(input.resolutionId, objectKey, input.uploaded, report);
  }
  return decision;
}

/**
 * The fully signed PDF goes into the vault and becomes the register's
 * evidence; its long-term copy (revocation data and a document timestamp)
 * is made now and renewed yearly. A failed long-term copy is logged and
 * retried by the yearly job; the signed original is already safe.
 */
async function fileFinalCopy(
  resolutionId: string,
  objectKey: string,
  bytes: Uint8Array,
  report: Awaited<ReturnType<typeof validateSignedPdf>>
): Promise<void> {
  const row = await getResolution(resolutionId);
  if (!row) {
    return;
  }
  const sha256 = sha256Of(bytes);
  const existing = await findGovernanceDocumentBySha256(sha256);
  const documentId =
    existing?.id ??
    (await insertGovernanceDocument({
      contentType: "application/pdf",
      datedOn: row.decidedOn ?? todayInKolkata(),
      kind: "resolution",
      note: `Passed by circulation as ${row.number ?? ""}.`,
      objectKey,
      originalFilename: `${(row.number ?? "resolution").replaceAll("/", "-")}.pdf`,
      sha256,
      sizeBytes: bytes.byteLength,
      sourceFormat: "signed_pdf",
      title: `${row.number ?? ""} ${row.title}`
        .trim()
        .slice(0, DOCUMENT_TITLE_MAX),
      uploadedBy: row.draftedBy,
      validationReport: report,
    }));
  await setFinalDocument(resolutionId, documentId);
  await fileArchiveCopy({
    bytes,
    documentId,
    log: { resolutionId },
    objectKey,
    archiveKey: resolutionKey(resolutionId, "final-ltv.pdf"),
  });
}

/**
 * Makes a signed vault document's long-term copy (revocation data and a
 * document timestamp), renewed yearly. A failure is logged and left due
 * today, so the yearly job retries it; the signed original is already safe.
 */
export async function fileArchiveCopy(input: {
  archiveKey: string;
  bytes: Uint8Array;
  documentId: string;
  /** Identifiers for the log line. */
  log: Record<string, string>;
  /** The signed original, which stands in until the copy is made. */
  objectKey: string;
}): Promise<void> {
  try {
    const archived = await finalizeForArchive(input.bytes);
    const s3 = await getS3();
    await s3.write(input.archiveKey, archived, { type: "application/pdf" });
    await setArchiveCopy(input.documentId, {
      objectKey: input.archiveKey,
      renewOn: addDays(todayInKolkata(), ARCHIVE_RENEW_DAYS),
      sha256: sha256Of(archived),
    });
  } catch (error) {
    const log = createRequestLogger({
      method: "POST",
      path: "governance/fileArchiveCopy",
    });
    log.set({ event: "archive_copy_failed", ...input.log });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    await setArchiveCopy(input.documentId, {
      objectKey: input.objectKey,
      renewOn: todayInKolkata(),
      sha256: sha256Of(input.bytes),
    }).catch(() => undefined);
  }
}
