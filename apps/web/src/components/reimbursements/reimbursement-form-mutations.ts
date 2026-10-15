import { mutators } from "@pi-dash/zero/mutators";
import type { BankAccount } from "@pi-dash/zero/schema";
import type { useZero } from "@rocicorp/zero/react";

import { chargedToPayload } from "@/components/expenses/charged-to-schema";
import { toLineItemsPayload } from "@/lib/form-schemas";

import type { RequestFormValues } from "./form/reimbursement-form.schema";

function requireDate(value: Date | undefined, field: string): number {
  if (!value) {
    throw new Error(`${field} is required`);
  }
  return value.getTime();
}

export function buildMutation(
  zero: ReturnType<typeof useZero>,
  value: RequestFormValues,
  entityId: string,
  existingId: string | undefined,
  bankAccountList: BankAccount[],
  voucherLimitPaise: number,
  /** Set when finance raises a new reimbursement for someone else. */
  claimantUserId?: string
) {
  // Only reimbursements carry cash vouchers.
  const lineItems = toLineItemsPayload(
    value.lineItems,
    value.type === "reimbursement" ? voucherLimitPaise : undefined
  );
  const { attachments } = value;
  const id = existingId ?? entityId;

  const selectedAccount = bankAccountList.find(
    (account) => account.accountNumber === value.bankAccountNumber
  );
  const basePayload = {
    attachments,
    city: value.city,
    id,
    lineItems,
    title: value.title,
    ...((selectedAccount?.ifscCode ?? value.bankAccountIfscCode)
      ? {
          bankAccountIfscCode:
            selectedAccount?.ifscCode ?? value.bankAccountIfscCode,
        }
      : {}),
    ...(value.bankAccountName
      ? { bankAccountName: value.bankAccountName }
      : {}),
    ...(value.bankAccountNumber
      ? { bankAccountNumber: value.bankAccountNumber }
      : {}),
  };

  if (value.type === "reimbursement") {
    const reimbPayload = {
      ...basePayload,
      expenseDate: requireDate(value.expenseDate, "expenseDate"),
      ...chargedToPayload(value),
    };
    if (existingId) {
      return zero.mutate(mutators.reimbursement.update(reimbPayload));
    }
    // For someone else the server copies the chosen account's details.
    return zero.mutate(
      mutators.reimbursement.create(
        claimantUserId
          ? {
              ...reimbPayload,
              claimantBankAccountId: selectedAccount?.id,
              claimantUserId,
            }
          : reimbPayload
      )
    );
  }

  return existingId
    ? zero.mutate(mutators.advancePayment.update(basePayload))
    : zero.mutate(mutators.advancePayment.create(basePayload));
}
