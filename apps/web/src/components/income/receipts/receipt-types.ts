import {
  RECEIPT_DELIVERY_FAILURE_LABELS,
  receiptAwaitsAutoSend,
  type ReceiptDeliveryFacts,
  receiptDeliveryNote,
  receiptDeliveryState,
} from "@pi-dash/shared/receipts";
import type {
  Contribution,
  ContributionReceipt,
  Party,
  User,
} from "@pi-dash/zero/schema";
import { format } from "date-fns";

import type { getReceiptContacts } from "@/functions/contribution-receipts";
import { DATE_TIME } from "@/lib/date-formats";

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

/** One line on where a receipt's delivery stands now. */
export function receiptDeliveryLabel(row: ReceiptDeliveryFacts): string {
  const state = receiptDeliveryState(row, Date.now());
  const at = (time: number) => format(new Date(time), DATE_TIME);
  switch (state.kind) {
    case "failed":
      return `Not sent: ${RECEIPT_DELIVERY_FAILURE_LABELS[state.failure]}`;
    case "sent":
      return state.channel === "email"
        ? `Emailed on ${at(state.at)}`
        : `Sent on WhatsApp on ${at(state.at)}`;
    case "scheduled":
      return `Sends automatically on ${at(state.at)}`;
    case "sending":
      return "Sending";
    default:
      return "Not sent";
  }
}

/** The latest failed send when the label shows something else, or null. */
export function receiptDeliveryNoteLabel(
  row: ReceiptDeliveryFacts
): string | null {
  const failure = receiptDeliveryNote(row, Date.now());
  return failure
    ? `Last send failed: ${RECEIPT_DELIVERY_FAILURE_LABELS[failure]}`
    : null;
}

export type ReceiptContacts = Awaited<
  ReturnType<typeof getReceiptContacts>
>[string];

/**
 * Which sends can work for a live receipt, each with why not. Unknown
 * contacts (still loading) leave every send enabled; the server refuses.
 */
export function receiptSendOptions(
  row: ReceiptDeliveryFacts,
  contacts: ReceiptContacts | undefined,
  now: number
) {
  const noEmail =
    contacts?.email === "none"
      ? "no email address"
      : contacts?.email === "suppressed"
        ? "email address bounced"
        : null;
  const noPhone = contacts && !contacts.phone ? "no phone number" : null;
  // The automatic rule never falls back to WhatsApp from a bounced address.
  let nowBlocked: string | null = null;
  if (contacts?.email === "suppressed") {
    nowBlocked = noEmail;
  } else if (noEmail && noPhone) {
    nowBlocked = "no email or phone";
  }
  return {
    email: noEmail,
    now: receiptAwaitsAutoSend(row, now) ? { blocked: nowBlocked } : null,
    whatsapp: noPhone,
  };
}
