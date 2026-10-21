import { loadReceiptVerificationFacts } from "@pi-dash/db/queries/contribution-receipts";
import { isReceiptVerifySignature } from "@pi-dash/jobs/lib/receipt-verification";
import { formatPaise } from "@pi-dash/shared/money";
import { toIndiaDate } from "@pi-dash/shared/public-events";
import {
  formatReceiptDate,
  maskDonorName,
  RECEIPT_MODE_LABELS,
} from "@pi-dash/shared/receipts";
import * as z from "zod";

import { checkRateLimit } from "@/lib/rate-limit";

export type ReceiptVerification =
  | { status: "invalid" }
  | { status: "limited" }
  | {
      amount: string;
      donor: string;
      issuedOn: string;
      mode: string;
      number: string;
      orgPan: string;
      /** SHA-256 of the PDF as issued, to check a copy; null until stored. */
      pdfSha256: string | null;
      status: "valid" | "void";
      urn: string;
      /** India date the receipt was voided; null while it is valid. */
      voidedOn: string | null;
      with80G: boolean;
    };

export interface ReceiptVerificationDependencies {
  checkRateLimit: typeof checkRateLimit;
  loadFacts: typeof loadReceiptVerificationFacts;
}

const defaults: ReceiptVerificationDependencies = {
  checkRateLimit,
  loadFacts: loadReceiptVerificationFacts,
};

/**
 * What a receipt's QR code link confirms. A wrong signature reads the same
 * as a receipt that doesn't exist, and the donor's name is masked, so a
 * leaked link shows little.
 */
export async function verifyReceiptLink(
  input: { ip: string; receiptId: string; sig: string },
  deps: ReceiptVerificationDependencies = defaults
): Promise<ReceiptVerification> {
  if (!deps.checkRateLimit(`receipt-verify:${input.ip}`, 30).allowed) {
    return { status: "limited" };
  }
  const receiptId = z.uuid().safeParse(input.receiptId);
  if (
    !(receiptId.success && isReceiptVerifySignature(receiptId.data, input.sig))
  ) {
    return { status: "invalid" };
  }
  const facts = await deps.loadFacts(receiptId.data);
  if (!facts) {
    return { status: "invalid" };
  }
  return {
    amount: formatPaise(facts.amountPaise),
    donor: maskDonorName(facts.donorName),
    issuedOn: formatReceiptDate(facts.issuedOn),
    mode: RECEIPT_MODE_LABELS[facts.channel],
    number: facts.number,
    orgPan: facts.orgPan,
    pdfSha256: facts.pdfSha256,
    status: facts.voidedAt ? "void" : "valid",
    urn: facts.urn,
    voidedOn: facts.voidedAt
      ? formatReceiptDate(toIndiaDate(facts.voidedAt.getTime()))
      : null,
    with80G: facts.with80G,
  };
}
