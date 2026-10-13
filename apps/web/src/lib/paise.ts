/** Rupee input helpers for optional paise settings (thresholds, budgets). */
import {
  assertSafePaise,
  formatPaise,
  rupeesToPaise,
} from "@pi-dash/shared/money";

const wholeRupeeFormat = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
  style: "currency",
});

/** ₹12,000 for whole rupees, ₹12,000.50 otherwise. */
export function formatPaiseCompact(paise: number): string {
  assertSafePaise(paise);
  return paise % 100 === 0
    ? wholeRupeeFormat.format(paise / 100)
    : formatPaise(paise);
}

/** "" stays empty (meaning unset); otherwise a rupee string with up to two decimals becomes paise. */
export function optionalRupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return rupeesToPaise(trimmed);
}

/** Paise to the rupee string an input should show; whole rupees drop the decimals. */
export function paiseToRupeesInput(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

/** ₹1,000 crore keeps paise within JavaScript's safe-integer range. */
export const MAX_RUPEES_INPUT = 10_000_000_000;

export function isValidRupeesInput(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "" ||
    (/^\d{1,11}(\.\d{1,2})?$/.test(trimmed) &&
      Number(trimmed) <= MAX_RUPEES_INPUT)
  );
}
