import { createHash } from "node:crypto";

import {
  type ReceiptDocument,
  loadReceiptDocument,
  recordStoredReceiptPdf,
} from "@pi-dash/db/queries/contribution-receipts";
import { env } from "@pi-dash/env/server";
import {
  type DonationReceiptProps,
  generateDonationReceiptPdf,
} from "@pi-dash/pdf/generate-donation-receipt.tsx";
import { receiptFileName } from "@pi-dash/shared/receipts";

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

/**
 * The signature frozen with the receipt. A key that no longer reads as a
 * valid PNG throws rather than printing a receipt without it.
 */
async function signatureImage(
  document: ReceiptDocument,
  deps: ReceiptPdfDependencies
): Promise<Buffer | null> {
  if (!document.signatureKey) {
    return null;
  }
  const read = await readPayeeSignatureImage(deps.file(document.signatureKey));
  if ("skipped" in read) {
    throw new Error(`Receipt signature unreadable: ${read.skipped}`);
  }
  return read.image;
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
  if (document.stored && !document.voidedAt) {
    const pdf = Buffer.from(await deps.file(document.stored.key).arrayBuffer());
    return { document, filename, pdf };
  }
  const pdf = await deps.render(
    receiptPdfProps(receiptId, document, await signatureImage(document, deps))
  );
  if (!(document.stored || document.voidedAt)) {
    // Rendering is deterministic, so a download racing the issue job writes
    // the same bytes to the same key; the first record wins.
    const key = `${deps.keyPrefix}/receipts/${receiptId}.pdf`;
    await deps.file(key).write(pdf, { type: "application/pdf" });
    await deps.recordStored(receiptId, {
      key,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    });
  }
  return { document, filename, pdf };
}
