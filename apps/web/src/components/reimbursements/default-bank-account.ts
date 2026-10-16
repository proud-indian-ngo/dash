interface BankAccountLike {
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  isDefault: boolean | null;
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
  current: { accountName?: string; accountNumber?: string; ifscCode?: string };
  defaultAccount: BankAccountLike | undefined;
  enabled: boolean;
  pickedByUser: boolean;
}): boolean {
  if (!(enabled && defaultAccount) || pickedByUser) {
    return false;
  }
  return (
    current.accountNumber !== defaultAccount.accountNumber ||
    current.accountName !== defaultAccount.accountName ||
    current.ifscCode !== defaultAccount.ifscCode
  );
}
