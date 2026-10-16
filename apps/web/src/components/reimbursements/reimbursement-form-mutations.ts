import { mutators } from "@pi-dash/zero/mutators";
import type { BankAccount } from "@pi-dash/zero/schema";
import type { useZero } from "@rocicorp/zero/react";

import { chargedToPayload } from "@/components/expenses/charged-to-schema";
import { toLineItemsPayload } from "@/lib/form-schemas";

import {
  bankAccountFormFields,
  isSameBankAccount,
} from "./default-bank-account";
import type { RequestFormValues } from "./form/reimbursement-form.schema";

function requireDate(value: Date | undefined, field: string): number {
  if (!value) {
    throw new Error(`${field} is required`);
  }
  return value.getTime();
}

type BankFieldValues = Pick<
  RequestFormValues,
  | "bankAccountIfscCode"
  | "bankAccountName"
  | "bankAccountNumber"
  | "bankAccountUpiId"
>;

/**
 * The payee details a request sends. A listed saved account sends every
 * part, "" for one it lacks so a part left from the previous account is
 * cleared. Otherwise (an edit whose account was since deleted) only the
 * parts the form holds are sent, and the rest stay as they were.
 */
export function requestBankFields(
  value: BankFieldValues,
  bankAccountList: readonly BankAccount[]
) {
  const selectedAccount = bankAccountList.find((account) =>
    isSameBankAccount(account, {
      accountNumber: value.bankAccountNumber,
      upiId: value.bankAccountUpiId,
    })
  );
  if (selectedAccount) {
    return {
      bankFields: bankAccountFormFields(selectedAccount),
      selectedAccount,
    };
  }
  const bankFields: Partial<BankFieldValues> = {};
  for (const key of [
    "bankAccountIfscCode",
    "bankAccountName",
    "bankAccountNumber",
    "bankAccountUpiId",
  ] as const) {
    if (value[key]) {
      bankFields[key] = value[key];
    }
  }
  return { bankFields, selectedAccount };
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

  const { bankFields, selectedAccount } = requestBankFields(
    value,
    bankAccountList
  );
  const basePayload = {
    attachments,
    // On an event the request takes the event's city, so none is sent.
    costCentreId:
      value.type === "reimbursement" && value.chargedTo === "event"
        ? undefined
        : value.costCentreId || undefined,
    id,
    lineItems,
    title: value.title,
    ...bankFields,
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
