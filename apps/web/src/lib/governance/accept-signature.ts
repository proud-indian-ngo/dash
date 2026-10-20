import {
  fileGovernanceDocumentOnce,
  trusteeNamesForMatching,
} from "@pi-dash/db/queries/governance";
import {
  circularResolutions,
  currentRevision,
  type Decision,
  getResolution,
  recordSignature,
  setFinalDocument,
} from "@pi-dash/db/queries/resolutions";
import { setArchiveCopy } from "@pi-dash/db/queries/signing";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { addDays, DOCUMENT_TITLE_MAX } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { circularReference } from "@pi-dash/shared/resolutions";
import { createRequestLogger } from "evlog";

import { getS3 } from "../s3";
import { CircularError, checkSignedUpload, sha256Of } from "./circulars";
import { circularKey, signingCopy } from "./signing-copy";
import { finalizeForArchive, validateSignedPdf } from "./signing-service";

/** Days between the archive copy's document timestamps. */
const ARCHIVE_RENEW_DAYS = 365;

/** What a trustee hears after signing: what it passed, and what failed with it. */
export function signedMessage(
  decisions: readonly { number: string | null; status: string }[]
): string {
  const numbers = decisions
    .filter((d) => d.status === "passed")
    .map((d) => d.number ?? "");
  const failed = decisions.filter((d) => d.status === "failed").length;
  const passed =
    numbers.length === 0
      ? "Your signature is on the circular."
      : numbers.length === 1
        ? `The resolution passed as ${numbers[0]}.`
        : `Resolutions ${numbers.join(", ")} passed.`;
  const failedText =
    failed === 0
      ? ""
      : ` ${failed === 1 ? "One resolution" : `${failed} resolutions`} didn't pass; the circular shows why.`;
  return `Signed. ${passed}${failedText}`;
}

/** Tells everyone, once, about the resolutions one response just decided. */
export function enqueueDecided(
  decisions: readonly { resolutionId: string; status: string }[]
): void {
  const resolutionIds = decisions
    .filter((d) => d.status !== "issued")
    .map((d) => d.resolutionId);
  if (resolutionIds.length === 0) {
    return;
  }
  withFireAndForgetLog(
    { handler: "resolution:decided", resolutionIds: resolutionIds.join(",") },
    async () => {
      await enqueue("notify-resolution-decided", { resolutionIds });
    }
  );
}

/**
 * Takes a circular a trustee signed (uploaded from Acrobat, or finished by
 * the signing service for the helper), checks it against the copy with
 * their answers that they were given, stores it and records
 * their assents. Resolutions that pass file the signed copy in the vault and
 * make its long-term copy; each decision notifies everyone.
 */
export async function acceptSignedPdf(input: {
  circularId: string;
  /** For the helper: the enrolled certificate the signature must come from. */
  expectedCertificateSha256?: string;
  method: "acrobat_upload" | "dsc_helper";
  trustee: { id: string; legalName: string };
  uploaded: Uint8Array;
  userId: string;
}): Promise<Decision[]> {
  const copy = await signingCopy(input.circularId, input.trustee.id, {
    create: false,
  });
  const [report, copyReport, names] = await Promise.all([
    validateSignedPdf(input.uploaded, copy.bytes.byteLength),
    validateSignedPdf(copy.bytes),
    trusteeNamesForMatching(),
  ]);
  const signature = checkSignedUpload({
    current: copy.bytes,
    fieldName: copy.fieldName,
    report,
    signedBefore: copyReport.signatures.length,
    textFieldsBefore: copyReport.textFields ?? {},
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
  // Keyed by content: a copy refused as stale mustn't overwrite one accepted.
  const objectKey = circularKey(
    input.circularId,
    `signed-${String(copyReport.signatures.length + 1)}-${sha256.slice(0, 16)}.pdf`
  );
  const s3 = await getS3();
  await s3.write(objectKey, input.uploaded, { type: "application/pdf" });
  const decisions = await recordSignature({
    answers: copy.answers,
    basedOnSha256: copy.basedOnSha256,
    circularId: input.circularId,
    createdBy: input.userId,
    method: input.method,
    objectKey,
    sha256,
    signature: { ...signature, matchedTrusteeId: input.trustee.id },
    today: todayInKolkata(),
    trusteeId: input.trustee.id,
  });
  // First, so a failure filing the evidence can't lose the notice.
  enqueueDecided(decisions);
  const passed = passedIds(decisions);
  if (passed.length > 0) {
    await fileFinalCopy(input.circularId, passed, {
      bytes: input.uploaded,
      objectKey,
      report,
    });
  }
  return decisions;
}

function passedIds(decisions: readonly Decision[]): string[] {
  return decisions
    .filter((d) => d.status === "passed")
    .map((d) => d.resolutionId);
}

/**
 * An objection or a declared conflict can pass resolutions too (a conflict
 * lowers the count needed). They pass on the signatures already given, so
 * the circular's latest signed PDF is filed as their evidence, as a
 * signature's would be.
 */
export async function fileEvidenceAfterResponse(
  resolutionId: string,
  decisions: readonly Decision[]
): Promise<void> {
  const passed = passedIds(decisions);
  if (passed.length === 0) {
    return;
  }
  const row = await getResolution(resolutionId);
  const revision = row?.circularId
    ? await currentRevision(row.circularId)
    : null;
  if (!(row?.circularId && revision)) {
    return;
  }
  const s3 = await getS3();
  const bytes = new Uint8Array(
    await s3.file(revision.latestObjectKey).arrayBuffer()
  );
  await fileFinalCopy(row.circularId, passed, {
    bytes,
    objectKey: revision.latestObjectKey,
    report: await validateSignedPdf(bytes),
  });
}

/**
 * The signed PDF the resolutions passed on goes into the vault and becomes
 * their register evidence; its long-term copy (revocation data and a
 * document timestamp) is made now and renewed yearly. A failed long-term
 * copy is logged and retried by the yearly job; the signed original is
 * already safe.
 */
async function fileFinalCopy(
  circularId: string,
  passedIds: readonly string[],
  signed: {
    bytes: Uint8Array;
    objectKey: string;
    report: Awaited<ReturnType<typeof validateSignedPdf>>;
  }
): Promise<void> {
  const rows = (await circularResolutions(circularId)).filter((r) =>
    passedIds.includes(r.id)
  );
  const [first] = rows;
  if (!first) {
    return;
  }
  const numbers = rows.map((r) => r.number ?? "").filter(Boolean);
  const sha256 = sha256Of(signed.bytes);
  const title =
    rows.length === 1
      ? `${first.number ?? ""} ${first.title}`
      : `${numbers.join(", ")} (circular ${circularReference(circularId)})`;
  // Concurrent responses can pass resolutions on the same PDF: each files
  // it once by its hash and links its own resolutions to the one document.
  const documentId = await fileGovernanceDocumentOnce({
    contentType: "application/pdf",
    datedOn: first.decidedOn ?? todayInKolkata(),
    kind: "resolution",
    note: `Passed by circulation as ${numbers.join(", ")}.`,
    objectKey: signed.objectKey,
    originalFilename: `${(numbers[0] ?? "resolution").replaceAll("/", "-")}.pdf`,
    sha256,
    sizeBytes: signed.bytes.byteLength,
    sourceFormat: "signed_pdf",
    title: title.trim().slice(0, DOCUMENT_TITLE_MAX),
    uploadedBy: first.draftedBy,
    validationReport: signed.report,
  });
  for (const row of rows) {
    await setFinalDocument(row.id, documentId);
  }
  await fileArchiveCopy({
    archiveKey: circularKey(circularId, `final-ltv-${sha256.slice(0, 16)}.pdf`),
    bytes: signed.bytes,
    documentId,
    log: { circularId },
    objectKey: signed.objectKey,
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
