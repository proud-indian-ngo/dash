import { db } from "@pi-dash/db";
import { getEsignDocument } from "@pi-dash/db/queries/esign";
import {
  fileGovernanceDocumentOnce,
  findGovernanceDocumentBySha256,
  insertGovernanceDocument,
  trusteeNamesForMatching,
} from "@pi-dash/db/queries/governance";
import {
  loadMeetingRecord,
  lockMeeting,
  MeetingError,
  setSignedMinutes,
} from "@pi-dash/db/queries/meetings";
import {
  DeclarationError,
  getConflictDeclaration,
  lockConflictDeclaration,
  setSignedDeclaration,
} from "@pi-dash/db/queries/policies";
import {
  circularResolutions,
  currentRevision,
  type Decision,
  getResolution,
  recordSignature,
  setFinalDocument,
} from "@pi-dash/db/queries/resolutions";
import {
  type ArchiveTarget,
  setArchiveCopy,
} from "@pi-dash/db/queries/signing";
import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { addDays, DOCUMENT_TITLE_MAX } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  circularReference,
  signatureFieldName,
} from "@pi-dash/shared/resolutions";
import { createRequestLogger } from "evlog";

import { getS3 } from "../s3";
import { CircularError, checkSignedUpload, sha256Of } from "./circulars";
import { circularKey, signingCopy } from "./signing-copy";
import {
  finalizeForArchive,
  validateEsignPdf,
  validateSignedPdf,
} from "./signing-service";

export const meetingKey = (meetingId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/governance/meetings/${meetingId}/${name}`;

export const declarationKey = (trusteeId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/governance/declarations/${trusteeId}/${name}`;

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

/**
 * Checks that `uploaded` is `current` with exactly the trustee's signature
 * added in their field, by them by name and, for the helper, from their
 * enrolled certificate. Returns the upload's validation report.
 */
export async function checkOneSignerAdded(input: {
  current: Uint8Array;
  expectedCertificateSha256?: string;
  trusteeId: string;
  uploaded: Uint8Array;
}) {
  const { current, trusteeId, uploaded } = input;
  const [report, currentReport, names] = await Promise.all([
    validateSignedPdf(uploaded, current.byteLength),
    validateSignedPdf(current),
    trusteeNamesForMatching(),
  ]);
  const signature = checkSignedUpload({
    current,
    fieldName: signatureFieldName(trusteeId),
    report,
    signedBefore: currentReport.signatures.length,
    textFieldsBefore: currentReport.textFields ?? {},
    trustee: {
      id: trusteeId,
      names: names.find((n) => n.id === trusteeId)?.names ?? [],
    },
    uploaded,
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
  return report;
}

/**
 * Takes the minutes the chair signed (uploaded from Acrobat, or finished by
 * the signing service for the helper): the generated copy with exactly the
 * chair's signature added. Files them in the vault, makes them the evidence
 * for the resolutions passed at the meeting, and starts the long-term copy.
 */
export async function acceptSignedMinutes(input: {
  /**
   * An Aadhaar eSign copy, already checked against the generated copy whose
   * hash is `basedOnSha256` (`esign-documents.ts`), signed at `signedAt`.
   */
  esign?: {
    basedOnSha256: string;
    report: GovernanceValidationReport;
    signedAt: Date;
  };
  /** For the helper: the enrolled certificate the signature must come from. */
  expectedCertificateSha256?: string;
  meetingId: string;
  uploaded: Uint8Array;
  userId: string | null;
}): Promise<string> {
  const { uploaded } = input;
  const record = await loadMeetingRecord(input.meetingId);
  if (!record) {
    throw new MeetingError("Meeting not found");
  }
  const { meeting: row } = record;
  if (row.minutesDocumentId) {
    throw new MeetingError("The minutes are already signed.");
  }
  if (!(row.minutesObjectKey && row.chairTrusteeId)) {
    throw new MeetingError("Generate the minutes first.");
  }
  const s3 = await getS3();
  const report =
    input.esign?.report ??
    (await checkOneSignerAdded({
      current: new Uint8Array(
        await s3.file(row.minutesObjectKey).arrayBuffer()
      ),
      expectedCertificateSha256: input.expectedCertificateSha256,
      trusteeId: row.chairTrusteeId,
      uploaded,
    }));
  const sha256 = sha256Of(uploaded);
  // Stored by content, so a submission that loses the race below never
  // replaces the accepted copy.
  const objectKey = meetingKey(
    row.id,
    `minutes-signed-${sha256.slice(0, 16)}.pdf`
  );
  await s3.write(objectKey, uploaded, { type: "application/pdf" });
  const heldOn = todayInKolkata(row.startsAt);
  // One submission is accepted, against the copy it was checked against,
  // and the minutes and every resolution's evidence are recorded together.
  const documentId = await db.transaction(async (tx) => {
    const locked = await lockMeeting(tx, row.id);
    if (locked?.minutesDocumentId) {
      throw new MeetingError("The minutes are already signed.");
    }
    if (
      locked?.minutesObjectKey !== row.minutesObjectKey ||
      (input.esign && locked.minutesSha256 !== input.esign.basedOnSha256)
    ) {
      throw new MeetingError(
        locked?.minutesObjectKey
          ? "The minutes were generated again. Sign the new copy."
          : "The proceedings changed. Generate the minutes again and sign the new copy."
      );
    }
    const id =
      (await findGovernanceDocumentBySha256(sha256, tx))?.id ??
      (await insertGovernanceDocument(
        {
          contentType: "application/pdf",
          datedOn: heldOn,
          kind: "minutes",
          note: `Minutes of the board meeting held on ${heldOn}, signed by the chair.`,
          objectKey,
          originalFilename: `minutes-${heldOn}.pdf`,
          sha256,
          sizeBytes: uploaded.byteLength,
          sourceFormat: "signed_pdf",
          title: `Minutes: ${row.title}`.slice(0, DOCUMENT_TITLE_MAX),
          uploadedBy: input.userId,
          validationReport: report,
        },
        tx
      ));
    await setSignedMinutes(tx, row.id, id);
    for (const item of record.agenda) {
      if (item.outcome === "passed" && item.resolutionId) {
        await setFinalDocument(item.resolutionId, id, tx);
      }
    }
    return id;
  });
  await fileArchiveCopy({
    archiveKey: meetingKey(row.id, "minutes-ltv.pdf"),
    bytes: uploaded,
    esign: input.esign !== undefined,
    log: { meetingId: row.id },
    objectKey,
    target: { documentId },
  });
  return documentId;
}

/**
 * Takes a declaration of interests its trustee signed (uploaded from
 * Acrobat, or finished by the signing service for the helper): the
 * generated copy with exactly their signature added. Files it in the vault
 * as the declaration's document, which puts it in force, and starts the
 * long-term copy.
 */
export async function acceptSignedDeclaration(input: {
  declarationId: string;
  /**
   * An Aadhaar eSign copy, already checked against the generated copy whose
   * hash is `basedOnSha256` (`esign-documents.ts`), signed at `signedAt`.
   */
  esign?: {
    basedOnSha256: string;
    report: GovernanceValidationReport;
    signedAt: Date;
  };
  /** For the helper: the enrolled certificate the signature must come from. */
  expectedCertificateSha256?: string;
  uploaded: Uint8Array;
  userId: string | null;
}): Promise<string> {
  const { uploaded } = input;
  const row = await getConflictDeclaration(input.declarationId);
  if (!row) {
    throw new DeclarationError("Declaration not found");
  }
  if (!(row.status === "awaiting_signature" && row.objectKey)) {
    throw new DeclarationError("This declaration is already signed.");
  }
  const s3 = await getS3();
  const report =
    input.esign?.report ??
    (await checkOneSignerAdded({
      current: new Uint8Array(await s3.file(row.objectKey).arrayBuffer()),
      expectedCertificateSha256: input.expectedCertificateSha256,
      trusteeId: row.trusteeId,
      uploaded,
    }));
  const sha256 = sha256Of(uploaded);
  // Stored by content, so a submission that loses the race below never
  // replaces the accepted copy.
  const objectKey = declarationKey(
    row.trusteeId,
    `${row.fiscalYear}-signed-${sha256.slice(0, 16)}.pdf`
  );
  await s3.write(objectKey, uploaded, { type: "application/pdf" });
  const today = todayInKolkata(input.esign?.signedAt);
  // One submission is accepted, against the copy it was checked against.
  const documentId = await db.transaction(async (tx) => {
    const locked = await lockConflictDeclaration(tx, row.id);
    if (locked?.status !== "awaiting_signature") {
      throw new DeclarationError("This declaration is already signed.");
    }
    if (
      locked.sha256 !== row.sha256 ||
      (input.esign && locked.sha256 !== input.esign.basedOnSha256)
    ) {
      throw new DeclarationError(
        "You declared again meanwhile. Sign the new copy."
      );
    }
    const id =
      (await findGovernanceDocumentBySha256(sha256, tx))?.id ??
      (await insertGovernanceDocument(
        {
          contentType: "application/pdf",
          datedOn: today,
          kind: "declaration",
          note: `Signed by ${row.legalName} with ${input.esign ? "Aadhaar eSign" : "their DSC"}.`,
          objectKey,
          originalFilename: `declaration-${row.fiscalYear}.pdf`,
          sha256,
          sizeBytes: uploaded.byteLength,
          sourceFormat: "signed_pdf",
          title:
            `Declaration of interests ${row.fiscalYear}: ${row.legalName}`.slice(
              0,
              DOCUMENT_TITLE_MAX
            ),
          uploadedBy: input.userId,
          validationReport: report,
        },
        tx
      ));
    await setSignedDeclaration(tx, row.id, id);
    return id;
  });
  await fileArchiveCopy({
    archiveKey: declarationKey(
      row.trusteeId,
      `${row.fiscalYear}-${sha256.slice(0, 16)}-ltv.pdf`
    ),
    bytes: uploaded,
    esign: input.esign !== undefined,
    log: { declarationId: row.id },
    objectKey,
    target: { documentId },
  });
  return documentId;
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
  const esign = (await getEsignDocument(row.circularId)) !== null;
  await fileFinalCopy(row.circularId, passed, {
    bytes,
    esign,
    objectKey: revision.latestObjectKey,
    report: esign
      ? await validateEsignPdf(bytes)
      : await validateSignedPdf(bytes),
  });
}

/**
 * The signed PDF the resolutions passed on goes into the vault and becomes
 * their register evidence; its long-term copy (revocation data and a
 * document timestamp) is made now and renewed yearly. A failed long-term
 * copy is logged and retried by the yearly job; the signed original is
 * already safe.
 */
export async function fileFinalCopy(
  circularId: string,
  passedIds: readonly string[],
  signed: {
    bytes: Uint8Array;
    /** Signed with Aadhaar eSign through Leegality. */
    esign?: boolean;
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
    esign: signed.esign,
    log: { circularId },
    objectKey: signed.objectKey,
    target: { documentId },
  });
}

/**
 * Makes a signed PDF's long-term copy (revocation data and a document
 * timestamp), renewed yearly, for a vault document or a signed utilisation
 * certificate. A failure is logged and left due today, so the yearly job
 * retries it; the signed original is already safe.
 */
export async function fileArchiveCopy(input: {
  archiveKey: string;
  bytes: Uint8Array;
  /** Signed with Aadhaar eSign through Leegality. */
  esign?: boolean;
  /** Identifiers for the log line. */
  log: Record<string, string>;
  /** The signed original, which stands in until the copy is made. */
  objectKey: string;
  target: ArchiveTarget;
}): Promise<void> {
  try {
    const archived = await finalizeForArchive(input.bytes, {
      esign: input.esign,
    });
    const s3 = await getS3();
    await s3.write(input.archiveKey, archived, { type: "application/pdf" });
    await setArchiveCopy(input.target, {
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
    await setArchiveCopy(input.target, {
      objectKey: input.objectKey,
      renewOn: todayInKolkata(),
      sha256: sha256Of(input.bytes),
    }).catch(() => undefined);
  }
}
