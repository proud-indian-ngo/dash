import { db } from "@pi-dash/db";
import {
  assertNoDrift,
  assertSignerInOffice,
  CertificateError,
  getCertificate,
  recordCertificateSignature,
  signerRole,
  type StoreCertificatePdf,
} from "@pi-dash/db/queries/utilisation-certificates";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { generateUtilisationCertificatePdf } from "@pi-dash/pdf/utilisation-certificate.tsx";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  ESIGN_MAX_RESPONSE_DAYS,
  signatureFieldBox,
  signatureFieldName,
  signatureSlots,
} from "@pi-dash/shared/resolutions";

import {
  checkOneSignerAdded,
  fileArchiveCopy,
} from "../governance/accept-signature";
import { sha256Of } from "../governance/circulars";
import {
  assertSignersHaveAccounts,
  discardEsignDocument,
  sendForEsign,
} from "../governance/esign";
import { startSignJob } from "../governance/signing-jobs";
import { prepareSignatureFields } from "../governance/signing-service";
import { getS3 } from "../s3";

/**
 * Utilisation certificates on the server: the PDF and its signature
 * fields, a trustee's signed copy (from the DSC helper or Acrobat) through
 * the governance signing checks, and the helper's job. The rules and the
 * database work are in packages/db/src/queries/utilisation-certificates.ts.
 */

export const certificateKey = (certificateId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/utilisation-certificates/${certificateId}/${name}`;

/**
 * Renders the frozen snapshot and stores it: with the two trustees' empty
 * signature fields on the last page (where the PDF draws their boxes), or
 * for Aadhaar eSign as Leegality's copy, sent for the Head of the
 * Organisation and then the Chief Finance Officer to sign in those boxes.
 * Runs inside the preparing transaction: a failure after sending deletes
 * the Leegality document, and so does the caller if the transaction fails.
 */
export const storeCertificatePdf: StoreCertificatePdf = async (
  snapshot,
  certificateId,
  signingMode
) => {
  const rendered = await generateUtilisationCertificatePdf(
    snapshot,
    signingMode
  );
  const signerIds = [
    snapshot.signatories.head.trusteeId,
    snapshot.signatories.finance.trusteeId,
  ];
  if (signingMode === "esign") {
    await assertSignersHaveAccounts(signerIds);
    const sent = await sendForEsign({
      expiryDays: ESIGN_MAX_RESPONSE_DAYS,
      irn: snapshot.number,
      name: `Utilisation certificate ${snapshot.number}`,
      rendered: new Uint8Array(rendered),
      sequential: true,
      signerIds,
    });
    try {
      const sha256 = sha256Of(sent.base);
      const objectKey = certificateKey(
        certificateId,
        `prepared-${sha256.slice(0, 16)}.pdf`
      );
      const s3 = await getS3();
      await s3.write(objectKey, sent.base, { type: "application/pdf" });
      return {
        esign: { documentId: sent.documentId, invitees: sent.invitees },
        objectKey,
        sha256,
      };
    } catch (error) {
      await discardEsignDocument(sent.documentId);
      throw error;
    }
  }
  const slots = signatureSlots(signerIds);
  const pdf = await prepareSignatureFields(
    new Uint8Array(rendered),
    slots.map((slot) => ({
      box: signatureFieldBox(slot),
      name: slot.fieldName,
      page: -1,
    }))
  );
  const sha256 = sha256Of(pdf);
  const objectKey = certificateKey(
    certificateId,
    `prepared-${sha256.slice(0, 16)}.pdf`
  );
  const s3 = await getS3();
  await s3.write(objectKey, pdf, { type: "application/pdf" });
  return { objectKey, sha256 };
};

/** The certificate's latest copy, checked against its record. */
export async function readLatest(certificate: {
  latestObjectKey: string;
  latestSha256: string;
}): Promise<Uint8Array> {
  const s3 = await getS3();
  const bytes = new Uint8Array(
    await s3.file(certificate.latestObjectKey).arrayBuffer()
  );
  if (sha256Of(bytes) !== certificate.latestSha256) {
    throw new CertificateError(
      "The certificate's latest copy doesn't match its record, so it can't be signed. Ask finance to look into it."
    );
  }
  return bytes;
}

/** Asks the trustee whose turn it now is to sign. Fire and forget. */
export function enqueueCertificateNotice(certificateId: string): void {
  withFireAndForgetLog(
    { certificateId, handler: "utilisation-certificate:to-sign" },
    async () => {
      await enqueue("notify-utilisation-certificate", { certificateId });
    }
  );
}

/**
 * Takes a certificate a trustee signed: the latest copy with exactly their
 * signature added in their own box, by them by name and, for the helper,
 * from their enrolled certificate, and only when it's their turn. Records
 * it as the latest copy and asks the next signer.
 */
export async function acceptSignedCertificate(input: {
  certificateId: string;
  /** For the helper: the enrolled certificate the signature must come from. */
  expectedCertificateSha256?: string;
  trusteeId: string;
  uploaded: Uint8Array;
}): Promise<string> {
  const certificate = await getCertificate(input.certificateId);
  if (!certificate) {
    throw new CertificateError("Certificate not found");
  }
  signerRole(certificate, input.trusteeId);
  const report = await checkOneSignerAdded({
    current: await readLatest(certificate),
    expectedCertificateSha256: input.expectedCertificateSha256,
    trusteeId: input.trusteeId,
    uploaded: input.uploaded,
  });
  const sha256 = sha256Of(input.uploaded);
  // Stored by content, so a copy refused below never replaces an accepted one.
  const objectKey = certificateKey(
    certificate.id,
    `signed-${sha256.slice(0, 16)}.pdf`
  );
  const s3 = await getS3();
  await s3.write(objectKey, input.uploaded, { type: "application/pdf" });
  const status = await recordCertificateSignature({
    basedOnSha256: certificate.latestSha256,
    id: certificate.id,
    objectKey,
    sha256,
    signed: { report, sizeBytes: input.uploaded.byteLength },
    trusteeId: input.trusteeId,
  });
  if (status === "awaiting_finance") {
    enqueueCertificateNotice(certificate.id);
  } else {
    // Both trustees have signed: the long-term copy, made as a passed
    // circular's is. A failure leaves it due for the monthly job.
    await fileArchiveCopy({
      archiveKey: certificateKey(
        certificate.id,
        `ltv-${sha256.slice(0, 16)}.pdf`
      ),
      bytes: input.uploaded,
      log: { certificateId: certificate.id },
      objectKey,
      target: { certificateId: certificate.id },
    });
  }
  return status;
}

/**
 * A helper job on the trustee's field in the certificate's latest copy.
 * Only the signer whose turn it is, with an enrolled certificate.
 */
export async function startCertificateJob(input: {
  certificateId: string;
  trustee: { id: string; legalName: string };
  userId: string;
}): Promise<{ id: string; link: string }> {
  const certificate = await getCertificate(input.certificateId);
  if (!certificate) {
    throw new CertificateError("Certificate not found");
  }
  const role = signerRole(certificate, input.trustee.id);
  await assertSignerInOffice(db, certificate, role, todayInKolkata());
  await assertNoDrift(db, certificate);
  return await startSignJob({
    fieldName: signatureFieldName(input.trustee.id),
    pdf: await readLatest(certificate),
    target: { id: certificate.id, type: "utilisation_certificate" },
    title: `Utilisation certificate ${certificate.number}: ${certificate.snapshot.grant.title}`,
    trustee: input.trustee,
    userId: input.userId,
  });
}
