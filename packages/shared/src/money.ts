import z from "zod";

/**
 * Money is stored as integer paise (bigint columns read as JavaScript
 * numbers) and converted to rupees only at presentation and export. Every
 * conversion checks that the value stays a safe integer, so a number that
 * has lost precision never reaches the database or a document.
 */

const RUPEES_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

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
  const [, sign, whole, fraction = ""] = match;
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

/** Paise amount for mutator and server-function inputs. */
export const paiseSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Paise amount that must be greater than zero (line items, transactions). */
export const positivePaiseSchema = paiseSchema.min(1, "Must be > 0");
