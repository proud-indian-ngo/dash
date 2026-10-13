import z from "zod";

import { VOUCHER_AMOUNT_THRESHOLD_PAISE } from "./constants";

/**
 * Money is stored as integer paise (bigint columns read as JavaScript
 * numbers) and converted to rupees only at presentation and export. Every
 * conversion checks that the value stays a safe integer, so a number that
 * has lost precision never reaches the database or a document.
 */

// "5", "5.", ".5" and "5.25"; whether any digit is present is checked after matching.
const RUPEES_PATTERN = /^(-)?(\d*)(?:\.(\d{0,2}))?$/;

/**
 * Largest amount a single line item or transaction may hold: the old
 * numeric(12,2) limit, ₹9,99,99,99,999.99. Totals of many capped items stay
 * far below the safe-integer range, so summing and formatting them is exact.
 */
export const MAX_AMOUNT_PAISE = 999_999_999_999;

export const RUPEES_INPUT_MESSAGE =
  "Enter an amount in rupees with up to 2 decimals";
export const MAX_AMOUNT_MESSAGE = "Amount can be at most ₹9,99,99,99,999.99";

const rupeeFormat = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  style: "currency",
});

export function isSafePaise(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export function assertSafePaise(value: number): number {
  if (!isSafePaise(value)) {
    throw new RangeError(`Not a safe paise amount: ${value}`);
  }
  return value;
}

/**
 * Parses a decimal rupee amount ("19.99", 250) into paise with string
 * arithmetic, so 19.99 is 1999 and never 1998.9999. Throws on anything that
 * is not a plain decimal with at most two places, or that falls outside the
 * safe-integer range.
 */
export function rupeesToPaise(input: string | number): number {
  const text = typeof input === "number" ? String(input) : input.trim();
  const match = RUPEES_PATTERN.exec(text);
  if (!match) {
    throw new RangeError(
      `Not a rupee amount with at most 2 decimals: ${input}`
    );
  }
  const [, sign, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") {
    throw new RangeError(
      `Not a rupee amount with at most 2 decimals: ${input}`
    );
  }
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!isSafePaise(paise)) {
    throw new RangeError(`Rupee amount out of range: ${input}`);
  }
  return sign && paise !== 0 ? -paise : paise;
}

/** Like rupeesToPaise, but returns null instead of throwing (form validation). */
export function tryRupeesToPaise(input: string | number): number | null {
  try {
    return rupeesToPaise(input);
  } catch {
    return null;
  }
}

/** Paise to a fixed two-decimal rupee string ("1999.00"), for inputs and exports. */
export function paiseToRupees(paise: number): string {
  assertSafePaise(paise);
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${paise < 0 ? "-" : ""}${rupees}.${fraction}`;
}

/** Display form used across the app: "₹1,23,456.78". */
export function formatPaise(paise: number): string {
  // Intl.NumberFormat formats a decimal string exactly (ES2023), avoiding
  // float division for large values; older engines coerce it to a number,
  // which is still exact for any realistic amount. The cast is only for lib
  // targets that predate the string overload.
  return rupeeFormat.format(paiseToRupees(paise) as unknown as number);
}

/** Sums paise amounts; a total that leaves the safe-integer range throws. */
export function sumPaise(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += assertSafePaise(value);
  }
  return assertSafePaise(total);
}

/** Whether a line item is small enough for a cash voucher (up to ₹1,000). */
export function qualifiesForCashVoucher(amountPaise: number): boolean {
  return amountPaise > 0 && amountPaise <= VOUCHER_AMOUNT_THRESHOLD_PAISE;
}

/** Paise amount for mutator and server-function inputs. */
export const paiseSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_AMOUNT_PAISE, MAX_AMOUNT_MESSAGE);

/** Paise amount that must be greater than zero (line items, transactions). */
export const positivePaiseSchema = paiseSchema.min(1, "Must be > 0");
