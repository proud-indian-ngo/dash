import type { Attachment, LineItem } from "./form-schemas";

interface RawLineItem {
  amount: number | string;
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
    id: li.id,
    categoryId: li.categoryId,
    description: li.description ?? "",
    amount: String(li.amount),
    generateVoucher: li.generateVoucher ?? false,
  }));
}

export function mapAttachmentsToFormValues(
  attachments: readonly RawAttachment[]
): Attachment[] {
  return attachments.map((att) =>
    att.type === "file"
      ? {
          id: att.id,
          type: "file" as const,
          filename: att.filename ?? "attachment",
          objectKey: att.objectKey ?? "",
          mimeType: att.mimeType ?? undefined,
        }
      : {
          id: att.id,
          type: "url" as const,
          url: att.url ?? "",
        }
  );
}

interface RawTransaction {
  amount: number | string;
  attachments?: readonly RawAttachment[];
  description?: null | string;
  paymentMethod?: null | string;
  paymentReference?: null | string;
  transactionDate?: null | number;
}

export function mapTransactionToFormValues(t: RawTransaction) {
  return {
    amount: String(t.amount),
    description: (t.description as string) ?? "",
    transactionDate: t.transactionDate
      ? new Date(t.transactionDate)
      : new Date(),
    paymentMethod: (t.paymentMethod as string) ?? "",
    paymentReference: (t.paymentReference as string) ?? "",
    attachments: mapAttachmentsToFormValues(t.attachments ?? []),
  };
}
