import {
  PAYEE_SIGNATURE_MAX_BYTES,
  payeeSignatureImageProblem,
} from "@pi-dash/shared/payee-signature";

/** Why a linked signature isn't printed; the voucher keeps the empty box. */
export type PayeeSignatureSkip =
  | "payee_signature_invalid"
  | "payee_signature_missing"
  | "payee_signature_too_large";

/** The parts of a Bun `S3File` the read needs. */
export interface SignatureFile {
  arrayBuffer(): Promise<ArrayBuffer>;
  exists(): Promise<boolean>;
  stat(): Promise<{ size: number }>;
}

/**
 * Reads the payee's signature PNG for the voucher. Its size is checked
 * before it is downloaded and its header before anything decodes it, since
 * a small PNG can declare an image that takes gigabytes to inflate and jobs
 * run in the web process. A missing object or a refused file skips the
 * signature; other storage errors throw so the job retries.
 */
export async function readPayeeSignatureImage(
  file: SignatureFile
): Promise<{ image: Buffer } | { skipped: PayeeSignatureSkip }> {
  if (!(await file.exists())) {
    return { skipped: "payee_signature_missing" };
  }
  const { size } = await file.stat();
  if (size > PAYEE_SIGNATURE_MAX_BYTES) {
    return { skipped: "payee_signature_too_large" };
  }
  const image = Buffer.from(await file.arrayBuffer());
  const problem = payeeSignatureImageProblem(image, image.byteLength);
  if (problem === "too_large") {
    return { skipped: "payee_signature_too_large" };
  }
  if (problem) {
    return { skipped: "payee_signature_invalid" };
  }
  return { image };
}
