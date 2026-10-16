import {
  findDuplicatePayout,
  normalizePayoutAccount,
  refinePayoutAccount,
} from "@pi-dash/shared/payout-account";
import z from "zod";

export { IFSC_PATTERN } from "@pi-dash/shared/payout-account";

const bankAccountFields = z.object({
  accountName: z.string(),
  accountNumber: z.string(),
  ifscCode: z.string(),
  upiId: z.string(),
});

export type BankAccountFormValues = z.infer<typeof bankAccountFields>;

/**
 * Bank details, a UPI ID or number, or both, with the same rules the server
 * applies. Given the person's saved accounts, a number or UPI ID already
 * among them is refused here, before the server would.
 */
export function createBankAccountSchema(
  existing: readonly { accountNumber: string | null; upiId: string | null }[]
) {
  return bankAccountFields.superRefine((value, context) => {
    refinePayoutAccount(value, context);
    const duplicate = findDuplicatePayout(
      existing,
      normalizePayoutAccount(value)
    );
    if (duplicate) {
      context.addIssue({
        code: "custom",
        message: duplicate.message,
        path: [duplicate.field],
      });
    }
  });
}

export const bankAccountSchema = createBankAccountSchema([]);
