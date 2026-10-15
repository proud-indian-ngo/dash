import {
  type ReceiptDocument,
  loadReceiptDocument,
} from "@pi-dash/db/queries/contribution-receipts";
import {
  type DonationReceiptProps,
  generateDonationReceiptPdf,
} from "@pi-dash/pdf/generate-donation-receipt.tsx";
import { receiptFileName } from "@pi-dash/shared/receipts";

/**
 * Renders a receipt's PDF from its frozen snapshot, for the download route
 * and the email job alike. Server only: the result carries the donor's full
 * ID number, so neither the props nor the buffer are ever logged.
 */

export function receiptPdfProps(
  document: ReceiptDocument
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

/** Null when the receipt doesn't exist. */
export async function renderReceiptPdf(
  receiptId: string
): Promise<RenderedReceipt | null> {
  const document = await loadReceiptDocument(receiptId);
  if (!document) {
    return null;
  }
  const pdf = await generateDonationReceiptPdf(receiptPdfProps(document));
  return { document, filename: receiptFileName(document.number), pdf };
}
