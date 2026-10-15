import { formatPaise } from "./money";

/**
 * Cash vouchers stand in for a bill on small reimbursement line items, such
 * as a daily-wage labourer paid in cash for a one-time job. Finance sets the
 * largest item a voucher may cover in Settings → Programmes; it lives in
 * `app_config` under this key as whole paise.
 */
export const CASH_VOUCHER_LIMIT_CONFIG_KEY = "cash_voucher_limit_paise";

/** Used until finance sets a limit: ₹1,000. */
export const DEFAULT_CASH_VOUCHER_LIMIT_PAISE = 1000_00;
/** Smallest limit finance may set: ₹1. */
export const MIN_CASH_VOUCHER_LIMIT_PAISE = 1_00;
/**
 * Hard cap: ₹10,000. Income-tax law applies section 40A(3) to trusts: cash
 * paid to one person in a day above this isn't counted as spending on the
 * trust's objects.
 */
export const MAX_CASH_VOUCHER_LIMIT_PAISE = 10_000_00;

export const CASH_VOUCHER_CAP_NOTE =
  "Cash payments over ₹10,000 to one person in a day don't count as spending on the trust's objects.";

const wholeRupees = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

/** "₹1,000" for whole rupees, "₹999.50" otherwise. */
export function formatCashVoucherLimit(limitPaise: number): string {
  return limitPaise % 100 === 0
    ? wholeRupees.format(limitPaise / 100)
    : formatPaise(limitPaise);
}

/** Whether a paise value is an allowed voucher limit (₹1 to ₹10,000). */
export function isValidCashVoucherLimitPaise(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= MIN_CASH_VOUCHER_LIMIT_PAISE &&
    value <= MAX_CASH_VOUCHER_LIMIT_PAISE
  );
}

/** Reason a stored value is refused; shown by the settings form and the mutator. */
export const CASH_VOUCHER_LIMIT_RANGE_MESSAGE = `The voucher limit must be between ${formatCashVoucherLimit(MIN_CASH_VOUCHER_LIMIT_PAISE)} and ${formatCashVoucherLimit(MAX_CASH_VOUCHER_LIMIT_PAISE)}`;

/** Whether a stored `app_config` value is a valid limit. */
export function isValidCashVoucherLimitValue(value: string): boolean {
  return /^\d{1,7}$/.test(value) && isValidCashVoucherLimitPaise(Number(value));
}

/**
 * The limit in force: the stored value, or the default when it is missing
 * or invalid. Every reader goes through this, so a bad row can never lift
 * the limit above the cap.
 */
export function parseCashVoucherLimit(
  value: string | null | undefined
): number {
  return value && isValidCashVoucherLimitValue(value)
    ? Number(value)
    : DEFAULT_CASH_VOUCHER_LIMIT_PAISE;
}

/** Whether a line item is small enough for a cash voucher under `limitPaise`. */
export function qualifiesForCashVoucher(
  amountPaise: number,
  limitPaise: number
): boolean {
  return amountPaise > 0 && amountPaise <= limitPaise;
}

export function cashVoucherLimitError(limitPaise: number): string {
  return `Vouchers can only be generated for items ≤ ${formatCashVoucherLimit(limitPaise)}`;
}

/**
 * Indian mobile numbers in the E.164 form the phone input produces:
 * +91 followed by ten digits starting 6–9.
 */
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

export const PAYEE_PHONE_MESSAGE = "Enter an Indian mobile number";

export function isIndianMobile(value: string): boolean {
  return INDIAN_MOBILE.test(value);
}
