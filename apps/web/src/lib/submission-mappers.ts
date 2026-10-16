import { paiseToRupees } from "@pi-dash/shared/money";

import type { Attachment, LineItem } from "./form-schemas";

const TRAILING_FRACTION_ZEROS = /\.?0+$/;

/** Paise to the rupee text an edit form starts with: 1500, 19.99, 19.9. */
export function paiseToFormAmount(paise: number): string {
  // paiseToRupees always has two decimals, so trimming zeros only touches the fraction.
  return paiseToRupees(paise).replace(TRAILING_FRACTION_ZEROS, "");
}

interface RawLineItem {
  amountPaise: number;
  categoryId: string;
  description: null | string;
  generateVoucher?: boolean | null;
  id: string;
  payeeName?: null | string;
  payeePhone?: null | string;
}

interface RawAttachment {
  filename?: null | string;
  id: string;
  mimeType?: null | string;
  objectKey?: null | string;
  type: "file" | "url";
  url?: null | string;
}

export function mapLineItemsToFormValues(
  lineItems: readonly RawLineItem[]
): LineItem[] {
  return lineItems.map((li) => ({
    amount: paiseToFormAmount(li.amountPaise),
    categoryId: li.categoryId,
    description: li.description ?? "",
    generateVoucher: li.generateVoucher ?? false,
    id: li.id,
    // A voucher item with no payee prints the claimant, so the box shows
    // ticked; that also covers items from before the payee fields.
    payeeIsClaimant: Boolean(li.generateVoucher) && !li.payeeName,
    payeeName: li.payeeName ?? "",
    payeePhone: li.payeePhone ?? "",
  }));
}

export function mapAttachmentsToFormValues(
  attachments: readonly RawAttachment[]
): Attachment[] {
  return attachments.map((att) =>
    att.type === "file"
      ? {
          filename: att.filename ?? "attachment",
          id: att.id,
          mimeType: att.mimeType ?? undefined,
          objectKey: att.objectKey ?? "",
          type: "file" as const,
        }
      : {
          id: att.id,
          type: "url" as const,
          url: att.url ?? "",
        }
  );
}

/**
 * A vendor payment's own attachments, for its edit form. Invoice files are
 * submitted and replaced through the invoice section; the update mutator
 * only keeps quotation files, so sending invoice files back fails.
 */
export function mapQuotationAttachmentsToFormValues(
  attachments: readonly (RawAttachment & { purpose?: null | string })[]
): Attachment[] {
  return mapAttachmentsToFormValues(
    attachments.filter((att) => att.purpose !== "invoice")
  );
}

interface RawTransaction {
  amountPaise: number;
  attachments?: readonly RawAttachment[];
  description?: null | string;
  paymentMethod?: null | string;
  paymentReference?: null | string;
  transactionDate?: null | number;
}

export function mapTransactionToFormValues(t: RawTransaction) {
  return {
    amount: paiseToFormAmount(t.amountPaise),
    attachments: mapAttachmentsToFormValues(t.attachments ?? []),
    description: t.description ?? "",
    paymentMethod: t.paymentMethod ?? "",
    paymentReference: t.paymentReference ?? "",
    transactionDate: t.transactionDate
      ? new Date(t.transactionDate)
      : new Date(),
  };
}
