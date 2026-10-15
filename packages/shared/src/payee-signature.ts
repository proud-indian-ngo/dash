import { formatCashVoucherLimit } from "./cash-voucher";
import { todayInKolkata } from "./income";
import { formatReceiptDate } from "./receipts";

/**
 * The payee of a cash voucher signs on the volunteer's phone. The statement
 * shown above the pad is stored word for word with the signature, so the
 * record says exactly what the payee acknowledged.
 */
export interface PayeeSignatureFacts {
  amountPaise: number;
  /** The expense category, used when the item has no description. */
  categoryName: string | null | undefined;
  description: string | null | undefined;
  /** The request's expense date: epoch milliseconds or `YYYY-MM-DD`. */
  expenseDate: number | string;
  payeeName: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_STOPS = /[\s.]+$/;
const SPACES = /\s+/g;

/** The calendar day of the expense in India, `YYYY-MM-DD`. */
export function signatureExpenseDay(expenseDate: number | string): string {
  if (typeof expenseDate === "string") {
    return ISO_DAY.test(expenseDate) ? expenseDate : "";
  }
  return Number.isFinite(expenseDate)
    ? todayInKolkata(new Date(expenseDate))
    : "";
}

/** What the money was for: the description, else the category. */
function purposeOf(facts: PayeeSignatureFacts): string {
  const text =
    facts.description?.trim() || facts.categoryName?.trim() || "this expense";
  return text.replace(SPACES, " ").replace(TRAILING_STOPS, "");
}

/**
 * "I, Ramesh Kumar, received ₹500 from Proud Indian for Cleaning the hall
 * on 12 Oct 2026." The client shows it and the server rebuilds it from the
 * stored item, so a signature never records facts the item no longer holds.
 */
export function payeeSignatureStatement(facts: PayeeSignatureFacts): string {
  const day = signatureExpenseDay(facts.expenseDate);
  const date = day ? formatReceiptDate(day) : "the day of payment";
  return `I, ${facts.payeeName.trim()}, received ${formatCashVoucherLimit(facts.amountPaise)} from Proud Indian for ${purposeOf(facts)} on ${date}.`;
}

/** The consent line under the confirm button. */
export const PAYEE_SIGNATURE_CONSENT =
  "By signing, the payee confirms they received this amount.";

/** The signature file is a PNG the dashboard draws; nothing else is taken. */
export const PAYEE_SIGNATURE_MIME_TYPE = "image/png";

/** A drawn signature is small; anything bigger isn't one. */
export const PAYEE_SIGNATURE_MAX_BYTES = 512 * 1024;
