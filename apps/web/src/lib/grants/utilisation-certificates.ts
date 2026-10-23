import { db } from "@pi-dash/db";
import {
  createSigningJob,
  currentCertificate,
} from "@pi-dash/db/queries/signing";
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
  signatureFieldBox,
  signatureFieldName,
  signatureSlots,
} from "@pi-dash/shared/resolutions";
import { uuidv7 } from "uuidv7";

import {
  checkOneSignerAdded,
  fileArchiveCopy,
} from "../governance/accept-signature";
import { CircularError, sha256Of } from "../governance/circulars";
import {
  prepareSignatureFields,
  startRemoteSignature,
} from "../governance/signing-service";
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
 * Renders the frozen snapshot, adds the two trustees' empty signature
 * fields on the last page (where the PDF draws their boxes) and stores it.
 */
export const storeCertificatePdf: StoreCertificatePdf = async (
  snapshot,
  certificateId
) => {
  const rendered = await generateUtilisationCertificatePdf(snapshot);
  const slots = signatureSlots([
    snapshot.signatories.head.trusteeId,
    snapshot.signatories.finance.trusteeId,
  ]);
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
async function readLatest(certificate: {
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
 * Reserves the trustee's field in the certificate's latest copy for the
 * helper. Only the signer whose turn it is, with an enrolled certificate.
 */
export async function startCertificateJob(input: {
  certificateId: string;
  trusteeId: string;
  userId: string;
}): Promise<{ id: string; token: string }> {
  const certificate = await getCertificate(input.certificateId);
  if (!certificate) {
    throw new CertificateError("Certificate not found");
  }
  const role = signerRole(certificate, input.trusteeId);
  await assertSignerInOffice(db, certificate, role, todayInKolkata());
  await assertNoDrift(db, certificate);
  const enrolled = await currentCertificate(input.trusteeId);
  if (!enrolled) {
    throw new CircularError(
      "Set up your DSC first: no valid certificate is enrolled for you."
    );
  }
  const fieldName = signatureFieldName(input.trusteeId);
  const started = await startRemoteSignature({
    certificate: enrolled.der,
    chain: enrolled.chain,
    fieldName,
    pdf: await readLatest(certificate),
  });
  const s3 = await getS3();
  const stateObjectKey = certificateKey(
    certificate.id,
    `sign-state-${uuidv7()}.json`
  );
  await s3.write(stateObjectKey, started.state, { type: "application/json" });
  return await createSigningJob({
    basedOnSha256: certificate.latestSha256,
    certificateId: enrolled.id,
    fieldName,
    kind: "sign",
    stateObjectKey,
    toSign: started.toSign,
    trusteeId: input.trusteeId,
    userId: input.userId,
    utilisationCertificateId: certificate.id,
  });
}
