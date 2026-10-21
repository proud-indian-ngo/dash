import { createHash } from "node:crypto";

import {
  type ReceiptDocument,
  loadReceiptDocument,
  recordStoredReceiptPdf,
  type StoredReceiptPdf,
} from "@pi-dash/db/queries/contribution-receipts";
import { env } from "@pi-dash/env/server";
import {
  type DonationReceiptProps,
  generateDonationReceiptPdf,
} from "@pi-dash/pdf/generate-donation-receipt.tsx";
import { receiptFileName } from "@pi-dash/shared/receipts";
import { uuidv7 } from "uuidv7";

import {
  readPayeeSignatureImage,
  type SignatureFile,
} from "../handlers/payee-signature-image";
import { getR2Client } from "../handlers/r2";
import { receiptVerifyUrl } from "./receipt-verification";

/**
 * A receipt's PDF, for the download route and the email job alike. It is
 * rendered once from the frozen snapshot and stored, and the stored file is
 * served from then on, so an issued receipt never changes and its SHA-256
 * can check a donor's copy. A voided receipt is rendered afresh with the
 * VOID marker; the stored original stays as issued. Server only: the PDF
 * carries the donor's full ID number, so neither the props nor the buffer
 * are ever logged.
 */

export function receiptPdfProps(
  receiptId: string,
  document: ReceiptDocument,
  signatureImage: Buffer | null
): DonationReceiptProps {
  return {
    donor: {
      address: document.donor.address,
      idNumber: document.with80G ? document.donorIdNumber : null,
      idType: document.with80G ? document.donor.idType : null,
      name: document.donor.name,
    },
    gift: document.gift,
    issuedOn: document.issuedOn,
    number: document.number,
    org: document.org,
    registration: document.registration,
    signatory: document.signatory,
    signatureImage,
    verifyUrl: receiptVerifyUrl(receiptId),
    voided:
      document.voidedAt && document.voidReason
        ? { reason: document.voidReason }
        : null,
    with80G: document.with80G,
  };
}

export interface RenderedReceipt {
  document: ReceiptDocument;
  filename: string;
  pdf: Buffer;
}

interface StoredFile extends SignatureFile {
  write(data: Buffer, options: { type: string }): Promise<number>;
}

export interface ReceiptPdfDependencies {
  file: (key: string) => StoredFile;
  keyPrefix: string;
  loadDocument: typeof loadReceiptDocument;
  recordStored: typeof recordStoredReceiptPdf;
  render: typeof generateDonationReceiptPdf;
}

const defaults = (): ReceiptPdfDependencies => ({
  file: (key) => getR2Client().file(key),
  keyPrefix: env.R2_KEY_PREFIX,
  loadDocument: loadReceiptDocument,
  recordStored: recordStoredReceiptPdf,
  render: generateDonationReceiptPdf,
});

/** The signature is missing or no longer a printable PNG. */
export class ReceiptSignatureError extends Error {}

/**
 * Reads the signature receipts print. A missing or invalid image throws
 * `ReceiptSignatureError` rather than printing a receipt without it;
 * storage errors throw as they are, so a job retries.
 */
export async function readReceiptSignature(
  key: string,
  file: (key: string) => SignatureFile = (k) => getR2Client().file(k)
): Promise<Buffer> {
  const read = await readPayeeSignatureImage(file(key));
  if ("skipped" in read) {
    throw new ReceiptSignatureError(
      `Receipt signature unreadable: ${read.skipped}`
    );
  }
  return read.image;
}

function signatureImage(
  document: ReceiptDocument,
  deps: ReceiptPdfDependencies
): Promise<Buffer | null> {
  return document.signatureKey
    ? readReceiptSignature(document.signatureKey, deps.file)
    : Promise.resolve(null);
}

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * The stored file's bytes, checked against the recorded hash so corruption
 * or an overwrite never reaches a donor; null when the object is gone.
 */
async function readStored(
  stored: StoredReceiptPdf,
  deps: ReceiptPdfDependencies
): Promise<Buffer | null> {
  const file = deps.file(stored.key);
  if (!(await file.exists())) {
    return null;
  }
  const pdf = Buffer.from(await file.arrayBuffer());
  if (sha256(pdf) !== stored.sha256) {
    throw new Error("Stored receipt PDF doesn't match its hash");
  }
  return pdf;
}

/** Null when the receipt doesn't exist. */
export async function receiptPdf(
  receiptId: string,
  deps: ReceiptPdfDependencies = defaults()
): Promise<RenderedReceipt | null> {
  const document = await deps.loadDocument(receiptId);
  if (!document) {
    return null;
  }
  const filename = receiptFileName(document.number);
  const render = async () =>
    deps.render(
      receiptPdfProps(receiptId, document, await signatureImage(document, deps))
    );
  if (document.voidedAt) {
    return { document, filename, pdf: await render() };
  }
  if (document.stored) {
    const pdf = await readStored(document.stored, deps);
    if (pdf) {
      return { document, filename, pdf };
    }
    // The object went missing: put it back only if a fresh render is the
    // same file, since the hash on record is what donors check against.
    const rendered = await render();
    if (sha256(rendered) !== document.stored.sha256) {
      throw new Error("Stored receipt PDF is missing and can't be re-created");
    }
    await deps
      .file(document.stored.key)
      .write(rendered, { type: "application/pdf" });
    return { document, filename, pdf: rendered };
  }
  // Each render gets its own random key, so racing stores (perhaps on
  // different builds) never overwrite each other; the first record wins,
  // the rest serve its file, and the orphan cleanup collects theirs. Random,
  // not the hash: the verify page shows the hash, and the bucket must not
  // be the only thing keeping a donor's full ID private.
  const pdf = await render();
  const hash = sha256(pdf);
  const key = `${deps.keyPrefix}/receipts/${receiptId}/${uuidv7()}.pdf`;
  await deps.file(key).write(pdf, { type: "application/pdf" });
  const winner = await deps.recordStored(receiptId, { key, sha256: hash });
  if (winner.sha256 === hash) {
    return { document, filename, pdf };
  }
  const stored = await readStored(winner, deps);
  if (!stored) {
    throw new Error("Stored receipt PDF is missing");
  }
  return { document, filename, pdf: stored };
}
