import {
  type EsignTarget,
  getEsignDocumentFor,
} from "@pi-dash/db/queries/esign";
import {
  getMeeting,
  loadMeetingRecord,
  MeetingError,
} from "@pi-dash/db/queries/meetings";
import {
  DeclarationError,
  getConflictDeclaration,
} from "@pi-dash/db/queries/policies";
import {
  CertificateError,
  getCertificate,
  recordCertificateSignature,
} from "@pi-dash/db/queries/utilisation-certificates";
import { ESIGN_MAX_RESPONSE_DAYS } from "@pi-dash/shared/resolutions";

import { runAuditedAction } from "../audit";
import {
  certificateKey,
  enqueueCertificateNotice,
  readLatest,
} from "../grants/utilisation-certificates";
import { getS3 } from "../s3";
import {
  acceptSignedDeclaration,
  acceptSignedMinutes,
  declarationKey,
  fileArchiveCopy,
  meetingKey,
} from "./accept-signature";
import { CircularError, sha256Of } from "./circulars";
import {
  assertSignersHaveAccounts,
  closeEsign,
  discardEsignDocument,
  dropEsignDocument,
  sendForEsign,
  signerActor,
  signingLinkIn,
  takeNewEsigns,
  withdrawEsign,
} from "./esign";
import { validateEsignPdf } from "./signing-service";

/**
 * Aadhaar eSign for the documents other than circulars
 * (governance-resolutions.md, Aadhaar eSign): a meeting's minutes (the
 * chair), a declaration of interests (its trustee) and a utilisation
 * certificate (the Head of the Organisation, then the Chief Finance
 * Officer, in that order on Leegality). Each is sent once when it is made,
 * Leegality's copy is the one on record, and its eSigns are taken when the
 * signer presses "I've signed", a manager checks, or the scheduled check
 * runs, through the same acceptance as a DSC copy. A document made again,
 * dropped, discarded or cancelled has its Leegality document withdrawn
 * without an audit trail.
 */

/** What a check for an eSign found. */
export type EsignCollected = "recorded" | "signed" | "waiting";

/**
 * Sends a rendered document for eSign by `signerIds`, who each need an
 * account to open their link, and stores Leegality's copy under
 * `objectKey(sha)`. The open Leegality document of `replaces` (the
 * document made again) is withdrawn; if that fails, the new one is too and
 * nothing changes. Returns the stored copy and what to record with it.
 */
async function sendAndStore(input: {
  irn: string;
  name: string;
  objectKey: (sha256: string) => string;
  rendered: Uint8Array;
  replaces: EsignTarget | null;
  signerIds: readonly string[];
}) {
  await assertSignersHaveAccounts(input.signerIds);
  const sent = await sendForEsign({
    expiryDays: ESIGN_MAX_RESPONSE_DAYS,
    irn: input.irn,
    name: input.name,
    rendered: input.rendered,
    signerIds: input.signerIds,
  });
  try {
    const previous = input.replaces
      ? await getEsignDocumentFor(input.replaces)
      : null;
    if (previous && !previous.closedAt) {
      await withdrawEsign(previous).catch(() => {
        throw new CircularError(
          "The earlier copy's Leegality document couldn't be withdrawn, so nothing was sent. Try again in a few minutes.",
          { fault: true }
        );
      });
    }
    const sha256 = sha256Of(sent.base);
    const objectKey = input.objectKey(sha256);
    const s3 = await getS3();
    await s3.write(objectKey, sent.base, { type: "application/pdf" });
    return {
      discard: () => discardEsignDocument(sent.documentId),
      esign: { documentId: sent.documentId, invitees: sent.invitees },
      objectKey,
      sha256,
    };
  } catch (error) {
    await discardEsignDocument(sent.documentId);
    throw error;
  }
}

/** The DSC helper and Acrobat copies are for DSC documents only. */
export async function assertDscSigned(
  target:
    | { meetingId: string }
    | { declarationId: string }
    | { certificateId: string }
): Promise<void> {
  const mode =
    "meetingId" in target
      ? (await getMeeting(target.meetingId))?.minutesSigningMode
      : "declarationId" in target
        ? (await getConflictDeclaration(target.declarationId))?.signingMode
        : (await getCertificate(target.certificateId))?.signingMode;
  if (mode === "esign") {
    throw new CircularError(
      "This is signed with Aadhaar eSign, on Leegality only."
    );
  }
}

/**
 * A target made again for DSC, discarded or cancelled: its Leegality
 * document is withdrawn, without an audit trail.
 */
export async function dropEsign(target: EsignTarget): Promise<void> {
  await dropEsignDocument(await getEsignDocumentFor(target));
}

// ── Minutes ─────────────────────────────────────────────────────────────────

const MINUTES_HELP = {
  owner: "a governance manager",
  remedy: "Ask a governance manager to make the minutes again.",
};

/** Sends the generated minutes for the chair's eSign; returns Leegality's copy, stored. */
export async function sendMinutesForEsign(input: {
  chairTrusteeId: string;
  meetingId: string;
  reference: string;
  rendered: Uint8Array;
}) {
  return await sendAndStore({
    irn: input.reference,
    name: `Minutes ${input.reference}`,
    objectKey: (sha) =>
      meetingKey(input.meetingId, `minutes-${sha.slice(0, 12)}.pdf`),
    rendered: input.rendered,
    replaces: { meetingId: input.meetingId },
    signerIds: [input.chairTrusteeId],
  });
}

export async function minutesSigningLink(
  meetingId: string,
  trusteeId: string
): Promise<string> {
  return await signingLinkIn(
    await getEsignDocumentFor({ meetingId }),
    trusteeId,
    MINUTES_HELP
  );
}

/**
 * Takes the chair's eSign on the minutes, when made: accepted as a signed
 * copy is (the vault, the meeting's signed status, every passed
 * resolution's evidence), against the copy it was checked against, audited
 * in the chair's name. Minutes signed, made again for DSC or dropped close
 * their Leegality document.
 */
export async function collectMinutesEsign(
  meetingId: string
): Promise<EsignCollected> {
  const doc = await getEsignDocumentFor({ meetingId });
  const record = await loadMeetingRecord(meetingId);
  if (!(doc && record)) {
    return "waiting";
  }
  const row = record.meeting;
  const close = () =>
    closeEsign(doc, `the minutes of ${row.title}`, (name) =>
      meetingKey(meetingId, name)
    );
  if (row.minutesDocumentId) {
    await (row.minutesSigningMode === "esign"
      ? close()
      : dropEsignDocument(doc));
    return "signed";
  }
  if (
    row.minutesSigningMode !== "esign" ||
    !(row.minutesObjectKey && row.chairTrusteeId)
  ) {
    await dropEsignDocument(doc);
    return "waiting";
  }
  if (doc.closedAt) {
    return "waiting";
  }
  const s3 = await getS3();
  const current = new Uint8Array(
    await s3.file(row.minutesObjectKey).arrayBuffer()
  );
  const basedOnSha256 = sha256Of(current);
  if (basedOnSha256 !== row.minutesSha256) {
    throw new CircularError(
      "The minutes' copy doesn't match its record. Make them again.",
      { fault: true }
    );
  }
  const taken = await takeNewEsigns(doc, current, []);
  const signature = taken?.added[0];
  if (!(taken && signature)) {
    return "waiting";
  }
  const actor = await signerActor(row.chairTrusteeId);
  const accept = () =>
    acceptSignedMinutes({
      esign: {
        basedOnSha256,
        report: taken.report,
        signedAt: new Date(signature.signedAt),
      },
      meetingId,
      uploaded: taken.file,
      userId: actor?.userId ?? null,
    });
  try {
    await (actor
      ? runAuditedAction(
          {
            action: "meeting.sign_minutes",
            actor,
            metadata: { method: "esign" },
            target: { id: meetingId, type: "meeting" },
          },
          accept
        )
      : accept());
  } catch (error) {
    // Another check recorded it first.
    if (
      error instanceof MeetingError &&
      (await getMeeting(meetingId))?.minutesDocumentId
    ) {
      return "signed";
    }
    throw error;
  }
  await close();
  return "recorded";
}

// ── Declarations ────────────────────────────────────────────────────────────

const DECLARATION_HELP = {
  owner: "a governance manager",
  remedy: "Declare again to get a new one.",
};

/** The reference a trustee's declaration for a year has on Leegality. */
export function declarationReference(
  fiscalYear: string,
  trusteeId: string
): string {
  return `DOI-${fiscalYear}-${trusteeId.replaceAll("-", "").slice(-8).toUpperCase()}`;
}

/**
 * Sends a declaration for its trustee's eSign, replacing `replaces` (the
 * declaration for the year still awaiting their signature); returns
 * Leegality's copy, stored.
 */
export async function sendDeclarationForEsign(input: {
  fiscalYear: string;
  rendered: Uint8Array;
  replaces: string | null;
  trusteeId: string;
}) {
  return await sendAndStore({
    irn: declarationReference(input.fiscalYear, input.trusteeId),
    name: `Declaration of interests ${input.fiscalYear}`,
    objectKey: (sha) =>
      declarationKey(
        input.trusteeId,
        `${input.fiscalYear}-${sha.slice(0, 12)}.pdf`
      ),
    rendered: input.rendered,
    replaces: input.replaces ? { declarationId: input.replaces } : null,
    signerIds: [input.trusteeId],
  });
}

export async function declarationSigningLink(
  declarationId: string,
  trusteeId: string
): Promise<string> {
  return await signingLinkIn(
    await getEsignDocumentFor({ declarationId }),
    trusteeId,
    DECLARATION_HELP
  );
}

/**
 * Takes the trustee's eSign on their declaration, when made: accepted as a
 * signed copy is, against the copy it was checked against, which puts it
 * in force as of the day they signed, audited in their name.
 */
export async function collectDeclarationEsign(
  declarationId: string
): Promise<EsignCollected> {
  const doc = await getEsignDocumentFor({ declarationId });
  const row = await getConflictDeclaration(declarationId);
  if (!(doc && row)) {
    return "waiting";
  }
  const close = () =>
    closeEsign(
      doc,
      `the declaration of interests ${row.fiscalYear} of ${row.legalName}`,
      (name) => declarationKey(row.trusteeId, name)
    );
  if (row.status !== "awaiting_signature") {
    await (row.signingMode === "esign" && row.documentId
      ? close()
      : dropEsignDocument(doc));
    return "signed";
  }
  if (row.signingMode !== "esign" || !row.objectKey) {
    await dropEsignDocument(doc);
    return "waiting";
  }
  if (doc.closedAt) {
    return "waiting";
  }
  const s3 = await getS3();
  const current = new Uint8Array(await s3.file(row.objectKey).arrayBuffer());
  const basedOnSha256 = sha256Of(current);
  if (basedOnSha256 !== row.sha256) {
    throw new CircularError(
      "The declaration's copy doesn't match its record. Declare again.",
      { fault: true }
    );
  }
  const taken = await takeNewEsigns(doc, current, []);
  const signature = taken?.added[0];
  if (!(taken && signature)) {
    return "waiting";
  }
  const actor = await signerActor(row.trusteeId);
  const accept = () =>
    acceptSignedDeclaration({
      declarationId,
      esign: {
        basedOnSha256,
        report: taken.report,
        signedAt: new Date(signature.signedAt),
      },
      uploaded: taken.file,
      userId: actor?.userId ?? null,
    });
  try {
    await (actor
      ? runAuditedAction(
          {
            action: "governance.sign_declaration",
            actor,
            metadata: { method: "esign" },
            target: { id: declarationId, type: "conflict_declaration" },
          },
          accept
        )
      : accept());
  } catch (error) {
    // Another check recorded it first.
    if (
      error instanceof DeclarationError &&
      (await getConflictDeclaration(declarationId))?.status !==
        "awaiting_signature"
    ) {
      return "signed";
    }
    throw error;
  }
  await close();
  return "recorded";
}

// ── Utilisation certificates ────────────────────────────────────────────────

const CERTIFICATE_HELP = {
  owner: "finance",
  remedy: "Ask finance to withdraw the certificate and prepare it again.",
};

/** The signer's link, only once Leegality has invited them (the head first). */
export async function certificateSigningLink(
  certificateId: string,
  trusteeId: string
): Promise<string> {
  return await signingLinkIn(
    await getEsignDocumentFor({ certificateId }),
    trusteeId,
    CERTIFICATE_HELP
  );
}

/**
 * Takes the eSigns made on a certificate since its latest copy, in order
 * (Leegality invites the Chief Finance Officer only after the Head of the
 * Organisation signs): each recorded on the copy as it left it, as of when
 * it was made, audited in its signer's name. Asks the next signer; once
 * both have signed, makes the long-term copy and closes the Leegality
 * document. A discarded or cancelled certificate's is withdrawn. Returns
 * how many were taken.
 */
export async function collectCertificateEsign(
  certificateId: string
): Promise<number> {
  const doc = await getEsignDocumentFor({ certificateId });
  const certificate = await getCertificate(certificateId);
  if (!(doc && certificate) || doc.closedAt) {
    return 0;
  }
  const close = () =>
    closeEsign(doc, `utilisation certificate ${certificate.number}`, (name) =>
      certificateKey(certificateId, name)
    );
  if (certificate.signingMode !== "esign") {
    await dropEsignDocument(doc);
    return 0;
  }
  if (!["awaiting_head", "awaiting_finance"].includes(certificate.status)) {
    await (["awaiting_ca", "final"].includes(certificate.status)
      ? close()
      : dropEsignDocument(doc));
    return 0;
  }
  const current = await readLatest(certificate);
  const signed =
    certificate.status === "awaiting_finance"
      ? [certificate.headTrusteeId]
      : [];
  const taken = await takeNewEsigns(doc, current, signed);
  if (!taken) {
    return 0;
  }
  let basedOnSha256 = certificate.latestSha256;
  let count = 0;
  const s3 = await getS3();
  for (const item of taken.added) {
    const bytes = taken.file.slice(0, item.end);
    const sha256 = sha256Of(bytes);
    // Stored by content, like an uploaded copy.
    const objectKey = certificateKey(
      certificateId,
      `signed-${sha256.slice(0, 16)}.pdf`
    );
    await s3.write(objectKey, bytes, { type: "application/pdf" });
    const report = await validateEsignPdf(bytes);
    const record = () =>
      recordCertificateSignature(
        {
          basedOnSha256,
          id: certificateId,
          objectKey,
          sha256,
          signed: { report, sizeBytes: bytes.byteLength },
          trusteeId: item.trusteeId,
        },
        undefined,
        new Date(item.signedAt)
      );
    const actor = await signerActor(item.trusteeId);
    let status: Awaited<ReturnType<typeof record>>;
    try {
      status = actor
        ? await runAuditedAction(
            {
              action: "utilisation_certificate.sign",
              actor,
              metadata: { method: "esign" },
              target: { id: certificateId, type: "utilisation_certificate" },
            },
            record
          )
        : await record();
    } catch (error) {
      // Another check recorded it first.
      const now = await getCertificate(certificateId);
      if (
        error instanceof CertificateError &&
        now?.latestSha256 !== basedOnSha256
      ) {
        break;
      }
      throw error;
    }
    basedOnSha256 = sha256;
    count += 1;
    if (status === "awaiting_finance") {
      enqueueCertificateNotice(certificateId);
    } else {
      await fileArchiveCopy({
        archiveKey: certificateKey(
          certificateId,
          `ltv-${sha256.slice(0, 16)}.pdf`
        ),
        bytes,
        esign: true,
        log: { certificateId },
        objectKey,
        target: { certificateId },
      });
      await close();
    }
  }
  return count;
}
