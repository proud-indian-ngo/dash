/** Rupee display and input helpers for amounts stored as integer paise. */

/** ₹12,000 for whole rupees, ₹12,000.50 otherwise. */
export function formatPaise(paise: number): string {
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: whole ? 0 : 2,
    minimumFractionDigits: whole ? 0 : 2,
    style: "currency",
  }).format(paise / 100);
}

/** "" stays empty (meaning unset); otherwise a rupee string with up to two decimals becomes paise. */
export function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return Math.round(Number(trimmed) * 100);
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
