import type { VendorPaymentNoInvoiceReason } from "./constants";

export const NO_INVOICE_NOTE_MAX_LENGTH = 500;

export const NO_INVOICE_REASON_LABELS: Record<
  VendorPaymentNoInvoiceReason,
  string
> = {
  other: "Other",
  rent: "Rent / lease",
  statutory: "Tax / statutory payment",
};

/** "No invoice — Rent / lease", shown where the invoice number would be. */
export const formatNoInvoice = (reason: VendorPaymentNoInvoiceReason): string =>
  `No invoice — ${NO_INVOICE_REASON_LABELS[reason]}`;

/**
 * Proof (a rent receipt or agreement, a challan or receipt) is optional for
 * every reason; the approver sees "No proof attached" when there is none.
 * "other" needs a written note explaining why there is no invoice.
 */
export function noInvoiceDetailsError(details: {
  note: string | null | undefined;
  reason: VendorPaymentNoInvoiceReason;
}): string | null {
  if (details.reason === "other" && !details.note?.trim()) {
    return "Add a note explaining why there is no invoice";
  }
  return null;
}
