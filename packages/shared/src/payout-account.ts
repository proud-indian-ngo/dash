import z from "zod";

/**
 * Where a person is paid. A saved account holds bank details (number and
 * IFSC), a UPI ID or the mobile number linked to UPI, or both. Requests copy
 * whatever is there and finance pays by either.
 */

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** `handle@provider`, as NPCI allows: letters, digits, dots, dashes, underscores. */
export const UPI_ID_PATTERN = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,64}$/;

/**
 * A mobile number linked to UPI: ten digits starting 6 to 9. Custom 8 or 9
 * digit UPI numbers are left out on purpose: they look like bank account
 * numbers, and anyone with one also has a UPI ID to give instead.
 */
export const UPI_MOBILE_PATTERN = /^[6-9]\d{9}$/;

const MOBILE_SEPARATORS = /[\s()-]/g;
const COUNTRY_CODE = /^(?:\+?91|0)(?=\d{10}$)/;

/**
 * The stored form of a UPI ID or mobile number: IDs lower-cased, numbers as
 * ten digits without spaces, dashes or the +91 / 0 prefix.
 */
export function normalizeUpiHandle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }
  return trimmed.replace(MOBILE_SEPARATORS, "").replace(COUNTRY_CODE, "");
}

export function isValidUpiHandle(value: string): boolean {
  const handle = normalizeUpiHandle(value);
  return UPI_ID_PATTERN.test(handle) || UPI_MOBILE_PATTERN.test(handle);
}

export const UPI_HANDLE_MESSAGE =
  "Enter a UPI ID (e.g. name@okhdfc) or a 10-digit mobile number";
export const IFSC_MESSAGE =
  "IFSC must be 11 characters: 4 letters, a zero, then 6 alphanumeric (e.g. ABCD0123456)";
export const PAYOUT_REQUIRED_MESSAGE =
  "Add bank details, a UPI ID or number, or both";

const optionalText = z.string().optional();

/** The fields of a saved account as the person enters it. */
export const payoutAccountFields = {
  accountName: z.string(),
  accountNumber: optionalText,
  ifscCode: optionalText,
  upiId: optionalText,
};

/**
 * Empty strings count as absent: bank details are all-or-nothing, and at
 * least bank details or UPI is given.
 */
export function refinePayoutAccount(
  value: {
    accountName: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
  },
  context: z.RefinementCtx
): void {
  const number = value.accountNumber?.trim() ?? "";
  const ifsc = value.ifscCode?.trim() ?? "";
  const upi = value.upiId?.trim() ?? "";
  if (!value.accountName.trim()) {
    context.addIssue({
      code: "custom",
      message: "Name is required",
      path: ["accountName"],
    });
  }
  if (number || ifsc) {
    if (!number) {
      context.addIssue({
        code: "custom",
        message: "Account number is required with an IFSC",
        path: ["accountNumber"],
      });
    }
    if (!IFSC_PATTERN.test(ifsc.toUpperCase())) {
      context.addIssue({
        code: "custom",
        message: IFSC_MESSAGE,
        path: ["ifscCode"],
      });
    }
  }
  if (upi && !isValidUpiHandle(upi)) {
    context.addIssue({
      code: "custom",
      message: UPI_HANDLE_MESSAGE,
      path: ["upiId"],
    });
  }
  if (!(number || ifsc || upi)) {
    context.addIssue({
      code: "custom",
      message: PAYOUT_REQUIRED_MESSAGE,
      path: ["accountNumber"],
    });
  }
}

export const payoutAccountInputSchema = z
  .object(payoutAccountFields)
  .superRefine(refinePayoutAccount);

export type PayoutAccountInput = z.infer<typeof payoutAccountInputSchema>;

export interface PayoutAccountValues {
  accountName: string;
  accountNumber: string | null;
  ifscCode: string | null;
  upiId: string | null;
}

/** The stored values: absent parts null, IFSC upper-cased, UPI tidied. */
export function normalizePayoutAccount(
  input: PayoutAccountInput
): PayoutAccountValues {
  const number = input.accountNumber?.trim() ?? "";
  const upi = input.upiId?.trim() ?? "";
  return {
    accountName: input.accountName.trim(),
    accountNumber: number || null,
    ifscCode: number ? (input.ifscCode?.trim().toUpperCase() ?? null) : null,
    upiId: upi ? normalizeUpiHandle(upi) : null,
  };
}

/**
 * Why a new account can't be saved next to the person's others: the same
 * account number or UPI ID is already there. Null when it can.
 */
export function findDuplicatePayout(
  existing: readonly {
    accountNumber: string | null;
    upiId?: string | null;
  }[],
  account: Pick<PayoutAccountValues, "accountNumber" | "upiId">
): { field: "accountNumber" | "upiId"; message: string } | null {
  if (
    account.accountNumber &&
    existing.some((a) => a.accountNumber === account.accountNumber)
  ) {
    return {
      field: "accountNumber",
      message: "This account number is already saved",
    };
  }
  if (account.upiId && existing.some((a) => a.upiId === account.upiId)) {
    return {
      field: "upiId",
      message: "This UPI ID or number is already saved",
    };
  }
  return null;
}

/** The last four digits, or the whole number when shorter. */
export function maskedAccountNumber(accountNumber: string): string {
  return `••••${accountNumber.length >= 4 ? accountNumber.slice(-4) : accountNumber}`;
}

/**
 * A short label for a saved account: the masked number and IFSC, then the
 * whole UPI ID or number (the payee recognises it, and it is short).
 */
export function payoutAccountDetail(account: {
  accountNumber: string | null;
  ifscCode: string | null;
  upiId?: string | null;
}): string {
  const parts: string[] = [];
  if (account.accountNumber) {
    parts.push(
      `${maskedAccountNumber(account.accountNumber)} · ${account.ifscCode ?? ""}`
    );
  }
  if (account.upiId) {
    parts.push(`UPI ${account.upiId}`);
  }
  return parts.join(" · ");
}

/**
 * A copied payout field on a request update: "" clears it (the chosen
 * account doesn't have it), undefined leaves it unchanged.
 */
export function clearable(
  value: string | undefined,
  normalize: (v: string) => string = (v) => v.trim()
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim() ? normalize(value) : null;
}
