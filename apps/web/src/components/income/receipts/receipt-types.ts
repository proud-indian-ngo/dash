import type {
  Contribution,
  ContributionReceipt,
  Party,
  User,
} from "@pi-dash/zero/schema";

/** A receipt as the Receipts tab query returns it. */
export type ReceiptRow = ContributionReceipt & {
  contribution?: (Contribution & { party?: Party | null }) | null;
  issuedByUser?: User | null;
  voidedByUser?: User | null;
};

export type ReceiptStatus = "issued" | "voided";

export function receiptStatus(row: {
  voidedAt?: number | null;
}): ReceiptStatus {
  return row.voidedAt ? "voided" : "issued";
}

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  issued: "Issued",
  voided: "Voided",
};

export function receiptDonorName(row: ReceiptRow): string {
  return row.contribution?.party?.displayName ?? "Unknown donor";
}

/** Where a receipt's PDF downloads from; the route checks donors.receipt. */
export function receiptPdfUrl(
  receiptId: string,
  disposition?: "inline"
): string {
  return disposition
    ? `/api/receipts/${receiptId}?disposition=${disposition}`
    : `/api/receipts/${receiptId}`;
}

/** The live receipt of a gift, if any: the newest one not voided. */
export function liveReceipt<T extends { voidedAt?: number | null }>(
  receipts: readonly T[] | null | undefined
): T | null {
  return receipts?.find((receipt) => !receipt.voidedAt) ?? null;
}
