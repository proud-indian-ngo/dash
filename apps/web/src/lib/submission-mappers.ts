import { paiseToRupees } from "@pi-dash/shared/money";

import type { Attachment, LineItem } from "./form-schemas";

/** Paise to the rupee text an edit form starts with: 1500, 19.99, 19.9. */
function paiseToFormAmount(paise: number): string {
  return String(Number(paiseToRupees(paise)));
}

interface RawLineItem {
  amountPaise: number;
  categoryId: string;
  description: null | string;
  generateVoucher?: boolean | null;
  id: string;
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
