import { maskedAccountNumber } from "@pi-dash/shared/payout-account";

interface BankAccountLike {
  accountName: string;
  /** Null parts (no bank details, no UPI) are "" in the form. */
  accountNumber: string | null;
  ifscCode: string | null;
  isDefault: boolean | null;
  upiId?: string | null;
}

/** The request form's copy of a saved account: missing parts as "". */
export function bankAccountFormFields(account: BankAccountLike) {
  return {
    bankAccountIfscCode: account.ifscCode ?? "",
    bankAccountName: account.accountName,
    bankAccountNumber: account.accountNumber ?? "",
    bankAccountUpiId: account.upiId ?? "",
  };
}

/**
 * Whether the form's copied details are this saved account's. Numbers and
 * UPI IDs are unique per person, so the pair names one account.
 */
export function isSameBankAccount(
  account: Pick<BankAccountLike, "accountNumber" | "upiId">,
  current: { accountNumber?: string; upiId?: string }
): boolean {
  return (
    (account.accountNumber ?? "") === (current.accountNumber ?? "") &&
    (account.upiId ?? "") === (current.upiId ?? "")
  );
}

/** The account a new request is paid to unless someone picks another. */
export function defaultBankAccountFor<T extends BankAccountLike>(
  accounts: readonly T[]
): T | undefined {
  return accounts.find((account) => account.isDefault) ?? accounts[0];
}

/**
 * Whether a new request should switch its bank fields to the current
 * default. Accounts sync in after the form mounts, and the default can
 * change while it is open (a cached copy, then the server's), so the
 * default is applied whenever it differs from what the form holds, until
 * the person picks an account themselves.
 */
export function shouldApplyDefaultBankAccount({
  current,
  defaultAccount,
  enabled,
  pickedByUser,
}: {
  current: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
  };
  defaultAccount: BankAccountLike | undefined;
  enabled: boolean;
  pickedByUser: boolean;
}): boolean {
  if (!(enabled && defaultAccount) || pickedByUser) {
    return false;
  }
  return (
    !isSameBankAccount(defaultAccount, current) ||
    current.accountName !== defaultAccount.accountName ||
    (current.ifscCode ?? "") !== (defaultAccount.ifscCode ?? "")
  );
}

/**
 * A saved account in a picker: the last four digits of the bank account and
 * the whole UPI ID or number (it is short and the payee recognises it).
 */
export function bankAccountOptionLabel(account: {
  accountName: string;
  accountNumber: string | null;
  upiId?: string | null;
}): string {
  const parts = [
    account.accountNumber ? maskedAccountNumber(account.accountNumber) : null,
    account.upiId ? `UPI ${account.upiId}` : null,
  ].filter(Boolean);
  return `${account.accountName} (${parts.join(" · ")})`;
}
