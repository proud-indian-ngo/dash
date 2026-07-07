import { mutators } from "@pi-dash/zero/mutators";
import type { BankAccount } from "@pi-dash/zero/schema";
import type { useZero } from "@rocicorp/zero/react";
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
  bankAccountList: BankAccount[]
) {
  const lineItems = value.lineItems.map((item: any, index: any) => ({
    ...item,
    amount: Number(item.amount),
    sortOrder: index,
  }));
  const { attachments } = value;
  const id = existingId ?? entityId;

  const selectedAccount = bankAccountList.find(
    (account: any) => account.accountNumber === value.bankAccountNumber
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
      ...(value.eventId ? { eventId: value.eventId } : {}),
    };
    return existingId
      ? zero.mutate(mutators.reimbursement.update(reimbPayload))
      : zero.mutate(mutators.reimbursement.create(reimbPayload));
  }

  return existingId
    ? zero.mutate(mutators.advancePayment.update(basePayload))
    : zero.mutate(mutators.advancePayment.create(basePayload));
}
